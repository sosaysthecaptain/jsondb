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

    async createObject(id, initialData={}, allowOverwrite=false) {
        let dbobject = new DBObject(id, {
            dynamoClient: this.dynamoClient,
            s3Client: this.s3Client,
            tableName: this.tableName,
            isTimeOrdered: this.isTimeOrdered
        })
        await dbobject.create(initialData, {allowOverwrite})
        return dbobject
    }

    async deleteObject(id, confirm) {
        let dbobject = new DBObject(id, {
            dynamoClient: this.dynamoClient,
            tableName: this.tableName
        })
        return await dbobject.destroy(confirm)
    }

    async getObject(id, loadIndex) {
        let dbobject = new DBObject(id, {
            dynamoClient: this.dynamoClient,
            tableName: this.tableName
        })
        if (loadIndex) {
            await dbobject.loadIndex()
        }
        return dbobject
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
    
    async batchGetObjectsByTime({seriesKey, startTime, endTime, ascending, attributes, returnData}) {
        if (returnData) {attributes = true}
        if (!this.isTimeOrdered) {throw new Error('this method is only applicable on timeOrdered DBObjects')}
        let allObjectData = await this.dynamoClient.getRange({
            tableName: this.tableName,
            uid: seriesKey || this.seriesKey,
            startTime, 
            endTime,
            ascending
        })
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