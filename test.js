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
    tableName: 'jsondb_test_3',
    permissionLevel: null,
    isTopLevel: true,
    isNew: true,
    size: 0
})


it('should retrieve object', async () => {
    
    let obj = {testKey: 'sdfsdfsdfsdf'}
    await dbobject.destroy()
    await dbobject.create(obj)
    
    let gotten = await dbobject.get('testKey')
    assert.equal(gotten, obj['testKey'])

})
it('should write nested subkey without overwriting first key', async () => {
    let obj = {asd: 'sdfsdfsdfsdf'}
    await dbobject.destroy()
    await dbobject.create(obj)
    
    let gotten = await dbobject.get('asd')
    assert.equal(gotten, obj['asd'])
})
it('should write and retrieve object requiring lateral split', () => {
    assert.equal(-1, [1,2,3].indexOf(4))
})
it('should write and retrieve object requiring vertical split', () => {
    assert.equal(-1, [1,2,3].indexOf(4))
})






/* TEST DATA BELOW */

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