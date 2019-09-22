let AWS = require('aws-sdk')

let dynamo = module.exports

class DynamoClient {
    constructor(region, accessKeyId, secretAccessKey) {
        AWS.config.update({
            region: region,
            accessKeyId: accessKeyId,
            secretAccessKey: accessKeyId
        })
    }

    get() {

    }

    update() {

    }

    delete() {

    }

    batchGet() {

    }

    scan() {

    }
}

module.exports = DynamoClient