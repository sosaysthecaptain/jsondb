// THIS IS CURRENTLY AN EXERCISE IN API FANTASY

const assert = require('assert')
const _ = require('lodash')
const jsondb = require('../index')
const config = require('../config')
const u = require('../src/u')


// it('DBObject_collection (1) - all basic functionality', async function() {
//     this.timeout(u.TEST_TIMEOUT)

//     let parentID = 'dbobjRefTestParent'
//     let parentData = {
//         parentKey1: {
//             subKey1: 'this is an object',
//             subKey2: 'with a collection in it',
//             messages: 'collection goes here'
//         },
//         parentKey2: 'innocent bystander'
//     }
    
//     let myHandler = new jsondb.DBObjectHandler({
//         awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
//         awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
//         awsRegion: config.AWS_REGION,
//         tableName: config.tableName,
//         subclass: null,
//         isTimeOrdered: false
//     })
    
//     let user = 'testUser@gmail.com'
//     let parentObj = await myHandler.createObject({
//         id: parentID,
//         data: parentData,
//         members: {'member@gmail.com': {read: 5, write: 1}},
//         creator: user,
//         allowOverwrite: true,
//         objectPermission: {read: 2, write: 2},
//     })
//     let read0 = await parentObj.get({credentials: high})
//     delete read0.members
//     let passed0 = _.isEqual(parentData, read0)
//     assert.equal(passed0, true)
    
    
//     // Create collection, add something to it
//     let path = 'parentKey1.messages'
//     await parentObj.createCollection({path, credentials: high})
//     let write0Failed = false
//     try {
//         let writeShouldFail0 = await parentObj.collection({path}).createObject({
//             data: {body: "won't get written cuz no user"}
//         })
        
//     } catch(err) {write0Failed = true}
    
//     let write1Failed = false
//     try {
//         let writeShouldFail1 = await parentObj.collection({path, credentials: {user: 'imposter@gmail.com'}}).createObject({
//             data: {body: "won't get written cuz bad user"}
//         })
//     } catch(err) {write1Failed = true}
//     assert.equal(write1Failed, true)
    
//     // let write2Failed = false
//     // try {
//     //     debugger
//     //     let writeShouldFail2 = await parentObj.collection({path, credentials: {user: 'member@gmail.com'}}).createObject({
//     //         data: {body: "won't get written cuz user has low write permission"}
//     //     })
        
//     // } catch(err) {write2Failed = true}
//     // assert.equal(write2Failed, true)
    
    
    
    
//     let message_0 = await parentObj.collection({path, credentials: {user}}).createObject({
//         data: {
//             body: 'this is a message',
//         }
//     })
//     let message_1 = await parentObj.collection({path, credentials: {user}}).createObject({
//         data: {body: 'second message'
//     }})
//     let message_2 = await parentObj.collection({path, credentials: {user}}).createObject({
//         data: {body: 'third message'
//     }})
//     let message_3 = await parentObj.collection({path, credentials: {user}}).createObject({
//         data: {body: 'fourth message'
//     }})
//     let passed1 = message_0.id.split('-').length === 2
    
//     assert.equal(passed1, true)
    
//     // sensitivity
    
//     // Get a single message
//     let message0_data = await parentObj.collection({path, credentials: {user}}).getObject({
//         id: message_0.id, 
//         returnData: true
//     })
//     let passed2 = (message0_data.body === 'this is a message')
//     assert.equal(passed2, true)
    
//     // Retrieve a DBObject and modify it, see that it is changed
//     let message0_dbobject = await parentObj.collection({path, credentials: {user}}).getObject({
//         id: message_0.id
//     })
//     await message0_dbobject.set({attributes: {body: 'modified first message'}})
//     let read3 = await message0_dbobject.get({path: 'body', user})
//     let passed3 = read3 === 'modified first message'
//     assert.equal(passed3, true)
    
//     // Pagewise
//     let read4 = await parentObj.collection({path, credentials: {user}}).getObjects({
//         limit: 4,
//         attributes: ['body']
//     })
//     let passed4 = (read4[3].body === 'modified first message') && (read4[0].body === 'fourth message')
//     debugger
//     assert.equal(passed4, true)
    
