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


it('DBObject_collection (1) - all basic functionality', async function() {
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
    let path = 'parentKey1.messages'
    let user = 'testUser@gmail.com'
    await parentObj.createCollection({
        path,
        creator: user,
        members: {
            'member@gmail.com': {read: 5, write: 5}
        },
        permission: {read: 5, write: 7}
    })
    let writeShouldFail0 = await parentObj.collection({path}).createObject({
        data: {body: "won't get written cuz no user"}
    })
    assert.equal(writeShouldFail0, undefined)
    
    let writeShouldFail1 = await parentObj.collection({path, user: 'imposter@gmail.com'}).createObject({
        data: {body: "won't get written cuz bad user"}
    })
    assert.equal(writeShouldFail1, undefined)
    
    let writeShouldFail2 = await parentObj.collection({path, user: 'member@gmail.com'}).createObject({
        data: {body: "won't get written cuz user has low write permission"}
    })
    assert.equal(writeShouldFail2, undefined)
    
    
    
    let message_0 = await parentObj.collection({path, user}).createObject({
        data: {
            body: 'this is a message',
        }
    })
    let message_1 = await parentObj.collection({path, user}).createObject({data: {body: 'second message'}})
    let message_2 = await parentObj.collection({path, user}).createObject({data: {body: 'third message'}})
    let message_3 = await parentObj.collection({path, user}).createObject({data: {body: 'fourth message'}})
    let passed1 = message_0.id.split('-').length === 2
    
    assert.equal(passed1, true)
    
    // sensitivity
    
    // Get a single message
    let message0_data = await parentObj.collection({path, user}).getObject({
        id: message_0.id, 
        returnData: true
    })
    let passed2 = (message0_data.body === 'this is a message')
    assert.equal(passed2, true)
    
    // Retrieve a DBObject and modify it, see that it is changed
    let message0_dbobject = await parentObj.collection({path, user}).getObject({id: message_0.id})
    await message0_dbobject.set({attributes: {body: 'modified first message'}})
    let read3 = await message0_dbobject.get({path: 'body', user})
    let passed3 = read3 === 'modified first message'
    assert.equal(passed3, true)
    
    // Pagewise
    let read4 = await parentObj.collection({path, user}).getObjects({
        limit: 4,
        attributes: ['body']
    })
    let passed4 = (read4[3].body === 'modified first message') && (read4[0].body === 'fourth message')
    assert.equal(passed4, true)
    
    // Scan
    let read5 = await parentObj.collection({path, user}).scan({
        params: [
            ['body', '=', 'third message']
        ],
        returnData: true
    })
    let passed5 = read5[0].body === 'third message'
    assert.equal(passed5, true)
    
    
    // Delete one message
    let deleted = await parentObj.collection({path, user}).destroyObject({id: message_1.id, confirm: true})
    assert.equal(deleted, true)
    
    // Scan, round 2
    let friendsPath = 'friends'
    await parentObj.createCollection({path: friendsPath})
    await parentObj.collection({path: friendsPath}).createObject({data: {firstName: 'joe', friends: ['danny', 'irene']}})
    await parentObj.collection({path: friendsPath}).createObject({data: {firstName: 'danny', friends: ['joe', 'irene']}})
    await parentObj.collection({path: friendsPath}).createObject({data: {firstName: 'irene', friends: ['joe', 'danny']}})
    await parentObj.collection({path: friendsPath}).createObject({data: {firstName: 'joe', friends: ['johnny']}})
    
    let read8 = await parentObj.collection({path: friendsPath}).scan({
        params: [
            ['firstName', '=', 'joe', 'AND'],
            ['friends', 'contains', 'danny']
        ],
        returnData: true
    })
    let passed8 = (read8[0].firstName === 'joe') && (read8[0].friends.includes('irene'))
    assert.equal(passed8, true)
    
    let read9 = await parentObj.collection({path: friendsPath}).scan({
        params: [
            ['firstName', '=', 'danny', 'OR'],
            ['firstName', '=', 'irene'],
        ],
        returnData: true
    })
    let passed9 = (read9[0].firstName === 'danny') && (read9[0].friends.includes('irene'))
    assert.equal(passed9, true)
    
    
    // Destroy parent object and see that collection is destroyed as well
    await parentObj.destroy({user})
    let message0StillExists = await message0_dbobject.checkExists()
    assert.equal(message0StillExists, false)
})

it('DBObject_collection (2) - subclasses', async function() {
    this.timeout(u.TEST_TIMEOUT)

    let parentID = 'subclassTestParent'
    let parentData = {
        parentKey1: {
            subKey1: 'this is an object',
            subKey2: 'with a collection in it',
            messages: 'collection goes here'
        },
        parentKey2: 'innocent bystander'
    }

    let TestSubclass = class TestSubclass extends jsondb.DBObject {
        constructor(params) {
            super(params)
        }

        async setTheThing() {
            return this.set({attributes: {
                thing: 'this is the thing'
            }})
        }

        async getTheThing() {
            return this.get({path: 'thing'})
        }
    }
    
    let myHandler = new jsondb.DBObjectHandler({
        awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        awsRegion: config.AWS_REGION,
        tableName: config.tableName,
        timeOrdered: false, 
        subclass: TestSubclass
    })
    
    let parentObj = await myHandler.createObject({id: parentID, data: parentData})
    let read0 = await parentObj.get()
    let passed0 = _.isEqual(parentData, read0)
    assert.equal(passed0, true)
    
    
    // Create collection, add something to it
    let path = 'subclassPath'
    await parentObj.createCollection({path, subclass: TestSubclass})
    
    let subclassDBObject = await parentObj.collection({path}).createObject({
        data: {
            body: "this isn't actually doing anything",
        }
    })

    // Execute a method on the subclass
    let testClassInstance = await parentObj.collection({path}).getObject({id: subclassDBObject.id})
    await testClassInstance.setTheThing()
    let resultOfTest = await testClassInstance.getTheThing()
    
    assert.equal(resultOfTest, 'this is the thing')
    
    await parentObj.destroy({user: 'testUser@gmail.com'})
})