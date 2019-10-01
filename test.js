const assert = require('assert')
const flatten = require('flat')
const unflatten = require('flat').unflatten
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

let myDBObjectHandler = new jsondb.DBObjectHandler({
    awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    awsRegion: config.AWS_REGION,
    tableName: 'object_dev_v2'
})

let dbobject = new jsondb.DBObject({
    id: 'aBcDeFG',
    dynamoClient: dynamoClient,
    tableName: config.tableName,
    permissionLevel: null,
    isTopLevel: true,
    isNew: true,
    size: 0
})


it('DynamoClient: update, get, update, delete', async () => {
    let new_attributes = {
        'key1.subkey2': 'changed automatically a second time'
    }

    // Write
    await dynamoClient.update({
        tableName: config.tableName,
        key: getTestKey(0),
        attributes: {
            key1: {
                subkey1: "please don't change me",
                subkey2: 'but do change me'
            },
            key2: ['asdsad', 'dfdfdsfsdfd', 42, 34]
        },
    })
    
    // Read
    let read1 = await dynamoClient.get({
        tableName: config.tableName,
        key: getTestKey(0)
    })
    assert.equal(read1.key1.subkey1, "please don't change me")
    assert.equal(read1.key1.subkey2, "but do change me")
    
    // Overwrite one subkey
    await dynamoClient.update({
        tableName: config.tableName,
        key: getTestKey(0),
        attributes: {
            'key1.subkey2': 'changed!'
        }
    })
    
    // Read again
    read2 = await dynamoClient.get({
        tableName: config.tableName,
        key: getTestKey(0)
    })
    assert.equal(read2.key1.subkey1, "please don't change me")
    assert.equal(read2.key1.subkey2, "changed!")
})
it('DynamoClient: batchGet, getPagewise', async function() {

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

    let read1 = await dynamoClient.batchGet({
        tableName: config.tableName,
        keys: [getTestKey(0), getTestKey(1)],
        attributes: ['message']
    })
    assert.equal(read1[0].message, 'hardcode1')
    assert.equal(read1[1].message, 'hardcode2')

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

it('DynamoClient: scan and delete', async function() {
    this.timeout(10000)
        

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

it('DBObject: create, cacheGet', async function() {
    this.timeout(10000)

    await dbobject.destroy()
    await dbobject.create(basicObj)
    // await dbobject.create(getTooBig1())
    
    // let data = await dbobject.get('one.sub1')
    let read1 = await dbobject.get('key1')
    assert.equal(JSON.stringify(read1), JSON.stringify(basicObj.key1))
    
    let read2 = await dbobject.get()
    let flatRead = flatten(read2)
    let flatOrig = flatten(basicObj)
    let keys = Object.keys(flatOrig)
    for (let i = 0; i < keys.length; i++) {
        let key = keys[i]
        assert.equal(flatRead[key], flatOrig[key])
    }
})





/* TEST DATA BELOW */


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
        four: u.getStringOfSize(600000)
    }
}
        
getTooBig2 = () => {
            
}


// assert.equal('a', 'a')

// describe('Array', () => {
//     describe('#indexOf()', () => {
//         it('should return -1 when the value is not present', () => {
//             assert.equal(-1, [1,2,3].indexOf(4))
//         })
//     })
// })