let uuid = require('uuid')

let DBObject = require('./DBObject')
let DynamoClient = require('./DynamoClient')

class DBObjectHandler {
    constructor({awsAccessKeyId, awsSecretAccessKey, awsRegion, tableName, subclass, isTimeOrdered, defaultCacheSize, pk, sk}) {
        this.awsAccessKeyId = awsAccessKeyId
        this.awsSecretAccessKey = awsSecretAccessKey
        this.awsRegion = awsRegion || 'us-east-2'
        this.tableName = tableName
        this.subclass = subclass
        this.isTimeOrdered = isTimeOrdered
        this.defaultCacheSize = defaultCacheSize || (50 * 1024 * 1024)
        this.pk = pk || 'id'
        this.sk = sk || 'timestamp' 
    }

    async createObject(id, initialData, allowOverwrite) {
        
        debugger
        if (!id) {
            id = uuid.uuidv4()
        }
        let key = {}
        key[this.pk] = id
        
        if (this.isTimeOrdered) {
            key[this.sk] = Date.now()
        }

        // Instantiate dbObject, check if exists, write
        let dbObject = new DBObject()

        if (!allowOverwrite) {
            if (dbObject.exists()) {
                throw new Error('A DBObject already exists with this key')
            }
        }

        dbObject.set(initialData)
    }

    deleteObject(id) {

    }

    getObject(id) {

    }

    batchGetObjectById(ids) {

    }

    batchGetObjectByPage({page, pageSize, ascending}) {

    }

    batchGetObjectByTime({start, end, ascending}) {

    }

    scan({path, value, operator}) {

    }

    getData(id, path) {

    }

    batchGetData(ids, path) {

    }

    modify(path, fn) {

    }

    generateKey(id) {
        let split = id.split('-')
        let key = {}
        key[this.pk] = split[0]
        if (this.isTimeOrdered) {
            key[this.sk] = split[1]
        }
        return key
    }
}

module.exports = DBObjectHandler