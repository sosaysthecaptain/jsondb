// THIS IS CURRENTLY AN EXERCISE IN API FANTASY

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
    
    let parentObj = await myHandler.createObject({id: parentID, data: parentData})
    let read0 = await parentObj.get()
    let passed0 = _.isEqual(parentData, read0)
    assert.equal(passed0, true)
    
    
    // Create collection, add something to it
    let collectionPath = 'parentKey1.messages'
    await parentObj.createCollection({path: collectionPath})
    
    let message_0 = await parentObj.collection(collectionPath).createObject({
        data: {
            body: 'this is a message',
        },
        permission: 5
    })

    let message_1 = await parentObj.collection(collectionPath).createObject({data: {body: 'second message'}})
    let message_2 = await parentObj.collection(collectionPath).createObject({data: {body: 'third message'}})
    let message_3 = await parentObj.collection(collectionPath).createObject({data: {body: 'fourth message'}})
    let passed1 = message_0.id.split('-').length === 2
    assert.equal(passed1, true)
    
    // PERMISSION
    
    // Get a single message
    let message0_data = await parentObj.collection(collectionPath).getObject({
        id: message_0.id, 
        returnData: true
    })
    let passed2 = (message0_data.body === 'this is a message')
    assert.equal(passed2, true)
    
    // Retrieve a DBObject and modify it, see that it is changed
    let message0_dbobject = await parentObj.collection(collectionPath).getObject({id: message_0.id})
    await message0_dbobject.set({attributes: {body: 'modified first message'}})
    let read3 = await message0_dbobject.get({path: 'body'})
    let passed3 = read3 === 'modified first message'
    assert.equal(passed3, true)
    
    // Pagewise
    let read4 = await parentObj.collection(collectionPath).getPagewise({
        limit: 4,
        // start: 0,
        attributes: ['body']
    })
    let passed4 = (read4[3].body === 'modified first message') && (read4[0].body === 'fourth message')
    assert.equal(passed4, true)
    
    debugger
    // Scan
    let read5 = await parentObj.collection('parentKey1.messages').scan({
        params: [
            // ['body', '=', 'third message', 'AND']
            ['body', '=', 'third message']
        ],
        returnData: true
    })
    debugger
    let passed5 = read5[0].body === 'third message'
    assert.equal(passed5, true)


    await parentObj.collection(collectionPath).createObject({data: {name: 'joe', friends: ['danny', 'irene']}})
    await parentObj.collection(collectionPath).createObject({data: {name: 'danny', friends: ['joe', 'irene']}})
    await parentObj.collection(collectionPath).createObject({data: {name: 'joe', friends: ['johnny']}})

    let read6 = await parentObj.collection('parentKey1.messages').scan({
        params: [
            // ['body', '=', 'third message', 'AND']
            ['name', '=', 'joe', 'AND'],
            ['friends', 'contains', 'danny']
        ],
        returnData: true
    })

    let read7 = await parentObj.collection('parentKey1.messages').scan({
        params: [
            // ['body', '=', 'third message', 'AND']
            ['body', '=', 'third message']
        ],
        returnData: true
    })
    
    // // Get pagewise
    // let firstPage = await parentObj.getNextCollectionPage('parentKey1.messages', {limit: 2})
    // assert.equal(firstPage.length, 2)
    // await parentObj.resetCollectionPage('parentKey1.messages')
    
    // let firstPageData = await parentObj.getNextCollectionPage('parentKey1.messages', {limit: 2, returnData: true})
    // let passed6 = firstPageData[0].body === 'fourth message'
    // assert.equal(passed6, true)

    // let secondPageData = await parentObj.getNextCollectionPage('parentKey1.messages', {limit: 2, returnData: true})
    // let passed8 = secondPageData[0].body === 'second message'
    // assert.equal(passed8, true)
    
    // // Delete one message
    // let deleted = await parentObj.deleteFromCollection('parentKey1.messages', message_1.id, true)
    // assert.equal(deleted, true)
    
    // // Destroy parent object and see that collection is destroyed as well
    // await parentObj.destroy()
    // let message0StillExists = await message0_dbobject.checkExists()
    // assert.equal(message0StillExists, false)
        
        
})
    