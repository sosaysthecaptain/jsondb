const u = require('./u')
const DBObject = require('./DBObject')
const DynamoClient = require('./DynamoClient')
const S3Client = require('./S3Client')
const ScanQuery = require('./ScanQuery')

class DBObjectHandler {
    constructor({awsAccessKeyId, awsSecretAccessKey, awsRegion, tableName, bucketName, subclass, isTimeOrdered, seriesKey, defaultCacheSize, doNotCache, permission, userPermission, humanReadable}) {
        this.awsAccessKeyId = awsAccessKeyId
        this.awsSecretAccessKey = awsSecretAccessKey
        this.awsRegion = awsRegion || 'us-east-2'
        this.tableName = tableName
        this.bucketName = bucketName
        this.Subclass = subclass || DBObject
        this.isTimeOrdered = isTimeOrdered
        this.seriesKey = seriesKey
        this.defaultCacheSize = defaultCacheSize || u.DEFAULT_CACHE_SIZE
        this.doNotCache = doNotCache || true
        this.permission = permission || {read: 0, write: 0}
        this.userPermission = userPermission || {read: 0, write: 0}
        if (humanReadable) {u.HUMAN_READABLE = true}

        this.lastTimestampsByPath = {}
        
        if (seriesKey) {this.isTimeOrdered = true}

        this.dynamoClient = new DynamoClient({
            awsAccessKeyId: this.awsAccessKeyId,
            awsSecretAccessKey: this.awsSecretAccessKey,
            awsRegion: this.awsRegion
        })
        this.s3Client = new S3Client({
            awsAccessKeyId: this.awsAccessKeyId,
            awsSecretAccessKey: this.awsSecretAccessKey,
            awsRegion: this.awsRegion,
            bucketName: this.bucketName
        })
    }

    permissionCheck(write) {
        if (write) {
            if (this.userPermission.write >= this.permission.write) {return true}
        } else {
            if (this.userPermission.read >= this.permission.read) {return true}
        }
        return false
    }

    async createObject({id, data, creator, members, allowOverwrite, sensitivity}) {
        if (!this.permissionCheck(true)) {return undefined}
        allowOverwrite = allowOverwrite || false
        id = id || this.seriesKey
        let dbobject = new this.Subclass({
            id: id,
            dynamoClient: this.dynamoClient,
            s3Client: this.s3Client,
            tableName: this.tableName,
            isTimeOrdered: this.isTimeOrdered
        })
        await dbobject.create({data, creator, members, allowOverwrite, sensitivity})
        return dbobject
    }

    // TODO: like create, except create ID on the basis of SK/path
    async addObject() {}

    async destroyObject({id, user, confirm, permissionOverride}) {
        if (!this.permissionCheck(true)) {return undefined}
        let dbobject = new this.Subclass({
            id: id,
            dynamoClient: this.dynamoClient,
            tableName: this.tableName
        })
        if (permissionOverride) {user = undefined}
        return await dbobject.destroy({user, permissionOverride, confirm})
    }

    async getObject({id, returnData, attributes, user, permission}) {
        if (!this.permissionCheck()) {return undefined}
        let dbobject = new this.Subclass({
            id: id,
            dynamoClient: this.dynamoClient,
            tableName: this.tableName
        })

        // Return some data, all data, or just the dbobject
        if (attributes) {
            return await dbobject.batchGet({paths: attributes, user, permission})
        } else if (returnData && !attributes) {
            return await dbobject.get({user, permission})
        } else  {
            return dbobject
        }
    }

    // Gets specified data from a number of SIMPLE dbobjects at once
    // Bypasses the index
    async batchGet({ids, user, permission, attributes, returnData, includeID}) {
        if (!this.permissionCheck()) {return undefined}

        // ids -> dynamo keys
        let keys = []
        ids.forEach(id=>{
            keys.push(u.keyFromID(id))
        })

        // paths -> packed paths
        if (attributes) {
            attributes.push(u.PK)
            attributes.push(u.SK)
            attributes = u.packKeys(attributes)
        }

        let data = await this.dynamoClient.batchGet({
            attributes, keys,
            tableName: this.tableName
        })

        if (returnData) {attributes = true}
        let ret = await this._objectsOrDataFromRaw({
            raw: data, 
            attributes, 
            returnData, 
            user, 
            permission, 
            includeID
        }).catch(err=> {debugger})
        return ret
    }

