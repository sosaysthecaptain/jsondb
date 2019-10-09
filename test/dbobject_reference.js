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


it('DBObject_reference (1) - basic operations', async function() {
    this.timeout(u.TEST_TIMEOUT)

    let parentID = 'dbobj_ref_test_user1'
    let parentData = {
        parentKey1: {
            subKey1: 'adasdasdasd',
            subKey2: 'child will go here'
        },
        parentKey2: 'this one too'
    }
    let childID = 'dbobj_ref_test_user2'
    let childData = {
        childKey1: 'on child',
        childKey2: {
            more: 'ordinary values',
            go: 'here'
        }
    }
    
    let myHandler = new jsondb.DBObjectHandler({
        awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        awsRegion: config.AWS_REGION,
        tableName: config.tableName,
        subclass: null,
        timeOrdered: false
    })
    
    let parentObj = await myHandler.createObject(parentID, parentData)
    let childObj = await myHandler.createObject(childID, childData)
    let read0 = await parentObj.get()

    let passed0 = _.isEqual(parentData, read0)
    assert.equal(passed0, true)
    let read1 = await await childObj.get()
    let passed1 = _.isEqual(childData, read1)
    assert.equal(passed1, true)
    
    // Set & get reference
    parentObj.setReference('parentKey1.subKey2', childID)
    let gottenReference = await parentObj.getReference('parentKey1.subKey2')
    debugger
    let passed2 = _.isEqual(gottenReference.id, gottenReference)
    assert.equal(passed2, true)
    
    // Get directly
    let gottenDirectly = await parentObj.getReference('parentKey1.subKey2').get('childKey1')
    debugger
    let passed3 = _.isEqual(gottenDirectly, 'on child')
    assert.equal(passed3, true)
    
    // If entire object is gotten, reference will just be an ID
    let entireObj = await parentObj.get()
    debugger
    let expected4 = u.copy(parentData)
    expected4.parentKey1.subKey2 = childID
    let passed4 = _.isEqual(entireObj, expected4)
    assert.equal(passed4, true)
    
    // Destroy
    await parentObj.destroy()
    debugger
    let parentExists = await parentObj.checkExists()
    let childExists = await childObj.checkExists()
    let passed5 = !parentExists && !childExists
    assert.equal(passed5, true)
})
