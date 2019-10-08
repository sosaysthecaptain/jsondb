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


xit('DBObjectHandler (1) - basic operations', async function() {
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
    let messages = await messageHandler.batchGetObjectByID(messageIDs)
    let passed0 = ((messages[message0.id].id === message0.id) && (messages[message5.id].id === message5.id))
    assert.equal(passed0, true)


    // Getting by time range
    let byTime = await messageHandler.batchGetObjectByTime({
        startTime: Date.now() - (10 * 1000),
        endTime: Date.now(),
        ascending: true
    })

    debugger









    for (let i = 0; i < messageIDs.length; i++) {
        await messageHandler.deleteObject(messageIDs[i])
    }
    
})