    // Instantiates without hitting db
    instantiate({id, ids}) {
        if (!this.permissionCheck()) {return undefined}
    
        // Single case
        if (id) {
            let dbobject = new this.Subclass({
                id: id,
                dynamoClient: this.dynamoClient,
                s3Client: this.s3Client,
                tableName: this.tableName
            })
            return dbobject
        }

        // Multiple case
        let dbobjects = {}
        ids.forEach(id => {
            dbobjects[id] = new this.Subclass({
                id: id,
                dynamoClient: this.dynamoClient,
                s3Client: this.s3Client,
                tableName: this.tableName
            })
        })
        return dbobjects
    }

    async getObjects({limit, ascending, attributes, returnData, exclusiveFirstTimestamp, permission, user, includeID}={}) {
        if (!this.permissionCheck()) {return undefined}
        ascending = ascending || false
        limit = limit || 10000

        exclusiveFirstTimestamp = exclusiveFirstTimestamp || this.exclusiveStartTimestamp
        let data = await this.batchGetObjectsByPage({limit, ascending, exclusiveFirstTimestamp, includeID})
        // Figure out what the last timestamp was and store it
        if (data.length) {
            this.exclusiveStartTimestamp = data[data.length-1].timestamp()

        } else {
            this.resetPage()
            return []
        }

        // If the user just wanted dbobjects, return that now
        if (!attributes && !returnData) {
            return data
        } 
        
        // Otherwise, retrieve user's requested data
        let raw = []
        if (returnData) {attributes = undefined}
        for (let i = 0; i < data.length; i++) {
            let dbobject = data[i]
            let ret = await dbobject.get({attributes, user, permission})
            raw.push(ret)
        }
        return raw
    }
    
    async batchGetObjectsByPage({seriesKey, limit, ascending, exclusiveFirstTimestamp, attributes, returnData, idOnly, user, permission, includeID}) {
        if (!this.permissionCheck()) {return undefined}
        if (returnData && !attributes) {attributes = true}
        if (exclusiveFirstTimestamp) {exclusiveFirstTimestamp = Number(exclusiveFirstTimestamp)}

        if (!this.isTimeOrdered) {throw new Error('this method is only applicable on timeOrdered DBObjects')}
        let allObjectData = await this.dynamoClient.getObjects({
            tableName: this.tableName,
            uid: seriesKey || this.seriesKey,
            limit,
            ascending,
            exclusiveFirstSk: exclusiveFirstTimestamp
        })
        return await this._objectsOrDataFromRaw({raw: allObjectData, attributes, returnData, idOnly, user, permission, includeID})
    }

    resetPage() {this.exclusiveStartTimestamp = null}
    
    async batchGetObjectsByTime({startTime, endTime, ascending, attributes, returnData, user, permission, includeID}) {
        if (!this.permissionCheck()) {return undefined}
        if (!this.isTimeOrdered) {throw new Error('this method is only applicable on timeOrdered DBObjects')}
        let allObjectData = await this.dynamoClient.getRange({
            tableName: this.tableName,
            uid: this.seriesKey,
            startTime, 
            endTime,
            ascending
        })
        if (returnData && !attributes) {attributes = true}
        return await this._objectsOrDataFromRaw({raw: allObjectData, attributes, returnData, user, permission, includeID})
    }

