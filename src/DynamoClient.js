/*
More convenient handle on aws-sdk
*/

let AWS = require('aws-sdk')


class DynamoClient {
    constructor(region, accessKeyId, secretAccessKey) {
        AWS.config.update({
            region: region,
            accessKeyId: accessKeyId,
            secretAccessKey: accessKeyId
        })

        this.documentClient = new AWS.DynamoDB.DocumentClient()
    }

    async get({tableName, key, attributes}) {
        let params = {
            TableName: tableName,
            Key: key,
            ReturnValues: 'All_OLD'
        }

        if (attributes) {
            params.AttributesToGet = attributes
        }
    
        let data = await this.documentClient.get(params).promise().catch((err) => {
            throw(err)
        })

        return data.Item
    }

    async update({tableName, key, attributes, doNotOverwrite}) {
        // maybe do this properly?
        if (do_not_overwrite) {
            if (this.checkExists({tableName, key})) {
                throw new Error('Object already exists at specified key')
            }
        }

        let constructUpdateExpression = () => {
            let updateExpression = 'set '
            Object.keys(attributes).forEach((attributeKey) => {
                let addition = `${attributeKey} = :${attributeKey}, `
                updateExpression += addition
            })
            updateExpression = updateExpression.slice(0, -2)  // trailing comma
            return updateExpression
        }
        let constructExpressionAttributeValues = () => {
            let expressionAttributeValues = {}

            Object.keys(attributes).forEach((attribute_key) => {
                let key_string = ':' + attribute_key
                expressionAttributeValues[key_string] = attributes[attribute_key]
            })
            return expressionAttributeValues
        }
        
        let params = {
            TableName: tableName,
            Key: key,
            UpdateExpression: constructUpdateExpression(),
            ExpressionAttributeValues: constructExpressionAttributeValues(),
            ReturnValues: 'ALL_NEW'
        }

        debugger
        
        let data = await this.documentClient.update(params).promise().catch((err) => {
            throw(err)
        })
        debugger
        return data
    }

    async delete({tableName, key}) {
        let params = {
            TableName: tableName,
            Key: key,
            ReturnValues: 'ALL_OLD'
        }
        let data = await this.documentClient.delete(params).promise().catch((err) => {
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