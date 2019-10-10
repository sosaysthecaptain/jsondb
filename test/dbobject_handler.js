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


it('DBObjectHandler (1) - basic operations', async function() {
    this.timeout(u.TEST_TIMEOUT)
    let testID = 'handler_test_1'
    let testObj = {stuff: {containing: 'more_stuff'}}
    
    let myHandler = new jsondb.DBObjectHandler({
        awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        awsRegion: config.AWS_REGION,
        tableName: config.tableName,
        subclass: null,
        timeOrdered: false
    })
    
    let dbobject = await myHandler.createObject(testID, testObj)
    let read0 = await dbobject.get()
    let passed0 = _.isEqual(testObj, read0)
    assert.equal(passed0, true)
    
    let secondInstanceOfSame = await myHandler.getObject(testID, true)
    let read1 = await secondInstanceOfSame.get()
    let passed1 = _.isEqual(testObj, read1)
    assert.equal(passed1, true)
    
    let destroyed = await myHandler.deleteObject(testID, true)
    let passed2 = _.isEqual(true, destroyed)
    assert.equal(passed2, true)
})

it('DBObjectHandler (2) - batch operations', async function() {
    this.timeout(u.TEST_TIMEOUT)

    let seriesKey = 'message'
    let messageHandler = new jsondb.DBObjectHandler({
        seriesKey: 'message',
        awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        awsRegion: config.AWS_REGION,
        tableName: config.tableName,
        subclass: null,
        isTimeOrdered: true,
    })
    
    // Getting by ID
    let message0 = await messageHandler.createObject(seriesKey, {message: 'first message'})
    let message1 = await messageHandler.createObject(seriesKey, {message: 'second message'})
    let message2 = await messageHandler.createObject(seriesKey, {message: 'third message'})
    let message3 = await messageHandler.createObject(seriesKey, {message: 'fourth message'})
    let message4 = await messageHandler.createObject(seriesKey, {message: 'fifth message'})
    let message5 = await messageHandler.createObject(seriesKey, {message: 'sixth message'})

    let messageIDs = [message0.id, message1.id, message2.id, message3.id, message4.id, message5.id]
    let messages = await messageHandler.batchGetObjectsByID(messageIDs)
    let passed0 = ((messages[message0.id].id === message0.id) && (messages[message5.id].id === message5.id))
    assert.equal(passed0, true)
    
    
    // Getting by time range
    let byTime = await messageHandler.batchGetObjectsByTime({
        startTime: Date.now() - (10 * 1000),
        endTime: Date.now(),
        ascending: true
    })
    let allMessages = []
    allIDs = Object.keys(byTime)
    for (let i = 0; i < allIDs.length; i++) {
        let id = allIDs[i]   
        let objData = await byTime[id].get()
        allMessages.push(objData)
    }
    let allMessagesString = JSON.stringify(allMessages)
    let passed1 = (allMessagesString.includes('third message'))
    assert.equal(passed1, true)
    
    // By time, data only
    let messagesByTime = await messageHandler.batchGetObjectsByTime({
        startTime: Date.now() - (10 * 1000),
        endTime: Date.now(),
        ascending: true,
        attributes: ['message'],
    })
    let passed2 = messagesByTime[0].message === 'first message'
    assert.equal(passed2, true)
    
    // By page, objects
    let firstPage = await messageHandler.batchGetObjectsByPage({
        limit: 3,
        ascending: true,
        // attributes: ['message']
    })
    let firstPageMessage0 = await firstPage[0].get('message') === 'first message'
    let firstPageMessage2 = await firstPage[2].get('message') === 'third message'
    let passed3 = firstPageMessage0 && firstPageMessage2
    assert.equal(passed3, true)
    
    // By page, objects, 2
    let secondPage = await messageHandler.batchGetObjectsByPage({
        limit: 3,
        ascending: true,
        exlcusiveFirstTimestamp: message2.id.split('-')[1]
        // attributes: ['message']
    })
    let secondPageMessage0 = await secondPage[0].get('message') === 'fourth message'
    let secondPageMessage2 = await secondPage[2].get('message') === 'sixth message'
    let passed4 = secondPageMessage0 && secondPageMessage2
    assert.equal(passed4, true)
        
    // By page, data
    let firstPageData = await messageHandler.batchGetObjectsByPage({
        limit: 4,
        ascending: true,
        attributes: ['message']
    })
    let passed5 = firstPageData[0].message === 'first message'
    assert.equal(passed5, true)
    
    // Scan
    let scanData = await messageHandler.scan({
        param: 'message',
        value: 'fourth message',
        attributes: true
    })
    let passed6 = scanData[0].message === 'fourth message'
    assert.equal(passed6, true)

    // Clean up
    for (let i = 0; i < messageIDs.length; i++) {
        await messageHandler.deleteObject(messageIDs[i])
    }  
})