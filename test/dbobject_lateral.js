const assert = require('assert')
const _ = require('lodash')
const jsondb = require('../index')
const DynamoClient = require('../src/DynamoClient')
const config = require('../config')
const u = require('../src/u')

let dynamoClient = new DynamoClient({
    awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    awsRegion: config.AWS_REGION
})

it('DBObject_lateral: one large key split laterally', async function() {
    this.timeout(20000)

    // Data
    let testObjID = 'dbobject_test_3'
    let testObj = {
        giantThing: u.getVerifiableString(1000 * 1000, 1),
    }
    
    // Write a large object
    let dbobject = new jsondb.DBObject(testObjID, {
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    await dbobject.create(testObj)

    // Read key by name from cache
    let read0 = await dbobject.get('giantThing')
    let passed0 = _.isEqual(testObj.giantThing, read0)
    assert.equal(passed0, true)
    
    // Read all of it from cache
    let read1 = await dbobject.get()
    let passed1 = _.isEqual(testObj, read1)
    assert.equal(passed1, true)
    
    
    // Clear the variable in memory, make sure we can still get
    dbobject = null
    dbobject = new jsondb.DBObject(testObjID, {
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    
    
    // Starting fresh, read one key
    let read2 = await dbobject.get('giantThing')
    let passed2 = _.isEqual(testObj.giantThing, read2)
    assert.equal(passed2, true)
    
    
    // Read entire object
    let read3 = await dbobject.get()
    let passed3 = _.isEqual(testObj, read3)
    assert.equal(passed3, true)
    
    // Clean up
    await dbobject.destroy()
    let dbObjectExists = await dbobject.destroy()
    assert.equal(dbObjectExists, false)
})


