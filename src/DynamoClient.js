/*
More convenient handle on aws-sdk, instantiated with aws credentials})
*/

let aws = require('aws-sdk')

let u = require('./u')

class DynamoClient {
    constructor({awsAccessKeyId, awsSecretAccessKey, awsRegion}) {
        this.awsAccessKeyId = awsAccessKeyId
        this.awsSecretAccessKey = awsSecretAccessKey
        this.awsRegion = awsRegion
        aws.config.update({
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
            region: awsRegion
        })

        this.doc = require('dynamodb-doc');
        let awsClient = new aws.DynamoDB()
        this.dynamo = new this.doc.DynamoDB(awsClient);
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
    async getRange({tableName, indexName, partitionKey, sortKey, uid, startTime, endTime, ascending}) {
        
        partitionKey = partitionKey || u.PK
        sortKey = sortKey || u.SK

        let KeyConditionExpressionString = `${partitionKey} = :0 AND ${sortKey} BETWEEN :1 AND :2`   
        
        let params = {
            TableName: tableName,
            ExpressionAttributeValues: {
                ':0': uid,
                ':1': startTime,
                ':2' : endTime,
            },
            KeyConditionExpression: KeyConditionExpressionString,
            ScanIndexForward: ascending,
        }

        if (indexName) {
            params.IndexName = indexName
        }

        let data = await this.dynamo.query(params).promise().catch((err) => {
            console.log('failure in DynamoClient.getRange')
            throw(err)
        })
        return data.Items
    }
    
    // Gets pagewise for uid, starting at exclusiveFirstSk, limited, in specified order
    // ASSUMES STANDARD uid/ts
    async getObjects({tableName, indexName, partitionKey, sortKey, uid, limit, exclusiveFirstSk, ascending}) {
        if (exclusiveFirstSk) {exclusiveFirstSk = Number(exclusiveFirstSk)}
        limit = limit || 100

        partitionKey = partitionKey || u.PK
        sortKey = sortKey || u.SK

        let KeyConditionExpression = `${partitionKey} = :0 AND ${sortKey} < :1`     
        if (ascending) {
            exclusiveFirstSk = exclusiveFirstSk || 0
            KeyConditionExpression = `${partitionKey} = :0 AND ${sortKey} > :1`
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

        if (indexName) {
            params.IndexName = indexName
        }
                
        let data = await this.dynamo.query(params).promise().catch((err) => {
            console.log('failure in DynamoClient.getObjects')
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
    async update({tableName, key, attributes, doNotOverwrite, returnData}) {

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
        if (returnData) {returnValues = 'ALL_NEW'}
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
        let params = scanQueryInstance.write()
        let data = await this.dynamo.scan(params).promise().catch((err) => {
            throw(err)
        })

        let items = data.Items

        // If we have a LastEvaluatedKey, repeat the scan until we've covered everything
        let LastEvaluatedKey = data.LastEvaluatedKey
        let scannedCount = data.ScannedCount
        let passes = 1
        while (LastEvaluatedKey) {
            params.ExclusiveStartKey = LastEvaluatedKey
            let additionalData = await this.dynamo.scan(params).promise().catch((err) => {throw(err)})
            scannedCount += additionalData.ScannedCount
            passes += 1
            LastEvaluatedKey = additionalData.LastEvaluatedKey 
            additionalData.Items.forEach(item=>{
                items.push(item)
            })
        }
        console.log(`DynamoClient.scan returning ${items.length} results, scanned ${scannedCount} records in ${passes} passes`)
        return items
    }
    
    async query({
        scanQueryInstance, 
        seriesKey,
        indexName,                  // GSI ONLY
        partitionKey,               // GSI ONLY
        ascending              
    }) {
        let params = scanQueryInstance.write()

        // For GSI use, we can specify partitionKey separately
        partitionKey = partitionKey || u.PK
        
        // Add seriesKey as KeyConditionExpression
        params.ExpressionAttributeNames = params.ExpressionAttributeNames || {}
        params.ExpressionAttributeValues = params.ExpressionAttributeValues || {}
        params.KeyConditionExpression = `#pk = :pk_string`
        params.ExpressionAttributeNames['#pk'] = partitionKey       // 'uid' or GSI value
        params.ExpressionAttributeValues[':pk_string'] = seriesKey
        params.ScanIndexForward = ascending || false
        
        if (indexName) {
            params.IndexName = indexName
        }

        const data = await this.dynamo.query(params).promise().catch((err) => {throw(err)})

        let items = data.Items

        // // If we have a LastEvaluatedKey, repeat the query until we've covered everything
        // let LastEvaluatedKey = data.LastEvaluatedKey
        // while (LastEvaluatedKey) {
        //     params.ExclusiveStartKey = LastEvaluatedKey
        //     let additionalData = await this.dynamo.query(params).promise().catch((err) => {throw(err)})
        //     LastEvaluatedKey = additionalData.LastEvaluatedKey 
        //     additionalData.Items.forEach(item=>{
        //         items.push(item)
        //     })
        // }

        return items
    }

    async checkExists({tableName, key}) {
        let item = await this.get({tableName, key})
        if (item) {
            return true
        }
    }
}

module.exports = DynamoClient