    // Pass a single path and value, or else a completed ScanQuery object
    /*
    Three modes of use:
        1) query: <ScanQuery>
        2) param: 'name', value: 'joe'
        3) params: [
            ['name', '=', 'joe', 'AND'],
            ['friends', 'contains', 'danny']
        ]
    */
   // EQ | NE | LE | LT | GE | GT | NOT_NULL | NULL | CONTAINS | NOT_CONTAINS | BEGINS_WITH | IN | BETWEEN
    async scan({params, param, value, attributes, query, returnData, idOnly, user, permission, includeID}) {
        if (!this.permissionCheck()) {return undefined}
        
        // (2)
        if (!query && !params) {
            param = u.packKeys(param)
            query = new ScanQuery(this.tableName)
            query.addParam({
                param: param, 
                value: value, 
                message: '='
            })
        }

        // (3)
        if (params) {
            
            let lastOperator = null
            params.forEach(param => {
                param[0] = u.packKeys(param[0])
            })
            query = new ScanQuery(this.tableName)
            let addParamToQuery = (item) => {
                query.addParam({
                    param: item[0],
                    message: item[1],
                    value: item[2],
                    operator: lastOperator
                })                
                lastOperator = item[3]
            }
            
            // Add params. "INTERSECTS" is represented as a series of "CONTAINS" params.
            params.forEach(item => {
                if (item[1] === 'INTERSECTS') {
                    let value = item[2]
                    for (let i = 0; i < value.length; i++) {
                        let val = value[i]
                        let subItem = []
                        subItem.push(item[0])
                        subItem.push('contains')
                        subItem.push(val)
                        if (i+1 !== value.length) {
                            subItem.push('OR')
                        } else {
                            subItem.push(item[3])
                        }
                        addParamToQuery(subItem)
                    }
                }
                
                else {
                    addParamToQuery(item)
                }
            })
        }

        // What data to get: everything / only some things / only PK/SK
        if (attributes) {
            attributes = u.packKeys(attributes)
            query.addAttributes(attributes)
        } else if (returnData) {
            query.addAttributes([])
        }

        // If this is a collection, the scan is actually a query
        let data
        if (this.isTimeOrdered) {
            data = await this.dynamoClient.query(query, this.seriesKey)
        } else {
            data = await this.dynamoClient.scan(query)
        }

        
        if (returnData && !attributes) {attributes = true}
        return await this._objectsOrDataFromRaw({raw: data, attributes, returnData, idOnly, user, permission, includeID})
    }

    // Processes raw data returned from dynamo into multiple objects, optionally extracting some or all data
    // Note that for the sake of permission we go through DBObjects in all cases
    async _objectsOrDataFromRaw({raw, attributes, returnData, idOnly, user, permission, includeID}) {
        
        // Make DBObjects
        let dbobjects = []
        raw.forEach(data => {
            let id = data[u.PK] + '-' + data[u.SK]
            let encodedIndex = data[u.INDEX_KEY]
            delete data[u.INDEX_KEY]
            delete data[u.PK]
            delete data[u.SK]
            
            
            dbobjects.push(new this.Subclass({
                id: id,
                tableName: this.tableName,
                dynamoClient: this.dynamoClient,
                isTimeOrdered: true,
                encodedIndex,
                data
            }))
        })
        if (idOnly) {
            let ids = []
            dbobjects.forEach(obj => {ids.push(obj.id)})
            return ids
        }
        if (returnData) {attributes = true}
        if (attributes) {return await this.getAttributesFromObjects(attributes, dbobjects, user, permission, includeID)}
        return dbobjects
    }

    // Extracts specified attributes. Pass "true" for all
    async getAttributesFromObjects(attributes, dbobjects, user, permission, includeID) {
        let data = []
        for (let i = 0; i < dbobjects.length; i++) {
            let dbobject = dbobjects[i]   
            let obj = {}
            if (attributes === true) {
                obj = await dbobject.get({user, permission})
                let timestamp = dbobject.timestamp()
                if (timestamp) {obj.timestamp = timestamp}
                if (includeID) {obj.id = dbobject.id}
            } else {
                for (let j = 0; j < attributes.length; j++) {
                    let attribute = attributes[j]
                    attribute = u.unpackKeys(attribute)
                    if ((attribute !== u.PK) && (attribute !== u.SK) && (attribute !== u.INDEX_KEY)) {
                        obj[attribute] = await dbobject.get({path: attribute, user, permission})
                    }
                }
                obj.id = dbobject.id
                let timestamp = dbobject.timestamp()
                if (timestamp) {obj.timestamp = timestamp}
                if (includeID) {obj.id = dbobject.id}
            }
            if (obj) {data.push(obj)}
        }

        return data
    }



}

module.exports = DBObjectHandler