//     // Scan
//     let read5 = await parentObj.collection({path, credentials: {user}}).scan({
//         params: [
//             ['body', '=', 'third message']
//         ],
//         returnData: true
//     })
//     let passed5 = read5[0].body === 'third message'
//     assert.equal(passed5, true)
    
    
//     // Delete one message
//     let deleted = await parentObj.collection({path, credentials: skip}).destroyObject({
//         id: message_1.id, 
//         confirm: true,
//         credentials: skip
//     })
//     assert.equal(deleted, true)
    
//     // Scan, round 2
//     let friendsPath = 'friends'
//     parentObj.credentials = skip
//     await parentObj.createCollection({path: friendsPath})
//     await parentObj.collection({path: friendsPath}).createObject({data: {
//         firstName: 'joe', 
//         friends: ['danny', 'irene'],
//         letters: ['a', 'b', 'c']
//     }})
//     await parentObj.collection({path: friendsPath}).createObject({data: {
//         firstName: 'danny', 
//         friends: ['joe', 'irene'],
//         letters: ['a', 'd']
//     }})
//     await parentObj.collection({path: friendsPath}).createObject({data: {
//         firstName: 'irene', 
//         friends: ['joe', 'danny'],
//         letters: ['f', 'd']
//     }})
//     await parentObj.collection({path: friendsPath}).createObject({data: {
//         firstName: 'joe', 
//         friends: ['johnny'],
//         letters: ['d', 'e']
//     }})
    
//     let read8 = await parentObj.collection({path: friendsPath}).scan({
//         params: [
//             ['firstName', '=', 'joe', 'AND'],
//             ['friends', 'contains', 'danny']
//         ],
//         returnData: true
//     })
//     let passed8 = (read8[0].firstName === 'joe') && (read8[0].friends.includes('irene'))
//     assert.equal(passed8, true)
    
//     let read9 = await parentObj.collection({path: friendsPath}).scan({
//         params: [
//             ['firstName', '=', 'danny', 'OR'],
//             ['firstName', '=', 'irene'],
//         ],
//         returnData: true
//     })
//     let passed9 = (read9[0].firstName === 'danny') || (read9[0].firstName === 'irene')
//     assert.equal(passed9, true)

//     // INTERSECTS
//     let read10 = await parentObj.collection({path: friendsPath}).scan({
//         params: [
//             ['friends', 'INTERSECTS', ['irene', 'someone else']],
//         ],
//         returnData: true
//     })

//     let passed10 = read10.length === 2
//     assert.equal(passed10, true)    
    
//     let read10_5 = await parentObj.collection({path: friendsPath}).scan({
//         params: [
//             ['friends', 'INTERSECTS', ['irene', 'someone else'], 'AND'],
//             ['letters', 'INTERSECTS', ['d', 'q']],
            
//         ],
//         returnData: true
//     })
//     let passed10_5 = read10_5[0].firstName === 'danny'
//     assert.equal(passed10_5, true)
    
//     // Only some properties
//     let firstNameOnly = await parentObj.collection({path: friendsPath}).scan({
//         params: [
//             ['firstName', '=', 'danny', 'OR'],
//             ['firstName', '=', 'irene'],
//         ],
//         attributes: ['firstName']
//     })
//     let objectsOnly = await parentObj.collection({path: friendsPath}).scan({
//         params: [
//             ['firstName', '=', 'danny', 'OR'],
//             ['firstName', '=', 'irene'],
//         ]
//     })
//     let passed11 = firstNameOnly[0].firstName && !firstNameOnly[0].friends
//     assert.equal(passed11, true)
//     let passed12 = objectsOnly[0].set !== undefined
//     assert.equal(passed12, true)
    
//     // // NOT_NULL
//     // await parentObj.collection({path: friendsPath}).createObject({data: {firstName: 'snitcher'}})
//     // debugger
//     // let read11 = await parentObj.collection({path: friendsPath}).scan({
//     //     params: [
//     //         ['friends', 'NOT_NULL'],
//     //     ],
//     //     returnData: true
//     // })
//     // debugger
//     // let passed11 = read10.length === 4
//     // assert.equal(passed11, true)
    
    
//     // Destroy parent object and see that collection is destroyed as well
//     await parentObj.destroy({credentials: skip})
//     let message0StillExists = await message0_dbobject.checkExists()
//     assert.equal(message0StillExists, false)
// })

