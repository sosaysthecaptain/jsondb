let uuid = require('uuid')

const u = require('./u')
let DBObject = require('./DBObject')
let DynamoClient = require('./DynamoClient')

class DBObjectHandler {
    constructor({awsAccessKeyId, awsSecretAccessKey, awsRegion, tableName, subclass, isTimeOrdered, seriesKey, defaultCacheSize}) {
        this.awsAccessKeyId = awsAccessKeyId
        this.awsSecretAccessKey = awsSecretAccessKey
        this.awsRegion = awsRegion || 'us-east-2'
        this.tableName = tableName
        this.subclass = subclass
        this.isTimeOrdered = isTimeOrdered
        this.seriesKey = seriesKey
        this.defaultCacheSize = defaultCacheSize || u.DEFAULT_CACHE_SIZE
        if (seriesKey) {this.isTimeOrdered = true}

        this.dynamoClient = new DynamoClient({
            awsAccessKeyId: this.awsAccessKeyId,
            awsSecretAccessKey: this.awsSecretAccessKey,
            awsRegion: this.awsRegion
        })
    }

    async createObject(id, initialData={}, allowOverwrite=false) {
        let dbobject = new DBObject(id, {
            dynamoClient: this.dynamoClient,
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
    async batchGetObjectByID(ids) {
        let dbobjects = {}
        ids.forEach(id => {
            dbobjects[id] = new DBObject(id, {
                dynamoClient: this.dynamoClient,
                tableName: this.tableName
            })
        })
        return dbobjects
    }

    async batchGetObjectByPage({seriesKey, limit, ascending, exlcusiveFirstTimestamp}) {
        if (!this.isTimeOrdered) {throw new Error('this method is only applicable on timeOrdered DBObjects')}
        let keyData = this.dynamoClient.getPagewise({
            tableName: this.tableName,
            uid: seriesKey || this.seriesKey,
            limit,
            ascending,
            exclusiveFirstSk: exlcusiveFirstTimestamp
        })

        debugger
        // RESUME HERE, TEST THIS

        let dbobjects = {}
        keyData.forEach(obj => {
            debugger
            let id = u.keyFromID()

            dbobjects[id] = null
        })

    }
    
    async batchGetObjectsByTime({seriesKey, startTime, endTime, ascending, attributes}) {
        if (!this.isTimeOrdered) {throw new Error('this method is only applicable on timeOrdered DBObjects')}
        let allObjectData = await this.dynamoClient.getRange({
            tableName: this.tableName,
            uid: seriesKey || this.seriesKey,
            startTime, 
            endTime,
            ascending
        })
        let dbobjects = []
        allObjectData.forEach(data => {
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
        if (attributes) {return await this.getAttributesFromObjects(attributes, dbobjects)}
        return dbobjects
    }

    async scan({path, value, operator}) {

    }

    async getData(id, path) {

    }

    async batchGetData(ids, path) {

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