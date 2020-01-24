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
        data: {}, 
        creator: 'user0@gmail.com',
        members: {
            'highPermission@gmail.com': {read: 9, write: 9},
            'mediumPermission@gmail.com': {read: 5, write: 5},
            'lowPermission@gmail.com': {read: 2, write: 2},
        }
    })
    
    await dbobject.set({
        attributes: {
            regular: 'medium permission'
        }, 
        sensitivity: 5,
        credentials: high
    })
    
    await dbobject.set({
        attributes: {
            pub: 'default_permission'
        },
        sensitivity: 0,
        credentials: high
    })
    await dbobject.set({
        attributes: {
            password: 'permission 8'
        },
        sensitivity: 8,
        credentials: high
    })
    
    // ZERO: with no user specified, should get only public
    let read0 = await dbobject.get()
    let passed0 = read0.pub && !read0.regular

    assert.equal(passed0, true)
    
    // ONE: low permission user
    let read1 = await dbobject.get({credentials: {user: 'lowPermission@gmail.com'}})
    let passed1 = read1.pub && !read1.regular
    assert.equal(passed1, true)
    
    // TWO: medium permission user
    let read2 = await dbobject.get({credentials: {user: 'mediumPermission@gmail.com'}})
    let passed2 = read2.pub && read2.regular && !read2.password
    assert.equal(passed2, true)
    
    // THREE: high permission user
    let read3 = await dbobject.get({credentials: {user: 'highPermission@gmail.com'}})
    let passed3 = (read3.pub && read3.regular && read3.password) !== undefined
    assert.equal(passed3, true)
    
    // FOUR: manual low permission
    let read4 = await dbobject.get({credentials: low})
    let passed4 = read4.pub && !read4.regular && !read4.password
    assert.equal(passed4, true)
    
    // FIVE: manual high permission
    let read5 = await dbobject.get({credentials: high})
    let passed5 = (read5.pub && read5.regular && read5.password) !== undefined
    
    assert.equal(passed5, true)
    
    // SIX: a different user
    let read6 = await dbobject.get({credentials: {user: 'wrong@gmail.com'}})
    let passed6 = read6.pub && !read6.regular && !read6.password
    assert.equal(passed6, true)
    
    // Clean up
    await dbobject.destroy({credentials: skip})
})




/* TEST DATA */


let low = {permission: {read: 0, write: 0}}
let medium = {permission: {read: 5, write: 5}}
let high = {permission: {read: 9, write: 9}}
let skip = {skipPermissionCheck: true}

