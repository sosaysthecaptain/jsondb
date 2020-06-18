const u = require('./u')
const DBObject = require('./DBObject')
const DynamoClient = require('./DynamoClient')
const S3Client = require('./S3Client')
const ScanQuery = require('./ScanQuery')

class DBObjectHandler {
    constructor({
        awsAccessKeyId, 
        awsSecretAccessKey, 
        awsRegion, 
        tableName, 
        bucketName, 
        subclass, 
        isTimeOrdered, 
        seriesKey,                  // Common UID for collections
        indexName,                  // optional, GSIs only
        partitionKey,               // optional, GSIs only
        sortKey,                    // optional, GSIs only
        defaultCacheSize, 
        doNotCache, 
        humanReadable,
        credentials
    }) {
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
        this.credentials = credentials || {permission: u.DEFAULT_PERMISSION}
        if (humanReadable) {u.HUMAN_READABLE = true}

        this.indexName = indexName
        this.partitionKey = partitionKey || u.PK
        this.sortKey = sortKey || u.SK

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

    // Note: credentials are only to instantiate object with, they are not necessary for the create operation
    async createObject({id, data, creator, members, allowOverwrite, overrideTimestamp, sensitivity, objectPermission, credentials}) {
        credentials = credentials || this.credentials   
        allowOverwrite = allowOverwrite || false
        
        id = id || this.seriesKey
        let dbobject = new this.Subclass({
            id: id,
            dynamoClient: this.dynamoClient,
            s3Client: this.s3Client,
            tableName: this.tableName,
            isTimeOrdered: this.isTimeOrdered,
            overrideTimestamp: overrideTimestamp
        })
        await dbobject.create({
            data, 
            creator, 
            members, 
            allowOverwrite, 
            sensitivity, 
            objectPermission,
            credentials
        })
        return dbobject
    }

    async destroyObject({id, confirm, credentials}) {
        credentials = credentials || this.credentials

        let dbobject = new this.Subclass({
            id: id,
            dynamoClient: this.dynamoClient,
            s3Client: this.s3Client,
            tableName: this.tableName
        })
        return await dbobject.destroy({confirm, credentials})
    }

    async getObject({id, ids, returnData, attributes, includeID, credentials}) {
        credentials = credentials || this.credentials

        if (ids) {
            return this.batchGet({ids, attributes, returnData, includeID, credentials})
        }

        let dbobject = new this.Subclass({
            id: id,
            dynamoClient: this.dynamoClient,
            tableName: this.tableName
        })

        // Return some data, all data, or just the dbobject
        if (attributes) {
            return await dbobject.batchGet({paths: attributes, credentials})
        } else if (returnData && !attributes) {
            return await dbobject.get({credentials})
        } else  {
            return dbobject
        }
    }

    // Gets specified data from a number of SIMPLE dbobjects at once
    // Bypasses the index
    async batchGet({ids, attributes, returnData, includeID, credentials}) {
        credentials = credentials || this.credentials   

        // ids -> dynamo keys
        let keys = []
        ids.forEach(id=>{
            keys.push(u.keyFromID(id))
        })

        // paths -> packed paths
        if (attributes) {
            attributes = u.packKeys(attributes)
            attributes.push(this.partitionKey)
            attributes.push(this.sortKey)
        }

        let data = await this.dynamoClient.batchGet({
            attributes, keys,
            tableName: this.tableName,
            credentials
        })

        if (returnData) {attributes = true}
        let ret = await this._objectsOrDataFromRaw({
            raw: data, 
            attributes, 
            returnData, 
            credentials,
            includeID
        }).catch(err=> {})
        return ret
    }

    // Instantiates without hitting db
    instantiate({id, ids, credentials}) {
        // Single case
        if (id) {
            let dbobject = new this.Subclass({
                id: id,
                dynamoClient: this.dynamoClient,
                s3Client: this.s3Client,
                tableName: this.tableName,
                credentials: credentials || this.credentials   
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

    async getObjects({limit, ascending, attributes, returnData, exclusiveFirstTimestamp, includeID, credentials}={}) {
        credentials = credentials || this.credentials
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
            let ret = await dbobject.get({attributes, credentials})
            raw.push(ret)
        }
        return raw
    }
    
    async batchGetObjectsByPage({seriesKey, limit, ascending, exclusiveFirstTimestamp, attributes, returnData, idOnly, includeID, credentials}) {
        credentials = credentials || this.credentials   

        if (returnData && !attributes) {attributes = true}
        if (exclusiveFirstTimestamp) {exclusiveFirstTimestamp = Number(exclusiveFirstTimestamp)}

        if (!this.isTimeOrdered) {throw new Error('this method is only applicable on timeOrdered DBObjects')}
        let allObjectData = await this.dynamoClient.getObjects({
            tableName: this.tableName,
            indexName: this.indexName,
            partitionKey: this.partitionKey,
            sortKey: this.sortKey,
            uid: seriesKey || this.seriesKey,
            limit,
            ascending,
            exclusiveFirstSk: exclusiveFirstTimestamp,
            credentials
        })
        return await this._objectsOrDataFromRaw({raw: allObjectData, attributes, returnData, idOnly, includeID, credentials})
    }

    resetPage() {this.exclusiveStartTimestamp = null}
    
    async batchGetObjectsByTime({seriesKey, startTime, endTime, ascending, attributes, returnData, includeID, credentials}) {
        credentials = credentials || this.credentials   
        
        if (!this.isTimeOrdered) {throw new Error('this method is only applicable on timeOrdered DBObjects')}
        let allObjectData = await this.dynamoClient.getRange({
            tableName: this.tableName,
            indexName: this.indexName,
            partitionKey: this.partitionKey,
            sortKey: this.sortKey,
            uid: seriesKey || this.seriesKey,
            startTime, 
            endTime,
            ascending
        })
        if (returnData && !attributes) {attributes = true}
        return await this._objectsOrDataFromRaw({raw: allObjectData, attributes, returnData, includeID, credentials})
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
    Available operators: = | CONTAINS | INTERSECTS

    gsi = {
        indexName: 'tableSecondaryIndex',
        partitionKey: 'insteadOfUID',
        sortKey: 'insteadOfTimestamp'
    }
    */
    async scan({
        params, 
        param, 
        value, 
        attributes, 
        query, 
        returnData, 
        idOnly, 
        includeID,
        credentials
    }) {
        credentials = credentials || this.credentials   
        
        // (2)
        if (!query && !params) {
            param = u.packKeys(param)
            query = new ScanQuery(this.tableName, this.partitionKey, this.sortKey)
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
            query = new ScanQuery(this.tableName, this.partitionKey, this.sortKey)
            let addParamToQuery = (item, index, ofTotal) => {
                query.addParam({
                    param: item[0],
                    message: item[1],
                    value: item[2],
                    operator: lastOperator,
                    openParen: index === 0,
                    closeParen: index === ofTotal - 1
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
                        addParamToQuery(subItem, i, value.length)
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
            data = await this.dynamoClient.query({
                scanQueryInstance: query, 
                seriesKey: this.seriesKey,
                indexName: this.indexName,
                partitionKey: this.partitionKey
            })
        } else {
            data = await this.dynamoClient.scan(query)
        }

        
        if (returnData && !attributes) {attributes = true}
        return await this._objectsOrDataFromRaw({raw: data, attributes, returnData, idOnly, includeID, credentials})
    }

    // Processes raw data returned from dynamo into multiple objects, optionally extracting some or all data
    // Note that for the sake of permission we go through DBObjects in all cases
    async _objectsOrDataFromRaw({raw, attributes, returnData, idOnly, includeID, credentials}) {
        credentials = credentials || this.credentials   
        
        // Make DBObjects
        let dbobjects = []
        raw.forEach(data => {
            let id = data[u.PK] + '-' + data[u.SK]
            let encodedIndex = data[u.INDEX_KEY]
            delete data[u.INDEX_KEY]
            delete data[this.partitionKey]
            delete data[this.sortKey]
            
            
            dbobjects.push(new this.Subclass({
                id: id,
                tableName: this.tableName,
                dynamoClient: this.dynamoClient,
                isTimeOrdered: true,
                encodedIndex,
                data,
                credentials
            }))
        })
        if (idOnly) {
            let ids = []
            dbobjects.forEach(obj => {ids.push(obj.id)})
            return ids
        }
        if (returnData) {attributes = true}
        if (attributes) {return await this.getAttributesFromObjects(attributes, dbobjects, includeID, credentials)}
        return dbobjects
    }

    // Extracts specified attributes. Pass "true" for all
    async getAttributesFromObjects(attributes, dbobjects, includeID, credentials) {
        credentials = credentials || this.credentials   

        let data = []
        for (let i = 0; i < dbobjects.length; i++) {
            let dbobject = dbobjects[i]   
            let obj = {}
            if (attributes === true) {
                obj = await dbobject.get({credentials})
                let timestamp = dbobject.timestamp()
                if (timestamp) {obj.timestamp = timestamp}
                if (includeID) {obj.id = dbobject.id}
            } else {
                for (let j = 0; j < attributes.length; j++) {
                    let attribute = attributes[j]
                    attribute = u.unpackKeys(attribute)
                    if ((attribute !== this.partitionKey) && (attribute !== u.SK) && (attribute !== u.INDEX_KEY)) {
                        obj[attribute] = await dbobject.get({path: attribute, credentials})
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