// it('DBObject_collection (2) - subclasses', async function() {
//     this.timeout(u.TEST_TIMEOUT)

//     let parentID = 'subclassTestParent'
//     let parentData = {
//         parentKey1: {
//             subKey1: 'this is an object',
//             subKey2: 'with a collection in it',
//             messages: 'collection goes here'
//         },
//         parentKey2: 'innocent bystander'
//     }

//     let TestSubclass = class TestSubclass extends jsondb.DBObject {
//         constructor(params) {
//             super(params)
//         }

//         async setTheThing() {
//             return this.set({attributes: {
//                 thing: 'this is the thing'
//             }})
//         }

//         async getTheThing() {
//             return this.get({path: 'thing'})
//         }
//     }
    
//     let myHandler = new jsondb.DBObjectHandler({
//         awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
//         awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
//         awsRegion: config.AWS_REGION,
//         tableName: config.tableName,
//         isTimeOrdered: false, 
//         subclass: TestSubclass
//     })
    
//     let parentObj = await myHandler.createObject({id: parentID, data: parentData, allowOverwrite: true})
//     let read0 = await parentObj.get()
//     delete read0.members
//     let passed0 = _.isEqual(parentData, read0)
//     assert.equal(passed0, true)
    
    
//     // Create collection, add something to it
//     let path = 'subclassPath'
//     await parentObj.createCollection({path, subclass: TestSubclass})
    
//     let subclassDBObject = await parentObj.collection({path}).createObject({
//         data: {
//             body: "this isn't actually doing anything",
//         }
//     })

//     // Execute a method on the subclass
//     let testClassInstance = await parentObj.collection({path}).getObject({id: subclassDBObject.id})
//     await testClassInstance.setTheThing()
//     let resultOfTest = await testClassInstance.getTheThing()
    
//     assert.equal(resultOfTest, 'this is the thing')
    
//     await parentObj.destroy({user: 'testUser@gmail.com', credentials: skip})
// })

