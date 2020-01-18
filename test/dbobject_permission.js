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
    let testObjID = 'dbobject_permission_test'
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    
    // SETUP: create an object with three users and three paths of different permission levels
    await dbobject.create({
        data: {
            regular: 'medium permission'
        }, 
        sensitivity: 5,
        owner: 'user0@gmail.com',
        members: {
            'highPermission@gmail.com': 8,
            'mediumPermission@gmail.com': 5,
            'lowPermission@gmail.com': 2
        }
    })
    
    await dbobject.set({
        attributes: {
            pub: 'default_permission'
        },
        sensitivity: 0
    })
    await dbobject.set({
        attributes: {
            password: 'permission 8'
        },
        sensitivity: 8
    })
    
    // ZERO: with no user specified, should get only public
    let read0 = await dbobject.get()
    let passed0 = _.isEqual(read0, {
        pub: 'default_permission'
    })
    assert.equal(passed0, true)
    
    // ONE: low permission user
    let read1 = await dbobject.get({user: 'lowPermission@gmail.com'})
    let passed1 = _.isEqual(read1, {
        pub: 'default_permission'
    })
    assert.equal(passed1, true)
    
    // TWO: medium permission user
    let read2 = await dbobject.get({user: 'mediumPermission@gmail.com'})
    let passed2 = _.isEqual(read2, {
        regular: 'medium permission',
        pub: 'default_permission'
    })
    assert.equal(passed2, true)
    
    // THREE: high permission user
    let read3 = await dbobject.get({user: 'highPermission@gmail.com'})
    let passed3 = _.isEqual(read3, {
        password: 'permission 8',
        regular: 'medium permission',
        pub: 'default_permission'
    })
    assert.equal(passed3, true)
    
    // FOUR: manual low permission
    let read4 = await dbobject.get({permission: 2})
    let passed4 = _.isEqual(read4, {
        pub: 'default_permission'
    })
    assert.equal(passed4, true)
    
    // FIVE: manual high permission
    let read5 = await dbobject.get({permission: 8})
    let passed5 = _.isEqual(read5, {
        password: 'permission 8',
        regular: 'medium permission',
        pub: 'default_permission'
    })
    assert.equal(passed5, true)
    
    // SIX: a different user
    let read6 = await dbobject.get({user: 'wrong@gmail.com'})
    let passed6 = _.isEqual(read6, {
        pub: 'default_permission'
    })
    assert.equal(passed6, true)
    
    // Clean up
    await dbobject.destroy()
})

// #2: entire object via handler





/* TEST DATA */




