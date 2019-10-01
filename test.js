let assert = require('assert')
let jsondb = require('./index')
let ScanQuery = require('./src/ScanQuery')
let DynamoClient = require('./src/DynamoClient')
let config = require('./config')
let u = require('./src/u')

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


it('DynamoClient: should update, get, update, delete', async () => {

    // Clean up
    await cleanUp()

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
    console.log('confirmed can selectively overwrite keys')

    await cleanUp()
})
it('should batchGet, getPagewise', async () => {
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
            'message': 'three'
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
        limit: 3,
        exclusiveFirstSk: Date.now() - 5000,
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
    
    // let obj = {testKey: 'sdfsdfsdfsdf'}
    // await dbobject.destroy()
    // await dbobject.create(obj)
    
    // let gotten = await dbobject.get('testKey')
    // assert.equal(gotten, obj['testKey'])

})
// it('should write nested subkey without overwriting first key', async () => {
//     let obj = {asd: 'sdfsdfsdfsdf'}
//     await dbobject.destroy()
//     await dbobject.create(obj)
    
//     let gotten = await dbobject.get('asd')
//     assert.equal(gotten, obj['asd'])
// })
// it('should write and retrieve object requiring lateral split', () => {
//     assert.equal(-1, [1,2,3].indexOf(4))
// })
// it('should write and retrieve object requiring vertical split', () => {
//     assert.equal(-1, [1,2,3].indexOf(4))
// })






/* TEST DATA BELOW */

let cleanUp = async () => {
    await dynamoClient.delete({
        tableName: config.tableName,
        key: getTestKey(0)
    })
    await dynamoClient.delete({
        tableName: config.tableName,
        key: getTestKey(1)
    })
}

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