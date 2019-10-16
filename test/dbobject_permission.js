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

it('DBObject_permission', async function() {

    this.timeout(u.TEST_TIMEOUT)
    let testObjID = 'dbobject_test_2'
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    await dbobject.create({
        data: basicObj, 
        sensitivity: 5,
        creator: 'user0@gmail.com',
        members: {
            'member0@gmail.com': {read: 8, write: 0},
            'member2@gmail.com': {read: 8, write: 8},
            'member3@gmail.com': {read: 2, write: 0}
        }
    })
    let read0 = await dbobject.get({
        path: 'key1', 
        sensitivity: 0
    })
    let passed0 = _.isEqual(undefined, read0)
    assert.equal(passed0, true)
    
    // Read entire object (from cache)
    let read1 = await dbobject.get({sensitivity: 10})
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
    await dbobject.set({attributes: {'key1': newString}, sensitivity: 1})
    
    // Read entire object
    let read3 = await dbobject.get({path: 'key1', sensitivity: 5})
    let passed3 = _.isEqual(newString, read3)
    assert.equal(passed3, true)
    
    // Clean up
    await dbobject.destroy()
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




