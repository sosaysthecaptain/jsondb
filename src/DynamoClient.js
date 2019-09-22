/*
More convenient handle on aws-sdk
*/

let AWS = require('aws-sdk')
let DOC = require('dynamodb-doc')


class DynamoClient {
    constructor({awsAccessKeyId, awsSecretAccessKey, awsRegion}) {
        AWS.config.update({
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
            region: awsRegion
        })

        this.doc = require('dynamodb-doc');
        this.dynamo = new this.doc.DynamoDB();
    }

    async get({tableName, key, attributes}) {
        let params = {
            TableName: tableName,
            Key: key
            // ReturnValues: 'All_OLD'
        }

        if (attributes) {
            params.AttributesToGet = attributes
        }

        let data = await this.dynamo.getItem(params).promise()
        return data.Item
    }

    /*
    Can put or update. Attributes may set keys at any level of nesting:

        attributes = {
            email: 'user@gmail.com'
            key1.subkey2.subsubkey13 = 'something deeply nested'
        }

    Builds a params object that looks like this:
        params = {
            TableName: 'jsondb_test',
            Key: {
                id: 'nested_object'
            },
            UpdateExpression: 'set email = :0, key1.subkey2.subsubkey13 = :1',
            ExpressionAttributeValues: {
                ':0': 'user@gmail.com',
                ':1': 'something deeply nested'
            }
        }
    */
    async update({tableName, key, attributes, doNotOverwrite}) {
        if (doNotOverwrite) {
            if (this.checkExists({tableName, key})) {
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
        
        let params = {
            TableName: tableName,
            Key: key,
            UpdateExpression: UpdateExpression,
            ExpressionAttributeValues: ExpressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        }
        
        let data = await this.dynamo.updateItem(params).promise().catch((err) => {
            console.log('failure in DynamoClient.update')
            throw(err)
        })
        return data.Attributes
    }

    async delete({tableName, key}) {
        let params = {
            TableName: tableName,
            Key: key,
            ReturnValues: 'ALL_OLD'
        }
        let data = await this.dynamo.deleteItem(params).promise().catch((err) => {
            throw(err)
        })
        return data
    }

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
            params.RequestItems[table_name].ProjectionExpression = projectionExpressionsString
        }
    
        let data = await this.documentClient.batchGet(params).promise().catch((err) => {
            throw(err)
        })
        let items = data.Responses[tableName]
        return items
    }

    async scan(params) {
        const data = await this.documentClient.scan(params).promise().catch((err) => {
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