it('DBObject_collection (3) - basic gsi functionality', async function() {
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
        isTimeOrdered: false
    })

    let indexName = config.indexName
    let partitionKey = 'uid'
    let sortKey = 'XXmodifiedDate'
    
    let user = 'testUser@gmail.com'
    let parentObj = await myHandler.createObject({
        id: parentID,
        data: parentData,
        members: {'member@gmail.com': {read: 5, write: 1}},
        creator: user,
        allowOverwrite: true,
        objectPermission: {read: 2, write: 2},
    })
    let read0 = await parentObj.get({credentials: high})
    delete read0.members
    let passed0 = _.isEqual(parentData, read0)
    assert.equal(passed0, true)
    
    // Create collection, add something to it
    await parentObj.ensureIndexLoaded()
    let path = 'parentKey1.messages'
    await parentObj.createCollection({path, credentials: high})
    let write0Failed = false
    try {
        let writeShouldFail0 = await parentObj.collection({path}).createObject({
            data: {body: "won't get written cuz no user"}
        })
        
    } catch(err) {write0Failed = true}
    
    let write1Failed = false
    try {
        let writeShouldFail1 = await parentObj.collection({path, credentials: {user: 'imposter@gmail.com'}}).createObject({
            data: {body: "won't get written cuz bad user"}
        })
    } catch(err) {write1Failed = true}
    assert.equal(write1Failed, true)

    let message_0 = await parentObj.collection({path, credentials: {user}}).createObject({
        data: {
            body: 'this is a message',
            modifiedDate: Math.floor((Date.now() + 500)),
            test: 'test'
        }
    })
    let message_1 = await parentObj.collection({path, credentials: {user}}).createObject({
        data: {
            body: 'second message',
            modifiedDate: Math.floor((Date.now() + 200)),
            test: 'test'
        }
    })
    let message_2 = await parentObj.collection({path, credentials: {user}}).createObject({
        data: {
            body: 'third message',
            modifiedDate: Math.floor((Date.now() + 100)),
            test: 'test'
        }
    })
    let message_3 = await parentObj.collection({path, credentials: {user}}).createObject({
        data: {
            body: 'fourth message',
            modifiedDate: Math.floor((Date.now())),
            test: 'test'
        }
    })
    let passed1 = message_3.id.split('-').length === 2    
    assert.equal(passed1, true)

    // Get a single message
    let message0_data = await parentObj.collection({path, credentials: {user}}).getObject({
        id: message_0.id, 
        returnData: true
    })
    let passed2 = (message0_data.body === 'this is a message')
    assert.equal(passed2, true)
    
    // Retrieve a DBObject and modify it, see that it is changed
    let message0_dbobject = await parentObj.collection({path, credentials: {user}}).getObject({
        id: message_0.id
    })
    await message0_dbobject.set({attributes: {body: 'modified first message'}})
    let read3 = await message0_dbobject.get({path: 'body', user})
    let passed3 = read3 === 'modified first message'
    assert.equal(passed3, true)
    
    // Vanilla Pagewise
    let read4 = await parentObj.collection({path, credentials: {user}}).getObjects({
        limit: 4,
        attributes: ['body']
    })
    let passed4 = (read4[3].body === 'modified first message') && (read4[0].body === 'fourth message')
    assert.equal(passed4, true)

    // // GSI Pagewise
    await parentObj.ensureIndexLoaded()
    
    // the different ways to get collections of things

    // the fourth message which was created last will appear first in vanilla, but from the gsi it should appear first bc it has the "most recent" modified date
    let requestedData = await parentObj.collection({path, indexName, partitionKey, sortKey, credentials: {user}}).batchGetObjectsByPage({
        limit: 4,
        returnData: true,
        includeID: true,
        credentials: {skipPermissionCheck: true},
    })
    let passed5 = (requestedData[0].body === 'modified first message') && (requestedData[3].body === 'fourth message')
    assert.equal(passed5, true)
    
    let requestedData1 = await parentObj.collection({path, indexName, partitionKey, sortKey, credentials: {user}}).batchGetObjectsByPage({
        limit: 4,
        attributes: ['body'],
        credentials: {skipPermissionCheck: true}
    })
    let passed6 = (requestedData1[0].body === 'modified first message') && (requestedData1[3].body === 'fourth message')
    assert.equal(passed6, true)
    
    let requestedData2 = await parentObj.collection({path, indexName, partitionKey, sortKey, credentials: {user}}).batchGetObjectsByTime({
        limit: 4,
        returnData: true,
        startTime: requestedData[0].modifiedDate - 10000,
        endTime: requestedData[0].modifiedDate + 10000,
        credentials: {skipPermissionCheck: true}
    })

    let passed7 = (requestedData2[0].body === 'modified first message') && (requestedData2[3].body === 'fourth message')
    assert.equal(passed7, true)
    
    let requestedData3 = await parentObj.collection({path, indexName, partitionKey, sortKey, credentials: {user}}).batchGetObjectsByTime({
        limit: 4,
        attributes: ['body'],
        startTime: requestedData[0].modifiedDate - 10000,
        endTime: requestedData[0].modifiedDate + 10000,
        credentials: {skipPermissionCheck: true}
    })

    let passed8 = (requestedData3[0].body === 'modified first message') && (requestedData3[3].body === 'fourth message')
    assert.equal(passed8, true)

    let requestedData4 = await parentObj.collection({path, indexName, partitionKey, sortKey, credentials: {user}}).getObjects({
        limit: 4,
        attributes: ['body'],
        // for some reason we cant set returnData here and we have to set ascending to true
        ascending: true,
        credentials: {skipPermissionCheck: true}
    })
    let passed9 = (requestedData4[0].body === 'modified first message') && (requestedData4[3].body === 'fourth message')
    assert.equal(passed9, true)

    // // this will fail bc returndata and attributes arent specified
    // let requestedData5 = await myHandlerForGSI.batchGetObjectsByPage({
    //     limit: 4,
    //     credentials: {skipPermissionCheck: true}
    // })
    // let passed10 = (requestedData5[0].body === 'modified first message') && (requestedData5[3].body === 'fourth message')
    // assert.equal(passed10, true)

    let requestedData6 = await parentObj.collection({path, indexName, partitionKey, sortKey, credentials: {user}}).scan({
        params: [
            ['body', '=', 'modified first message', 'OR'],            
            ['body', '=', 'fourth message', 'OR']           
        ],
        returnData: true,
        ascending: true
    })
    let passed11 = (requestedData6[0].body === 'modified first message') && (requestedData6.length === 2)
    assert.equal(passed11, true)
    
    // change the sort order
    // Retrieve a DBObject and modify it, see that it is changed, and make sure it moves up the list
    let message2_dbobject = await parentObj.collection({path, credentials: {user}}).getObject({
        id: message_2.id
    })
    let newModifiedDate = Math.floor((Date.now() + 1000000))
    await message2_dbobject.set({attributes: {modifiedDate: newModifiedDate}})
    let modifiedCheck = await message2_dbobject.get({path: 'modifiedDate', user})
    let passed12 = modifiedCheck === newModifiedDate
    assert.equal(passed12, true)
    
    // The third message should be first
    let requestedData7 = await parentObj.collection({path, indexName, partitionKey, sortKey, credentials: {user}}).scan({
        params: [
            ['test', '=', 'test']
        ],
        returnData: true
    })
    let passed13 = requestedData7[0].body === 'third message'
    assert.equal(passed13, true)

    // Create a new db object but override the timestamp with our own
    let message_4 = await parentObj.collection({path, credentials: skip}).createObject({
        data: {
            body: 'fifth message',
            modifiedDate: Math.floor((Date.now())),
            test: 'test'
        },
        overrideTimestamp: newModifiedDate
    })
    let message_4_dbobject = await parentObj.collection({path, credentials: skip}).getObject({
        id: message_4.id
    })
    let passed14 = message_4_dbobject.key.ts === newModifiedDate
    assert.equal(passed14, true)

    // Vanilla Pagewise final check on overrided ts
    let requestedData8 = await parentObj.collection({path, credentials: skip}).getObjects({
        limit: 5,
        attributes: ['body']
    })
    let passed15 = (requestedData8[4].body === 'modified first message') && (requestedData8[0].body === 'fifth message')
    assert.equal(passed15, true)

    // Create a new db object with a specific member
    let message_5 = await parentObj.collection({path, credentials: skip}).createObject({
        data: {
            body: 'sixth message',
            modifiedDate: Math.floor((Date.now())),
            test: 'test',
        },
        members: {'member@gmail.com': {read: 5, write: 5}},
        objectPermission: {read: 5, write: 5}
    })
    
    // Permissions check: we should get 6 since; user doesnt have permission on all 6 but 1/6 should be an empty object
    let requestedData9 = await parentObj.collection({path, credentials: {user}}).getObjects({
        limit: 6,
        attributes: ['body']
    })
    let passed16 = (Object.keys(requestedData9[1]).length === 0)
    assert.equal(passed16, true)
    
    // Permissions check: we should get 5 since the user doesnt have permission on all 6
    let requestedData10 = await parentObj.collection({path, credentials: {user}}).batchGetObjectsByPage({
        limit: 6,
        returnData: true,
        includeID: false
    })
    let passed17 = (requestedData10.length === 5)
    assert.equal(passed17, true)
    
    let requestedData11 = await parentObj.collection({path, credentials: {user}}).batchGetObjectsByPage({
        limit: 6,
        returnData: true,
        includeID: true
    })
    let passed18 = (requestedData11.length === 5)
    assert.equal(passed18, true)
    
    let requestedData12 = await parentObj.collection({path, credentials: {user}}).batchGetObjectsByPage({
        limit: 6,
        attributes: ['body'],
        includeID: false
    })
    
    let passed19 = (requestedData12.length === 5)
    assert.equal(passed19, true)
    
    let requestedData13 = await parentObj.collection({path, credentials: {user}}).batchGetObjectsByPage({
        limit: 6,
        attributes: ['body'],
        includeID: true
    })
    let passed20 = (requestedData13.length === 5)
    assert.equal(passed20, true)
    
    // Destroy parent object and see that collection is destroyed as well
    await parentObj.destroy({credentials: skip})
    let message0StillExists = await message0_dbobject.checkExists()
    assert.equal(message0StillExists, false)
})

