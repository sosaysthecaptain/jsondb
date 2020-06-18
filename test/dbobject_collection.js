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
//     let passed9 = (read9[0].firstName === 'danny') && (read9[0].friends.includes('irene'))
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
    
    let myHandlerForGSI = new jsondb.DBObjectHandler({
        awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        awsRegion: config.AWS_REGION,
        tableName: config.tableName,
        subclass: null,
        isTimeOrdered: true,
        indexName: config.indexName,             
        partitionKey: 'uid',              
        sortKey: 'XXmodifiedDate',    
    })
    
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
    

    await parentObj.ensureIndexLoaded()
    
    // Create collection, add something to it
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
            modifiedDate: Date.now()
        }
    })
    let message_1 = await parentObj.collection({path, credentials: {user}}).createObject({
        data: {
            body: 'second message',
            modifiedDate: Date.now() + 100
        }
    })
    let message_2 = await parentObj.collection({path, credentials: {user}}).createObject({
        data: {
            body: 'third message',
            modifiedDate: Date.now() + 200
        }
    })
    let message_3 = await parentObj.collection({path, credentials: {user}}).createObject({
        data: {
            body: 'fourth message',
            modifiedDate: Date.now() + 300
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
    // await parentObj.ensureIndexLoaded()
    // let seriesKey = await parentObj.get({path})
    
    // myHandlerForGSI.instantiate({id: seriesKey})
    myHandlerForGSI.instantiate({id: 'dbobjRefTestParent_XXparentKey1_x_XXmessages'})
    let requestedData = await myHandlerForGSI.batchGetObjectsByPage({
        seriesKey: 'dbobjRefTestParent_XXparentKey1_x_XXmessages',
        limit: 4,
        returnData: true,
        includeID: true,
        credentials: {skipPermissionCheck: true}
    })
    let passed5 = (requestedData[0].body === 'modified first message') && (requestedData[3].body === 'fourth message')
    assert.equal(passed5, true)
    
    // Destroy parent object and see that collection is destroyed as well
    await parentObj.destroy({credentials: skip})
    let message0StillExists = await message0_dbobject.checkExists()
    assert.equal(message0StillExists, false)
})


let low = {permission: {read: 0, write: 0}}
let medium = {permission: {read: 5, write: 5}}
let high = {permission: {read: 9, write: 9}}
let skip = {skipPermissionCheck: true}
