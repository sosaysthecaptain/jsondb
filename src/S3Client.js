let aws = require('aws-sdk')

class S3Client {
    constructor({awsAccessKeyId, awsSecretAccessKey, awsRegion, bucketName}) {
        this.s3 = new aws.S3({apiVersion: '2006-03-01'})
        aws.config.update({
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
            region: awsRegion
        })
        this.bucketName = bucketName
    }

    async write(key, body) {
        let params = {
            Bucket: this.bucketName, 
            Key: key, 
            Body: body,
            ACL: "bucket-owner-full-control"
        }
        let data = await this.s3.upload(params).promise().catch(err => {
            console.log('failure in S3Client.write')
            throw(err)
        })
        return data.Location
    }
    
    async read(key) {
        let params = {
            Bucket: this.bucketName, 
            Key: key
        }
        let data = await this.s3.getObject(params).promise().catch(err => {
            console.log('failure in S3Client.read')
            throw(err)
        })
        return data.Body
        
    }
    
    async delete(key) {
        let params = {
            Bucket: this.bucketName, 
            Key: key
        }
        await this.s3.deleteObject(params).promise().catch(err => {
            console.log('failure in S3Client.delete')
            throw(err)
        })
    }

    async getSignedLink(key, seconds) {
        let url = this.s3.getSignedUrl('getObject', {
            Bucket: this.bucketName,
            Key: key,
            Expires: seconds
        })
        return url
    }

}




module.exports = S3Client