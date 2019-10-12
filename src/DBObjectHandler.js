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
        this.subclass = subclass
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

    async createObject({id, data, allowOverwrite, permission}) {
        allowOverwrite = allowOverwrite || false
        id = id || this.seriesKey
        let dbobject = new DBObject(id, {
            dynamoClient: this.dynamoClient,
            s3Client: this.s3Client,
            tableName: this.tableName,
            isTimeOrdered: this.isTimeOrdered
        })
        await dbobject.create(data, {allowOverwrite, permission})
        return dbobject
    }

    async destroyObject({id, confirm}) {
        let dbobject = new DBObject(id, {
            dynamoClient: this.dynamoClient,
            tableName: this.tableName
        })
        return await dbobject.destroy(confirm)
    }

    async getObject({id, returnData, attributes}) {
        let dbobject = new DBObject(id, {
            dynamoClient: this.dynamoClient,
            tableName: this.tableName
        })

        // Return some data, all data, or just the dbobject
        if (attributes) {
            return await dbobject.batchGet(attributes)
        } else if (returnData) {
            return await dbobject.get()
        } else  {
            return dbobject
        }
    }

    // Doesn't load anything yet
    async batchGetObjectsByID(ids) {
        let dbobjects = {}
        ids.forEach(id => {
            dbobjects[id] = new DBObject(id, {
                dynamoClient: this.dynamoClient,
                tableName: this.tableName
            })
        })
        return dbobjects
    }

    async getPagewise({limit, ascending, attributes, returnData, exclusiveFirstTimestamp}) {
        ascending = ascending || false
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
            let ret = await data[i].get(attributes)
            raw.push(ret)
        }
        return raw

    }
    
    async batchGetObjectsByPage({seriesKey, limit, ascending, exclusiveFirstTimestamp, attributes, returnData, idOnly}) {
        if (returnData) {attributes = true}
        if (exclusiveFirstTimestamp) {exclusiveFirstTimestamp = Number(exclusiveFirstTimestamp)}

        if (!this.isTimeOrdered) {throw new Error('this method is only applicable on timeOrdered DBObjects')}
        let allObjectData = await this.dynamoClient.getPagewise({
            tableName: this.tableName,
            uid: seriesKey || this.seriesKey,
            limit,
            ascending,
            exclusiveFirstSk: exclusiveFirstTimestamp
        })
        return await this._objectsOrDataFromRaw(allObjectData, attributes, idOnly)
    }

    resetPage() {this.exclusiveStartTimestamp = null}
    
    async batchGetObjectsByTime({startTime, endTime, ascending, attributes, returnData}) {
        if (!this.isTimeOrdered) {throw new Error('this method is only applicable on timeOrdered DBObjects')}
        let allObjectData = await this.dynamoClient.getRange({
            tableName: this.tableName,
            uid: this.seriesKey,
            startTime, 
            endTime,
            ascending
        })
        if (returnData) {attributes = true}
        return await this._objectsOrDataFromRaw(allObjectData, attributes)
    }

    // Pass a single path and value, or else a completed ScanQuery object
    async scan({param, value, attributes, query}) {
        if (!query) {
            param = u.packKeys(param)
            query = new ScanQuery(this.tableName)
            query.addParam({
                param: param, 
                value: value, 
                message: '='
            })
        }
        let data = await this.dynamoClient.scan(query)
        return await this._objectsOrDataFromRaw(data, attributes)
    }

    // Processes raw data returned from dynamo into multiple objects, optionally extracting some or all data
    async _objectsOrDataFromRaw(raw, attributes, idOnly) {
        let dbobjects = []
        raw.forEach(data => {
            let id = data[u.PK] + '-' + data[u.SK]
            let encodedIndex = data[u.INDEX_KEY]
            delete data[u.INDEX_KEY]
            delete data[u.PK]
            delete data[u.SK]
            
            dbobjects.push(new DBObject(id, {
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
        if (attributes) {return await this.getAttributesFromObjects(attributes, dbobjects)}
        return dbobjects
    }

    // Extracts specified attributes. Pass "true" for all
    async getAttributesFromObjects(attributes, dbobjects) {
        let data = []
        for (let i = 0; i < dbobjects.length; i++) {
            let dbobject = dbobjects[i]   
            let obj = {}
            if (attributes === true) {
                obj = await dbobject.get()
            } else {
                for (let j = 0; j < attributes.length; j++) {
                    let attribute = attributes[j]
                    obj[attribute] = await dbobject.get(attribute)
                }
            }
            data.push(obj)
        }
        return data
    }



}

module.exports = DBObjectHandler