// it('DBObject_collection (4) - collections on collections', async function() {
//     this.timeout(u.TEST_TIMEOUT)

//     // Test data
//     let parentID = 'dbobjRefTestParent'
//     let parentData = {
//         parentKey1: {
//             subKey1: 'this is an object',
//             subKey2: 'with a collection in it',
//             messages: 'collection goes here'
//         },
//         parentKey2: 'innocent bystander'
//     }
    
//     // Test handler
//     let myHandler = new jsondb.DBObjectHandler({
//         awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
//         awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
//         awsRegion: config.AWS_REGION,
//         tableName: config.tableName,
//         subclass: null,
//         isTimeOrdered: false
//     })
    
//     // Creat the test object
//     let user = 'testUser@gmail.com'
//     let parentObj = await myHandler.createObject({
//         id: parentID,
//         data: parentData,
//         members: {'member@gmail.com': {read: 5, write: 5}},
//         creator: user,
//         allowOverwrite: true,
//         objectPermission: {read: 5, write: 5},
//     })
//     let read = await parentObj.get({credentials: high})
//     delete read.members
//     let passed = _.isEqual(parentData, read)
//     assert.equal(passed, true)

//     // Instantiate the parent object we just created
//     parentObj = myHandler.instantiate({id: parentObj.id, credentials: {user}})
    
