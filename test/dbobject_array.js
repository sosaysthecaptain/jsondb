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
it('DBObject_array (1)', async function() {

    this.timeout(u.TEST_TIMEOUT)

    // Create fresh object
    let testObjID = 'dbobject_array_1'
    let dbobject = new jsondb.DBObject({
        id: testObjID,
        dynamoClient: dynamoClient,
        tableName: config.tableName
    })
    await dbobject.ensureDestroyed()
    debugger
    await dbobject.create({data: testObj})
    debugger
    
    // Read one key (from cache)
    let read0 = await dbobject.get()
    debugger
    let passed0 = _.isEqual(testObj, read0)
    assert.equal(passed0, true)
    
    let read1 = await dbobject.get({path: 'imanobject.arr'})
    let passed1 = _.isEqual(testObj.imanobject.arr, read1)
    assert.equal(passed1, true)
    debugger
    
    let read2 = await dbobject.get({path: 'imanarray'})
    let passed2 = _.isEqual(testObj.imanarray, read2)
    assert.equal(passed2, true)
    debugger
    
   
    // Clean up
    await dbobject.destroy()
    // assert.equal(dbObjectExists, false)
})

let testObj = {
    imanarray: ['one, two, three'],
    imastring: "I'm a string",
    imanumber: 12345,
    imanobject: {
        str: 'asdasdadas',
        num: 123,
        arr: ['first', 'second', 'third']
    }

}