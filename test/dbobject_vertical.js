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

let testObjID = 'dbobject_test_vertical'
let sizePerKey = 200 * 1000
let testObj = {
    k1: {
        k1s1: u.getVerifiableString(sizePerKey, 1),
        k1s2: u.getVerifiableString(sizePerKey, 2),
        k1s3: u.getVerifiableString(sizePerKey, 3),
    },
    k2: {
        k2s1: u.getVerifiableString(sizePerKey, 4),
        k2s2: u.getVerifiableString(sizePerKey, 5),
        k2s3: u.getVerifiableString(sizePerKey, 6),
    }, 
    k3: {
        k3s1: u.getVerifiableString(sizePerKey, 7),
        k3s2: u.getVerifiableString(sizePerKey, 8),
        k3s3: u.getVerifiableString(sizePerKey, 9),
    }
}

it('DBObject_vertical (1) a number of keys requiring a split between multiple nodes', async function() {
    this.timeout(60000)

    // Write a large object
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    await dbobject.create({data: testObj})

    // Read one key of it from cache
    let read0 = await dbobject.get({path: 'k1.k1s3'})
    let passed0 = _.isEqual(testObj.k1.k1s3, read0)
    assert.equal(passed0, true)
    
    // Read all of it from cache
    let read1 = await dbobject.get()
    let passed1 = _.isEqual(testObj, read1)

    assert.equal(passed1, true)
    
    
    // Clear the variable in memory, make sure we can still get
    dbobject = null
    dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    
    // Starting fresh, read one key
    let read2 = await dbobject.get({path: 'k1.k1s3'})
    let passed2 = _.isEqual(testObj.k1.k1s3, read2)
    assert.equal(passed2, true)
    
    
    // Read entire object
    let read3 = await dbobject.get()
    let passed3 = _.isEqual(testObj, read3)
    assert.equal(passed3, true)
    
    
    // Clean up
    // await dbobject.destroy()
})

it('DBObject_vertical (2) modification on secondary nodes', async function() {
    this.timeout(60000)

    // Ensure still exists
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    let read0 = await dbobject.get({path: 'k1.k1s2'})
    let passed0 = _.isEqual(testObj.k1.k1s2, read0)
    assert.equal(passed0, true)
    
    // Modify a node 
    await dbobject.set({attributes: {'k1.k1s2': 'this was changed'}})
    let read1 = await dbobject.get({path: 'k1.k1s2'})
    let passed1 = _.isEqual('this was changed', read1)

    assert.equal(passed1, true)
    
    
    // Clear the variable in memory, make sure we can still get
    dbobject = null
    dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    
    // Make sure we still get the same answer
    let read2 = await dbobject.get({path: 'k1.k1s2'})
    let passed2 = _.isEqual('this was changed', read2)
    assert.equal(passed2, true)
    
    
    // Clean up
    let destroyed = await dbobject.destroy(true)
    assert.equal(destroyed, true)
})
