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

it('DBObject_permission (1) keys only', async function() {

    this.timeout(u.TEST_TIMEOUT)
    let testObjID = 'dbobject_test_2'
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    
    // SETUP: create an object with three users and three paths of different permission levels
    debugger
    await dbobject.create({
        data: {
            regular: 'default permission'
        }, 
        // sensitivity: 5,
        creator: 'user0@gmail.com',
        members: {
            'highPermission@gmail.com': 8,
            'mediumPermission@gmail.com': 5,
            'lowPermission@gmail.com': 2
        }
    })
    
    debugger
    await dbobject.set({
        data: {
            public: 'permission 2'
        },
        sensitivityLevel: 2
    })
    debugger
    await dbobject.set({
        data: {
            password: 'permission 8'
        },
        sensitivityLevel: 8
    })
    
    debugger
    
    // ZERO: with no user specified, should get public and regular
    let read0 = await dbobject.get()
    let passed0 = _.isEqual(read0, {
        regular: 'default permission',
        public: 'permission 2'
    })
    assert.equal(passed0, true)
    debugger
    
    // ONE: low permission user
    let read1 = await dbobject.get({user: 'lowPermission@gmail.com'})
    let passed1 = _.isEqual(read1, {
        public: 'permission 2'
    })
    assert.equal(passed1, true)
    
    debugger
    
    // TWO: medium permission user
    let read2 = await dbobject.get({user: 'mediumPermission@gmail.com'})
    let passed2 = _.isEqual(read2, {
        regular: 'default permission',
        public: 'permission 2'
    })
    assert.equal(passed2, true)
    
    debugger
    // THREE: high permission user
    let read3 = await dbobject.get({user: 'mediumPermission@gmail.com'})
    let passed3 = _.isEqual(read3, {
        password: 'permission 8',
        regular: 'default permission',
        public: 'permission 2'
    })
    assert.equal(passed3, true)
    debugger
    
    // FOUR: manual low permission
    let read4 = await dbobject.get({permission: 2})
    let passed4 = _.isEqual(read4, {
        public: 'permission 2'
    })
    assert.equal(passed4, true)
    
    debugger
    // FIVE: manual high permission
    let read5 = await dbobject.get({permission: 8})
    let passed5 = _.isEqual(read5, {
        password: 'permission 8',
        regular: 'default permission',
        public: 'permission 2'
    })
    assert.equal(passed5, true)
    
    debugger
    // SIX: a different user
    let read6 = await dbobject.get({user: 'wrong@gmail.com'})
    let passed6 = _.isEqual(read6, {})
    assert.equal(passed6, true)
    
    // Clean up
    await dbobject.destroy()
})

// #2: entire object via handler





/* TEST DATA */




