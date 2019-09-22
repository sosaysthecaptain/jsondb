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


        this.doc_client = new AWS.DynamoDB.DocumentClient()
        
        var params = { }
        params.TableName = "user_dev_v2";
        var key = { "id": "demo_object_3" };
        params.Key = key;

        // this.dynamo.getItem(params, function(err, data) {
        //     if (err) {
        //         debugger
        //         console.log(err);
        //     }
        //     else {
        //         debugger
        //         console.log(data)
        //     }
        // });


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

        this.dynamo.getItem(params, function(err, data) {
            if (err) {
                debugger
                console.log(err);
            }
            else {
                return data.Item
                debugger
                console.log(data)
            }
        });
    
        // let data = await this.doc_client.get(params).promise().catch((err) => {
        //     debugger
        //     throw(err)
        // })
        // debugger

        // return data.Item
    }

    async update({tableName, key, attributes, doNotOverwrite}) {
        if (doNotOverwrite) {
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
        
        let data = await this.dynamo.updateItem(params).promise().catch((err) => {
            console.log('failure in DynamoClient.update')
            throw(err)
        })
        return data.Attributes
          


        // let data = await this.dynamo.updateItem(params).promise().catch((err) => {
        //     debugger
        //     throw(err)
        // })
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