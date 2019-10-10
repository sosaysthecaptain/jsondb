const assert = require('assert')
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


it('DBObject_collection', async function() {
    this.timeout(u.TEST_TIMEOUT)

    let parentID = 'dbobjRefTestParent'
    let parentData = {
        parentKey1: {
            subKey1: 'this is an object',
            subKey2: 'with a collection in it',
            messages: 'collection goes here'
        },
        parentKey2: 'innocent bystander'
    }
    
    let myHandler = new jsondb.DBObjectHandler({
        awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        awsRegion: config.AWS_REGION,
        tableName: config.tableName,
        subclass: null,
        timeOrdered: false
    })
    
    let parentObj = await myHandler.createObject(parentID, parentData)
    let read0 = await parentObj.get()
    let passed0 = _.isEqual(parentData, read0)
    assert.equal(passed0, true)
    
    
    // Create collection, add something to it
    await parentObj.createCollection('parentKey1.messages')
    
    let message_0 = await parentObj.addToCollection('parentKey1.messages', {body: 'this is a message'})
    let message_1 = await parentObj.addToCollection('parentKey1.messages', {body: 'second message'})
    let message_2 = await parentObj.addToCollection('parentKey1.messages', {body: 'third message'})
    let message_3 = await parentObj.addToCollection('parentKey1.messages', {body: 'fourth message'})
    let passed1 = message_0.id.split('-').length === 2
    assert.equal(passed1, true)
    
    // Get a single message
    let message0 = await parentObj.getFromCollection('parentKey1.messages', {id: message_0.id, attributes: true})
    let passed2 = (message0.body === 'this is a message')
    assert.equal(passed2, true)
    
    // Retrieve a DBObject and modify it, see that it is changed
    let message0_dbobject = await parentObj.getFromCollection('parentKey1.messages', {id: message_0.id})
    await message0_dbobject.set({body: 'modified first message'})
    let read3 = await message0_dbobject.get('body')
    let passed3 = read3 === 'modified first message'
    assert.equal(passed3, true)

    // Batch get
    let read4 = await parentObj.getFromCollection('parentKey1.messages', {
        limit: 4, 
        start: 0,
        attributes: ['body']
    })
    let passed4 = (read4[0].body === 'modified first message') && (read4[3].body === 'fourth message')
    assert.equal(passed4, true)
    
    // Scan
    let read5 = await parentObj.scanCollection('parentKey1.messages', {
        param: 'body',
        value: 'third message',
        returnData: true
    })
    let passed5 = read5[0].body === 'third message'
    assert.equal(passed5, true)
    
    // Delete one message
    let deleted = await parentObj.deleteFromCollection('parentKey1.messages', message_1.id, true)
    assert.equal(deleted, true)
    
    // Destroy parent object and see that collection is destroyed as well
    await parentObj.destroy()
    let message0StillExists = await message0_dbobject.checkExists()
    assert.equal(message0StillExists, false)
        
        
})
    