const assert = require('assert')
const _ = require('lodash')
const ScanQuery = require('../src/ScanQuery')
const DynamoClient = require('../src/DynamoClient')
const config = require('../config')

let dynamoClient = new DynamoClient({
    awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    awsRegion: config.AWS_REGION
})


it('DynamoClient 1: update, get, update, delete', async function() {
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
it('DynamoClient 2: batchGet, getObjects', async function() {
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

    let read2 = await dynamoClient.getObjects({
        tableName: config.tableName,
        uid: 'testOrdered',
        limit: 3
    })
    assert.equal(read2[0].message, 'one')
    assert.equal(read2[1].message, 'two')
    assert.equal(read2[2].message, 'three')
    assert.equal(read2.length, 3)
    let startNextTimeWith = read2[1].ts
    
    let read3 = await dynamoClient.getObjects({
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

it('DynamoClient 3: scan and delete', async function() {
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

let getTestKey = (num) => {
    return {uid: `testKey${num}`, ts: 0}
} 
let getKeyWithTS = () => {
    return {uid: 'testOrdered', ts: Date.now()}
}