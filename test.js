const assert = require('assert')
const flatten = require('flat')
const unflatten = require('flat').unflatten
const _ = require('lodash')
const jsondb = require('./index')
const ScanQuery = require('./src/ScanQuery')
const DynamoClient = require('./src/DynamoClient')
const config = require('./config')
const u = require('./src/u')

let dynamoClient = new DynamoClient({
    awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    awsRegion: config.AWS_REGION
})

// let myDBObjectHandler = new jsondb.DBObjectHandler({
//     awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
//     awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
//     awsRegion: config.AWS_REGION,
//     tableName: 'object_dev_v2'
// })

// let dbobject = new jsondb.DBObject('aBcDeFG', {
//     dynamoClient: dynamoClient,
//     tableName: config.tableName
// })


xit('DynamoClient 1: update, get, update, delete', async function() {
    this.timeout(60000)
    let key = getTestKey(1)

    // Write
    await dynamoClient.update({
        tableName: config.tableName,
        key: key,
        attributes: {
            key1: {
                subkey1: "please don't change me",
                subkey2: 'but do change me'
            },
            key2: ['asdsad', 'dfdfdsfsdfd', 42, 34]
        },
    })
    
    // Read
    let read0 = await dynamoClient.get({
        tableName: config.tableName,
        key: key
    })
    assert.equal(read0.key1.subkey1, "please don't change me")
    assert.equal(read0.key1.subkey2, "but do change me")
    
    // Overwrite one subkey
    await dynamoClient.update({
        tableName: config.tableName,
        key: key,
        attributes: {
            'key1.subkey2': 'changed!'
        }
    })
    
    // Read again
    read1 = await dynamoClient.get({
        tableName: config.tableName,
        key: key
    })
    assert.equal(read1.key1.subkey1, "please don't change me")
    assert.equal(read1.key1.subkey2, "changed!")

    // Clean up
    await dynamoClient.delete({
        tableName: config.tableName,
        key: key
    })
})
xit('DynamoClient 2: batchGet, getPagewise', async function() {
    this.timeout(60000)
    
    await dynamoClient.update({
        tableName: config.tableName,
        key: getTestKey(0),
        attributes: {
            'message': 'hardcode1'
        }
    })
    await dynamoClient.update({
        tableName: config.tableName,
        key: getTestKey(1),
        attributes: {
            'message': 'hardcode2'
        }
    })
    
    let read0 = await dynamoClient.batchGet({
        tableName: config.tableName,
        keys: [getTestKey(0), getTestKey(1)],
        attributes: ['message']
    })

    let passed0 = JSON.stringify(read0).includes('hardcode1') && JSON.stringify(read0).includes('hardcode1')
    assert.equal(passed0, true)
    
    await dynamoClient.update({
        tableName: config.tableName,
        key: getKeyWithTS(),
        attributes: {
            'message': 'one'
        }
    })
    await dynamoClient.update({
        tableName: config.tableName,
        key: getKeyWithTS(),
        attributes: {
            'message': 'two'
        }
    })
    await dynamoClient.update({
        tableName: config.tableName,
        key: getKeyWithTS(),
        attributes: {
            'message': 'three',
            'payload': 'hi!'
        }
    })
    await dynamoClient.update({
        tableName: config.tableName,
        key: getKeyWithTS(),
        attributes: {
            'message': 'four'
        }
    })
    await dynamoClient.update({
        tableName: config.tableName,
        key: getKeyWithTS(),
        attributes: {
            'message': 'five'
        }
    })

    let read2 = await dynamoClient.getPagewise({
        tableName: config.tableName,
        uid: 'testOrdered',
        limit: 3
    })
    assert.equal(read2[0].message, 'one')
    assert.equal(read2[1].message, 'two')
    assert.equal(read2[2].message, 'three')
    assert.equal(read2.length, 3)
    let startNextTimeWith = read2[1].ts
    
    let read3 = await dynamoClient.getPagewise({
        tableName: config.tableName,
        uid: 'testOrdered',
        limit: 2,
        exclusiveFirstSk: startNextTimeWith,
        ascending: true
    })
    assert.equal(read3[0].message, 'three')
    assert.equal(read3[1].message, 'four')
    
    
    let query = new ScanQuery(config.tableName)
    query.addParam({
        param: 'message',
        value: 'three', 
        message: '='
    })
    let read4 = await dynamoClient.scan(query)
    assert.equal(read4[0].message, 'three')
    assert.equal(read4[0].payload, 'hi!')
})

