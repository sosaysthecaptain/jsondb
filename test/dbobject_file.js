const assert = require('assert')
const _ = require('lodash')
const jsondb = require('../index')
const config = require('../config')
const u = require('../src/u')

let s3Client = new jsondb.S3Client({
    awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    awsRegion: config.AWS_REGION, 
    bucketName: config.bucketName
})


it('DBObject_file  - reading & writing S3 files', async function() {
    this.timeout(u.TEST_TIMEOUT)

    let fileName = 'test_file'
    let testBody = 'this is standing in for a giant file'
    let contentType = 'image/jpeg'
    let encoding = 'base64'

    let testID = 's3_file_test_1'
    let testObj = {
        thing: 'that will contain a file',
        inS3: 'right here',
        with: {
            some: 'other',
            stuff: 'elsewhere'
        }
    }
    
    let handler = new jsondb.DBObjectHandler({
        awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        awsRegion: config.AWS_REGION,
        tableName: config.tableName,
        bucketName: config.bucketName,
        subclass: null,
        timeOrdered: false
    })
    
    // Write with client
    let fileUrl = await s3Client.write({key: fileName, body: testBody, contentType, encoding})
    let passed0 = isS3Link(fileUrl)
    assert.equal(passed0, true)
    
    // Read with client
    let read1 = await s3Client.read(fileName)
    let passed1 = read1.toString() === testBody
    assert.equal(passed1, true)

    
    // Delete with client
    await s3Client.delete(fileName)

    // Create dbobject
    let obj = await handler.createObject({id: testID, data: testObj, allowOverwrite: true})
    let read2 = await obj.get({path: 'inS3'})
    assert.equal(read2, 'right here')
    
    // Set file 
    let read3 = await obj.setFile({path: 'inS3', data: testBody})
    let passed3 = isS3Link(read3)
    assert.equal(passed3, true)
    
    // Get file as link
    let read4 = await obj.getFile({path: 'inS3'})
    let passed4 = isS3Link(read4)
    assert.equal(passed4, true)
    
    // Get file as buffer
    let read5 = await obj.getFile({path: 'inS3', returnAsBuffer: true})
    let passed5 = read5.toString() === testBody
    assert.equal(passed5, true)
    
    // Delete the file by destroying the object
    await obj.destroy()
})


let isS3Link = (link) => {
    return link.startsWith(`https://${config.bucketName}.s3`)
}