//     // Create collection, add something to it
//     await parentObj.ensureIndexLoaded()
//     let convosPath = 'convos'
//     await parentObj.createCollection({path: convosPath})

//     // Create an object in the collection
//     let convoObj0 = await parentObj.collection({path: convosPath}).createObject({
//         data: {
//             body: 'this is a convo',
//         }
//     })
//     let passed0 = convoObj0.id.split('-').length === 2    
//     assert.equal(passed0, true)

//     // Create a collection on the object in the collection
//     await parentObj.ensureIndexLoaded()
//     convoObj0 = parentObj.collection({path: convosPath}).instantiate({id: convoObj0.id, credentials: {user}})
//     await convoObj0.ensureIndexLoaded()
//     let messagesPath = 'messages'
//     await convoObj0.createCollection({path: messagesPath})

//     // Create an object within that collection
//     let messageObj0 = await convoObj0.collection({path: messagesPath}).createObject({
//         data: {
//             body: 'this is a message'
//         }
//     })
//     let passed1 = messageObj0.id.split('-').length === 2
//     assert.equal(passed1, true)

//     // Instantiate the message object we just created
//     messageObj0 = convoObj0.collection({path: messagesPath}).instantiate({id: messageObj0.id, credentials: {user}})
//     await messageObj0.ensureIndexLoaded()
//     let threadsPath = 'threads'
//     await messageObj0.createCollection({path: threadsPath})

//     // Create an object within that collection
//     let threadObj0 = await messageObj0.collection({path: threadsPath}).createObject({
//         data: {
//             body: 'this is a thread'
//         }
//     })
//     let passed2 = threadObj0.id.split('-').length === 2
//     assert.equal(passed2, true)

//     // Make sure we can read/write to an objected in a nested, nested collection
//     threadObj0 = messageObj0.collection({path: threadsPath}).instantiate({id: threadObj0.id, credentials: {user}})
//     let attributes = {
//         title: 'this is a title'
//     }
//     await threadObj0.set({attributes})
//     let threadRead = await threadObj0.get()
//     assert.equal(threadRead.title, 'this is a title')

//     // Destroy parent object and see that collection is destroyed as well
//     await parentObj.destroy({credentials: skip})
//     let convoStillExists = await convoObj0.checkExists()
//     let messageStillExists = await messageObj0.checkExists()
//     assert.equal(convoStillExists, false)
//     assert.equal(messageStillExists, false)
// })


let low = {permission: {read: 0, write: 0}}
let medium = {permission: {read: 5, write: 5}}
let high = {permission: {read: 9, write: 9}}
let skip = {skipPermissionCheck: true}