xit('DynamoClient 3: scan and delete', async function() {
    this.timeout(60000)
        

    await dynamoClient.delete({
        tableName: config.tableName,
        key: getTestKey(0)
    })
    await dynamoClient.delete({
        tableName: config.tableName,
        key: getTestKey(1)
    })

    let query = new ScanQuery(config.tableName)
    query.addParam({
        param: 'uid',
        value: 'testOrdered', 
        message: '='
    })
    let all = await dynamoClient.scan(query)
    
    let timestamps = []
    all.forEach((item) => {
        timestamps.push(item.ts)
    })
    for (let i = 0; i < timestamps.length; i++) {
        await dynamoClient.delete({
            tableName: config.tableName,
            key: {
                uid: 'testOrdered',
                ts: timestamps[i]
            }
        })
    }

    let leftAfterDelete = await dynamoClient.scan(query)
    assert.equal(leftAfterDelete.length, 0)

})

xit('DBObject 1: should create and get a single node object, with and without cache and index', async function() {

    this.timeout(60000)

    // Create fresh object
    let testObjID = 'dbobject_test_1'
    let dbobject = new jsondb.DBObject(testObjID, {
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    await dbobject.create(basicObj)
    
    // Read one key (from cache)
    let read0 = await dbobject.get('key1')
    let passed0 = _.isEqual(basicObj.key1, read0)
    assert.equal(passed0, true)
    
    // Read entire object (from cache)
    let read1 = await dbobject.get()
    let passed1 = _.isEqual(basicObj, read1)
    assert.equal(passed1, true)

    // Clear the variable in memory, make sure we can still get
    dbobject = null
    dbobject = new jsondb.DBObject(testObjID, {
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    
    // Starting fresh, read one key
    let read2 = await dbobject.get('key1')
    let passed2 = _.isEqual(basicObj.key1, read2)
    assert.equal(passed2, true)
    
    // Read entire object
    let read3 = await dbobject.get()
    let passed3 = _.isEqual(basicObj, read3)
    assert.equal(passed3, true)

    // Clean up
    await dbobject.destroy()
    let dbObjectExists = await dbobject.destroy()
    assert.equal(dbObjectExists, false)
})

xit('DBObject 2: should create and get an object requiring vertical split', async function() {
    this.timeout(60000)

    // Data
    let testObjID = 'dbobject_test_2'
    let sizePerKey = 200 * 1000
    let testObj = {
        k1: {
            k1s1: getVerifiableString(sizePerKey, 1),
            k1s2: getVerifiableString(sizePerKey, 2),
            k1s3: getVerifiableString(sizePerKey, 3),
        },
        k2: {
            k2s1: getVerifiableString(sizePerKey, 4),
            k2s2: getVerifiableString(sizePerKey, 5),
            k2s3: getVerifiableString(sizePerKey, 6),
        }, 
        k3: {
            k3s1: getVerifiableString(sizePerKey, 7),
            k3s2: getVerifiableString(sizePerKey, 8),
            k3s3: getVerifiableString(sizePerKey, 9),
        }
    }
    
    // Write a large object
    let dbobject = new jsondb.DBObject(testObjID, {
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    await dbobject.create(testObj)
    
    // Read one key of it from cache
    let read0 = await dbobject.get('k1.k1s3')
    let passed0 = _.isEqual(testObj.k1.k1s3, read0)
    assert.equal(passed0, true)
    
    // Read all of it from cache
    let read1 = await dbobject.get()
    let passed1 = _.isEqual(testObj, read1)
    assert.equal(passed1, true)
    
    
    // Clear the variable in memory, make sure we can still get
    dbobject = null
    dbobject = new jsondb.DBObject(testObjID, {
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    
    
    // Starting fresh, read one key
    let read2 = await dbobject.get('k1.k1s3')
    let passed2 = _.isEqual(testObj.k1.k1s3, read2)
    assert.equal(passed2, true)
    

    // Read entire object
    let read3 = await dbobject.get()
    let passed3 = _.isEqual(testObj, read3)
    assert.equal(passed3, true)
    
    // Clean up
    await dbobject.destroy()
    let dbObjectExists = await dbobject.destroy()
    assert.equal(dbObjectExists, false)
})

it('DBObject 3: lateral split', async function() {
    this.timeout(20000)

    // Data
    let testObjID = 'dbobject_test_3'
    let testObj = {
        giantThing: getVerifiableString(1000 * 1000, 1),
    }
    
    // Write a large object
    let dbobject = new jsondb.DBObject(testObjID, {
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    await dbobject.create(testObj)

    
    // Read key by name from cache
    let read0 = await dbobject.get('giantThing')
    let passed0 = _.isEqual(testObj.giantThing, read0)
    assert.equal(passed0, true)
    
    // Read all of it from cache
    let read1 = await dbobject.get()
    let passed1 = _.isEqual(testObj, read1)
    assert.equal(passed1, true)
    
    
    // Clear the variable in memory, make sure we can still get
    dbobject = null
    dbobject = new jsondb.DBObject(testObjID, {
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    
    
    // Starting fresh, read one key
    let read2 = await dbobject.get('giantThing')
    let passed2 = _.isEqual(testObj.giantThing, read2)
    assert.equal(passed2, true)
    
    debugger

    // Read entire object
    let read3 = await dbobject.get()
    let passed3 = _.isEqual(testObj, read3)
    assert.equal(passed3, true)
    
    // Clean up
    await dbobject.destroy()
    let dbObjectExists = await dbobject.destroy()
    assert.equal(dbObjectExists, false)
})








// xit('DBObject 3: something', async function() {
//     this.timeout(10000)
    
//     let bigDBObj = new jsondb.DBObject('bigTestObj', {
//         dynamoClient: dynamoClient,
//         tableName: config.tableName
//     })
//     await bigDBObj.create(getTooBig1())

//     debugger
//     bigDBObj = null
//     debugger
//     bigDBObj = new jsondb.DBObject('bigTestObj', {
//         dynamoClient: dynamoClient,
//         tableName: config.tableName
//     })
    
//     let entireObject = await bigDBObj.get()
//     debugger
    
    
//     // let read2 = await dbobject.get()
//     // let flatRead = flatten(read2)
//     // let flatOrig = flatten(basicObj)
//     // let keys = Object.keys(flatOrig)
//     // for (let i = 0; i < keys.length; i++) {
//     //     let key = keys[i]
//     //     assert.equal(flatRead[key], flatOrig[key])
//     // }
// })

xit('tools', async function() {

    let str = getVerifiableString(1000, 3)
    let str2 = str
    let theSame = _.isEqual(str, str2)
    let res = verifyString(str, 2)
})





/* TEST DATA */


let getTestKey = (num) => {
    return {uid: `testKey${num}`, ts: 0}
} 
let getKeyWithTS = () => {
    return {uid: 'testOrdered', ts: Date.now()}
}

let basicObj = {
    key1: {
        subkey1: 'this is key1.subkey1',
        subkey2: 'this is key1.subkey2',
        subkey3: {
            subsubkey1: 8882,
            subsubkey2: 'asd',
            subsubkey3: null,
        },
    },
    key2: {
        subkey1: 'this is key2.subkey1',
        subkey2: 'this is key2.subkey2',
        subkey3: 'this is key2.subkey3',
    },
    key3: {
        subkey1: 'this is key3.subkey1',
        subkey2: 'this is key3.subkey2',
        subkey3: 'this is key3.subkey3',
    }
}




let requiresRestructuring = {
    'one.two.three' : 'and four'
}

getDemo2 = () => {
    return {
        one: {
            sub1: u.getStringOfSize(100),
            sub2: u.getStringOfSize(60),
            sub3: u.getStringOfSize(1000),
            sub4: u.getStringOfSize(830)
        },
        two: {
            second_sub: u.getStringOfSize(200)
        }, 
        three: {
            third_sub: {
                third_sub_sub: u.getStringOfSize(2000)
            }
        }
    }
}

getTooBig1 = () => {
    return {
        one: {
            sub1: u.getStringOfSize(100000),
            sub2: u.getStringOfSize(100000),
            sub3: u.getStringOfSize(100000),
            sub4: u.getStringOfSize(100000)
        },
        two: {
            second_sub: u.getStringOfSize(50000)
        }, 
        three: {
            third_sub: {
                third_sub_sub: u.getStringOfSize(500),
                fourth_sub_sub: u.getStringOfSize(100),
                fifth_sub_sub: u.getStringOfSize(1800)
            }
        },
        // four: u.getStringOfSize(600000)
    }
}
        
getTooBig2 = () => {
            
}



/* TEST UTILS */

getVerifiableString = (length, multiplier) => {
    multiplier = multiplier || 1
    let str = ''
    let i = 0
    while(str.length < length) {
        str += String(i * multiplier) + ' '
        i++
    }
    return str.trim()
}

verifyString = (str, multiplier) => {
    multiplier = multiplier || 1
    let split = str.split(' ')
    let index = 0
    split.forEach((num) => {
        num = Number(num)
        if (num !== index * multiplier) {
            return false
        }
        index++
    })
    if (index !== split.length) {
        return false
    }
    return true
}