const assert = require('assert')
const _ = require('lodash')
const jsondb = require('../index')
const config = require('../config')
const u = require('../src/u')

let s3Client = new jsondb.S3Client({
    awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    awsRegion: config.AWS_REGION, 
    bucketName: 'jsondb-test-bucket'
})


it('DBObject_file  - reading & writing S3 files', async function() {
    this.timeout(u.TEST_TIMEOUT)

    let fileName = 'test_file'
    let testBody = 'this is standing in for a giant file'

    let testID = 's3_file_test_1'
    let testObj = {
        thing: 'that will contain a',
        file: 'right here',
        with: {
            some: 'other',
            stuff: 'elsewhere'
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

    // Write with client
    let read0 = await s3Client.write(fileName, testBody)
    let passed0 = read0.startsWith(`https://${s3Client.bucketName}.s3`)
    assert.equal(passed0, true)
    
    // Read with client
    let read1 = await s3Client.read(fileName)
    let passed1 = read1.toString() === testBody
    assert.equal(passed1, true)
    
    // Delete with client
    let deleted = await s3Client.delete(fileName)
    assert.equal(deleted, true)






    

})
