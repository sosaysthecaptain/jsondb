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
    debugger
    let passed0 = _.isEqual(parentData, read0)
    assert.equal(passed0, true)
    

    // Create collection, add something to it
    await parentObj.createCollection('parentKey1.messages')
    debugger

    let messageID_0 = await parentObj.addToCollection('parentKey1.messages', {body: 'this is a message'})
    let messageID_1 = await parentObj.addToCollection('parentKey1.messages', {body: 'second message'})
    let messageID_2 = await parentObj.addToCollection('parentKey1.messages', {body: 'third message'})
    let messageID_3 = await parentObj.addToCollection('parentKey1.messages', {body: 'fourth message'})
    let passed1 = messageID_0.split('-').length = 2
    assert.equal(passed1, true)
    
    // Get a single message
    let message0 = await getFromCollection('parentKey1.messages', {id: messageID_0, attributes: true})
    debugger
    let passed2 = message0 = 'this is a message'
    assert.equal(passed2, true)
    
    // Retrieve a DBObject and modify it, see that it is changed
    let message0_dbobject = await parentObj.getFromCollection('parentKey1.messages', {id: messageID_0})
    await message0_dbobject.set({body: 'modified first message'})
    debugger
    let read3 = await message0_dbobject.get('body')
    debugger
    let passed3 = read3 === 'modified first message'
    assert.equal(passed3, true)
    
    // Batch get
    let read4 = await parentObj.getFromCollection('parentKey1.messages', {
        limit: 4, 
        start: 0,
        attributes: ['message']
    })
    debugger
    let passed4 = _.isEqual(read4, ['modified first message', 'second message', 'third message', 'fourth message'])
    assert.equal(passed4, true)
    
    // Delete one message
    await parentObj.deleteFromCollection('parentKey1.messages')
    debugger
    let message1 = await parentObj.getFromCollection('parentKey1.messages', {id: messageID_1})
    assert.equal(!message1, true)
    
    // Destroy parent object and see that collection is destroyed as well
    parentObj.destroy()
    debugger
    let message0StillExists = await message0_dbobject.checkExists()
    assert.equal(message0StillExists, false)


    debugger
    

})
    