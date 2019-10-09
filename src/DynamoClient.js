/*
More convenient handle on aws-sdk, instantiated with AWS credentials
*/

let AWS = require('aws-sdk')
let DOC = require('dynamodb-doc')


class DynamoClient {
    constructor({awsAccessKeyId, awsSecretAccessKey, awsRegion}) {
        this.awsAccessKeyId = awsAccessKeyId
        this.awsSecretAccessKey = awsSecretAccessKey
        this.awsRegion = awsRegion
        AWS.config.update({
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
            region: awsRegion
        })

        this.doc = require('dynamodb-doc');
        this.dynamo = new this.doc.DynamoDB();
    }

    // Gets single object by id
    async get({tableName, key, attributes}) {
        let params = {
            TableName: tableName,
            Key: key
            // ReturnValues: 'All_OLD'
        }

        if (attributes) {
            params.AttributesToGet = attributes
        }

        let data = await this.dynamo.getItem(params).promise().catch((err) => {
            console.log('failure in DynamoClient.get')
            throw(err)
        })
        if (data.Item) {
            return data.Item
        }
        return undefined
    }

    // Gets a list by array of keys
    async batchGet({tableName, keys, attributes}) {
        let params = {RequestItems: {}}
        params.RequestItems[tableName] = {
            Keys: keys,
        }
    
        if (attributes) {
            let projectionExpressionsString = ''
            attributes.forEach((attribute) => {
                projectionExpressionsString += attribute + ', '
            })
            projectionExpressionsString = projectionExpressionsString.slice(0, -2)
            params.RequestItems[tableName].ProjectionExpression = projectionExpressionsString
        }
    
        let data = await this.dynamo.batchGetItem(params).promise().catch((err) => {
            console.log('failure in DynamoClient.batchGet')
            throw(err)
        })
        let items = data.Responses[tableName]
        return items
    }

    // Gets all for uid with ts in specified range, ordered only
    async getRange({tableName, uid, startTime, endTime, ascending}) {
        let params = {
            TableName: tableName,
            ExpressionAttributeValues: {
                ':0': uid,
                ':1': startTime,
                ':2' : endTime,
            },
            KeyConditionExpression: 'uid = :0 AND ts BETWEEN :1 AND :2',
            ScanIndexForward: ascending,
        }

        let data = await this.dynamo.query(params).promise().catch((err) => {
            console.log('failure in DynamoClient.getRange')
            debugger
            throw(err)
        })
        return data.Items
    }
    
    // Gets pagewise for uid, starting at exclusiveFirstSk, limited, in specified order
    // ASSUMES STANDARD uid/ts
    async getPagewise({tableName, uid, limit, exclusiveFirstSk, ascending}) {
        if (exclusiveFirstSk) {exclusiveFirstSk = Number(exclusiveFirstSk)}
        limit = limit || 100
        
        let KeyConditionExpression = 'uid = :0 AND ts < :1'
        if (ascending) {
            exclusiveFirstSk = exclusiveFirstSk || 0
            KeyConditionExpression = 'uid = :0 AND ts > :1'
        } else {
            exclusiveFirstSk = exclusiveFirstSk || 999999999999999
        }

        let params = {
            TableName: tableName,
            ExpressionAttributeValues: {
                ':0': uid,
                ':1': exclusiveFirstSk
            },
            KeyConditionExpression: KeyConditionExpression,
            ScanIndexForward: ascending,
            Limit: limit
        }
                
        let data = await this.dynamo.query(params).promise().catch((err) => {
            console.log('failure in DynamoClient.getPagewise')
            throw(err)
        })
        return data.Items
    }

    /*
    Can put or update, ordered or unordered. Attributes may set keys at any level of nesting:

        attributes = {
            email: 'user@gmail.com'
            key1.subkey2.subsubkey13 = 'something deeply nested'
        }

    Builds a params object that looks like this:
        params = {
            TableName: 'jsondb_test',
            Key: {
                uid: 'nested_object'
            },
            UpdateExpression: 'set email = :0, key1.subkey2.subsubkey13 = :1',
            ExpressionAttributeValues: {
                ':0': 'user@gmail.com',
                ':1': 'something deeply nested'
            }
        }
    */
    async update({tableName, key, attributes, doNotOverwrite, read}) {

        if (doNotOverwrite) {
            if (await this.checkExists({tableName, key})) {
                throw new Error('Object already exists at specified key')
            }
        }
        
        let ExpressionAttributeValues = {}
        let UpdateExpression = 'set '
        let index = 0
        Object.keys(attributes).forEach((attributeKey) => {
            let newValueKey = `:${index}`
            UpdateExpression += `${attributeKey} = ${newValueKey}, `
            ExpressionAttributeValues[newValueKey] = attributes[attributeKey]
            index += 1
        })
        UpdateExpression = UpdateExpression.slice(0, -2)  // trailing comma
        
        let returnValues = 'NONE'
        if (read) {returnValues = 'ALL_NEW'}
        let params = {
            TableName: tableName,
            Key: key,
            UpdateExpression: UpdateExpression,
            ExpressionAttributeValues: ExpressionAttributeValues,
            ReturnValues: returnValues,
        }
        
        let data = await this.dynamo.updateItem(params).promise().catch((err) => {
            console.log('failure in DynamoClient.update')
            throw(err)
        })
        return data.Attributes
    }

    async deleteAttributes({tableName, key, attributes}) {
        let UpdateExpression = 'REMOVE '
        attributes.forEach((attributeKey) => {
            UpdateExpression += attributeKey + ', '
        })
        UpdateExpression = UpdateExpression.slice(0, -2)  // trailing comma
        
        let params = {
            TableName: tableName,
            Key: key,
            UpdateExpression: UpdateExpression,
            ReturnValues: 'ALL_OLD'
            // ReturnValues: 'NONE'
        }
        
        let data = await this.dynamo.updateItem(params).promise().catch((err) => {
            console.log('failure in DynamoClient.deleteAttributes')
            throw(err)
        })
        return data
    }

    async delete({tableName, key}) {
        let params = {
            TableName: tableName,
            Key: key
        }
        return await this.dynamo.deleteItem(params).promise().catch((err) => {
            console.log('failure in DynamoClient.delete')
            throw(err)
        })
    }

    // See ScanQuery.js for details on params API
    async scan(scanQueryInstance) {
        let params = scanQueryInstance.getParamsObject()
        debugger
        const data = await this.dynamo.scan(params).promise().catch((err) => {
            throw(err)
        })
        return data.Items
    }

    async checkExists({tableName, key}) {
        let item = await this.get({tableName, key})
        if (item) {
            return true
        }
    }
}

module.exports = DynamoClient