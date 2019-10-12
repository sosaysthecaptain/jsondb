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
    // assert.equal(dbObjectExists, false)
})

it('DBObject_basic (2) permissions', async function() {

    this.timeout(u.TEST_TIMEOUT)
    let testObjID = 'dbobject_test_2'
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    await dbobject.create({data: basicObj, permission: 5})
    let read0 = await dbobject.get({path: 'key1', permission: 0})
    let passed0 = _.isEqual(undefined, read0)
    assert.equal(passed0, true)
    
    // Read entire object (from cache)
    let read1 = await dbobject.get({permission: 10})
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
    let newString = 'change and should now be readable'
    await dbobject.set({attributes: {'key1': newString}, permission: 1})
    
    // Read entire object
    let read3 = await dbobject.get({path: 'key1', permission: 5})
    let passed3 = _.isEqual(newString, read3)
    assert.equal(passed3, true)
    
    // Clean up
    await dbobject.destroy()
    // assert.equal(dbObjectExists, false)
})

it('DBObject_basic (3) modify', async function() {
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
        debugger
        obj.push('four')
    })})
    
    
    // Read again
    let read1 = await dbobject.get({path: 'arr'})
    let passed1 = _.isEqual(['one', 'two', 'three', 'four'], read1)
    assert.equal(passed1, true)

    
    // Clean up
    await dbobject.destroy()
    // let dbObjectExists = await dbobject.destroy()
    // assert.equal(dbObjectExists, false)
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
    }
}




