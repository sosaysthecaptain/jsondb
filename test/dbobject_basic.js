const assert = require('assert')
const flatten = require('flat')
const unflatten = require('flat').unflatten
const _ = require('lodash')
const jsondb = require('../index')
const ScanQuery = require('../src/ScanQuery')
const DynamoClient = require('../src/DynamoClient')
const config = require('../config')
const u = require('../src/u')

let dynamoClient = new DynamoClient({
    awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    awsRegion: config.AWS_REGION
})
it('DBObject_basic (1) should create and get a single node object, with and without cache and index', async function() {

    this.timeout(u.TEST_TIMEOUT)

    // Create fresh object
    let testObjID = 'dbobject_test_1'
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    await dbobject.create({data: basicObj})
    
    // Read one key (from cache)
    let read0 = await dbobject.get({path: 'key1'})
    let passed0 = _.isEqual(basicObj.key1, read0)
    assert.equal(passed0, true)
    
    // Read entire object (from cache)
    let read1 = await dbobject.get()
    let passed1 = _.isEqual(basicObj, read1)
    assert.equal(passed1, true)
    
    // Clear the variable in memory, make sure we can still get
    dbobject = null
    dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    
    // Starting fresh, read one key
    let read2 = await dbobject.get({path: 'key1'})
    let passed2 = _.isEqual(basicObj.key1, read2)
    assert.equal(passed2, true)
    
    // Read entire object
    let read3 = await dbobject.get()
    let passed3 = _.isEqual(basicObj, read3)
    assert.equal(passed3, true)
    
    // Clean up
    await dbobject.destroy()
})

it('DBObject_basic (2) objectPermission', async function() {

    this.timeout(u.TEST_TIMEOUT)
    let testObjID = 'dbobject_test_2'
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    await dbobject.create({data: basicObj, objectPermission: {read: 5, write: 5}})

    // Make sure we can't read it with low permission
    let read0 = await dbobject.get({path: 'key1', permission: {read: 0, write: 0}})
    let passed0 = _.isEqual(undefined, read0)
    assert.equal(passed0, true)
    
    // Read entire object (from cache)
    let read1 = await dbobject.get({permission: {read: 10, write: 10}})
    let passed1 = _.isEqual(basicObj, read1)
    assert.equal(passed1, true)
    
    // Clear the variable in memory, make sure we can still get
    dbobject = null
    dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    
    // Starting fresh, read the object
    let read3 = await dbobject.get({permission: {read: 5, write: 5}})
    let passed3 = _.isEqual(basicObj, read3)
    assert.equal(passed3, true)
    
    // Clean up
    await dbobject.destroy({skipPermissionCheck: true})
    // assert.equal(dbObjectExists, false)
})

it('DBObject_basic (3) sensitivity levels', async function() {

    this.timeout(u.TEST_TIMEOUT)
    let testObjID = 'dbobject_test_2'
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    await dbobject.create({data: basicObj})
    await dbobject.set({attributes: {sensitiveKey: 'secret'}, sensitivity: 5})

    let read0 = await dbobject.get({path: 'sensitiveKey', permission: 0})
    let passed0 = _.isEqual(undefined, read0)
    assert.equal(passed0, true)
    
    // Read entire object (from cache)
    let read1 = await dbobject.get({path: 'sensitiveKey', permission: 10})
    let passed1 = _.isEqual('secret', read1)
    assert.equal(passed1, true)
    
    // Clear the variable in memory, make sure we can still get
    dbobject = null
    dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    
    // Starting fresh, read one key
    let newString = 'change and should now be readable'
    let read3_5 = await dbobject.set({
        attributes: {'sensitiveKey': newString}, 
        sensitivity: 1, 
        permission: 5, 
        returnData: true
    })

    // Diversion: returnData
    let passed3_5 = (read3_5.sensitiveKey === newString)
    assert.equal(passed3_5, true)

    
    // Read entire object
    let read3 = await dbobject.get({path: 'sensitiveKey', permission: 5})
    let passed3 = _.isEqual(newString, read3)
    assert.equal(passed3, true)
    
    // Clean up
    await dbobject.destroy({skipPermissionCheck: true})
    // assert.equal(dbObjectExists, false)
})

it('DBObject_basic (4) modify', async function() {
    this.timeout(u.TEST_TIMEOUT)

    // Data
    let testObjID = 'dbobject_test_3'
    let testObj = {
        arr: ['one', 'two', 'three'],
        bystander: 'something else'
    }
    
    // Write an object containing an array
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()

    await dbobject.create({data: testObj})

    // Sanity check

    let read0 = await dbobject.get({path: 'arr'})
    let passed0 = _.isEqual(testObj.arr, read0)
    assert.equal(passed0, true)
    
    // modify
    await dbobject.modify({path: 'arr', fn: (obj => {
        obj.push('four')
    })})
    
    
    // Read again
    let read1 = await dbobject.get({path: 'arr'})
    let passed1 = _.isEqual(['one', 'two', 'three', 'four'], read1)
    assert.equal(passed1, true)

    
    // Clean up
    await dbobject.destroy()
})





/* TEST DATA */


let basicObj = {
    key1: {
        subkey1: 'this is key1.subkey1',
        subkey2: 'this is key1.subkey2',
        subkey3: {
            subsubkey1: 8882,
            subsubkey2: 'asd',
            subsubkey3: null,
        },
    },
    key2: {
        subkey1: 'this is key2.subkey1',
        subkey2: 'this is key2.subkey2',
        subkey3: 'this is key2.subkey3',
    },
    key3: {
        subkey1: 'this is key3.subkey1',
        subkey2: 'this is key3.subkey2',
        subkey3: 'this is key3.subkey3',
        emptyString: ''
    }
}




