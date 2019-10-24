const u = require('./u')
const DBObject = require('./DBObject')
const DynamoClient = require('./DynamoClient')
const S3Client = require('./S3Client')
const ScanQuery = require('./ScanQuery')

class DBObjectHandler {
    constructor({awsAccessKeyId, awsSecretAccessKey, awsRegion, tableName, bucketName, subclass, isTimeOrdered, seriesKey, defaultCacheSize, doNotCache}) {
        this.awsAccessKeyId = awsAccessKeyId
        this.awsSecretAccessKey = awsSecretAccessKey
        this.awsRegion = awsRegion || 'us-east-2'
        this.tableName = tableName
        this.bucketName = bucketName
        this.Subclass = subclass || DBObject
        this.isTimeOrdered = isTimeOrdered
        this.seriesKey = seriesKey
        this.defaultCacheSize = defaultCacheSize || u.DEFAULT_CACHE_SIZE
        this.doNotCache = doNotCache

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

    async createObject({id, data, allowOverwrite, sensitivity}) {
        allowOverwrite = allowOverwrite || false
        id = id || this.seriesKey
        let dbobject = new this.Subclass({
            id: id,
            dynamoClient: this.dynamoClient,
            s3Client: this.s3Client,
            tableName: this.tableName,
            isTimeOrdered: this.isTimeOrdered
        })
        await dbobject.create({data, allowOverwrite, sensitivity})
        return dbobject
    }

    // TODO: like create, except create ID on the basis of SK/path
    async addObject() {}

    async destroyObject({id, confirm}) {
        let dbobject = new this.Subclass({
            id: id,
            dynamoClient: this.dynamoClient,
            tableName: this.tableName
        })
        return await dbobject.destroy(confirm)
    }

    async getObject({id, returnData, attributes, user, permission}) {
        let dbobject = new this.Subclass({
            id: id,
            dynamoClient: this.dynamoClient,
            tableName: this.tableName
        })

        // Return some data, all data, or just the dbobject
        if (attributes) {
            return await dbobject.batchGet({attributes, user, permission})
        } else if (returnData && !attributes) {
            return await dbobject.get({user, permission})
        } else  {
            return dbobject
        }
    }

    // Instantiates without hitting db
    instantiate({id, ids}) {
    
        // Single case
        if (id) {
            let dbobject = new this.Subclass({
                id: id,
                dynamoClient: this.dynamoClient,
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
                tableName: this.tableName
            })
        })
        return dbobjects
    }

    async getObjects({limit, ascending, attributes, returnData, exclusiveFirstTimestamp, permission, user}={}) {
        ascending = ascending || false
        limit = limit || 10000

        exclusiveFirstTimestamp = exclusiveFirstTimestamp || this.exclusiveStartTimestamp
        let data = await this.batchGetObjectsByPage({limit, ascending, exclusiveFirstTimestamp})
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
    
    async batchGetObjectsByPage({seriesKey, limit, ascending, exclusiveFirstTimestamp, attributes, returnData, idOnly, user, permission}) {
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
        return await this._objectsOrDataFromRaw(allObjectData, attributes, idOnly, user, permission)
    }

    resetPage() {this.exclusiveStartTimestamp = null}
    
    async batchGetObjectsByTime({startTime, endTime, ascending, attributes, returnData, user, permission}) {
        if (!this.isTimeOrdered) {throw new Error('this method is only applicable on timeOrdered DBObjects')}
        let allObjectData = await this.dynamoClient.getRange({
            tableName: this.tableName,
            uid: this.seriesKey,
            startTime, 
            endTime,
            ascending
        })
        if (returnData && !attributes) {attributes = true}
        return await this._objectsOrDataFromRaw(allObjectData, attributes, user, permission)
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
    async scan({params, param, value, attributes, query, returnData, idOnly, user, permission}) {
        
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
            params.forEach(item => {
                query.addParam({
                    param: item[0],
                    message: item[1],
                    value: item[2],
                    operator: lastOperator
                })
                lastOperator = item[3]
            })
        }

        if (this.seriesKey) {
            query.addParam({
                param: u.PK,
                message: '=',
                value: this.seriesKey,
                operator: 'AND'
            })
        }

        let data = await this.dynamoClient.scan(query)
        if (returnData && !attributes) {attributes = true}
        return await this._objectsOrDataFromRaw(data, attributes, idOnly, user, permission)
    }

    // Processes raw data returned from dynamo into multiple objects, optionally extracting some or all data
    async _objectsOrDataFromRaw(raw, attributes, idOnly, user, permission) {
        let dbobjects = []
        raw.forEach(data => {
            let id = data[u.PK] + '-' + data[u.SK]
            let encodedIndex = data[u.INDEX_KEY]
            delete data[u.INDEX_KEY]
            delete data[u.PK]
            delete data[u.SK]
            
            // dbobjects.push(new DBObject({
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
        if (attributes) {return await this.getAttributesFromObjects(attributes, dbobjects, user, permission)}
        return dbobjects
    }

    // Extracts specified attributes. Pass "true" for all
    async getAttributesFromObjects(attributes, dbobjects, user, permission) {
        let data = []
        for (let i = 0; i < dbobjects.length; i++) {
            let dbobject = dbobjects[i]   
            let obj = {}
            if (attributes === true) {
                obj = await dbobject.get({user, permission})
            } else {
                for (let j = 0; j < attributes.length; j++) {
                    let attribute = attributes[j]
                    obj[attribute] = await dbobject.get({path: attribute, user, permission})
                    obj.id = dbobject.id
                }
            }
            data.push(obj)
        }
        return data
    }



}

module.exports = DBObjectHandler