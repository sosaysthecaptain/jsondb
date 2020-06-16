/*
Use this to generate scan queries for dynamo, to be used in dynamo.scan
Example usage:
let scan_query = new db.ScanQuery('User')
scan_query.add_param('is_lawyer', true, '=')
scan_query.add_param('expertises', 'auto accidents', 'contains', 'AND')
scan_query.add_param('states', 'California', 'contains', 'AND')
let paramsObject = scan_query.write()

An example query:
    params = {
        TableName: "User"
        ExpressionAttributeValues: {
            :key_0: false,
            :key_1: "auto accidents",
            :key_2: "California"
        },
        FilterExpression: "is_lawyer = :key_0 AND (contains (expertises, :key_1)) AND (contains (states, :key_2))"
    }


Specify partitionKey and sortKey to override 'uid' and 'ts', for GSI support.

https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Condition.html
*/

const u = require('./u')


class ScanQuery {
    constructor(table_name, {partitionKey, sortKey, indexName}={}) {
        this.paramsObject = {
            TableName: table_name,
            FilterExpression: '',
            ExpressionAttributeValues: {}
        }
        this.index = 0
        this.indexName = indexName
        this.partitionKey = partitionKey || u.PK
        this.sortKey = sortKey || u.SK
    }

    /*
    For example
        param: 'expertises'
        value: 'automobile accidents'
        message: 'contains'             // '=' for strings, 'contains' for arrays
        operator: 'AND'
    */
    addParam({param, value, message, operator, openParen, closeParen}) {
        this.paramsObject.ExpressionAttributeValues[`:key_${this.index}`] = value
        
        let filterExpressionComponent
        if (message === '=') {
            filterExpressionComponent = `(${param} = :key_${this.index})`
        } else {
            filterExpressionComponent = `${message} (${param}, :key_${this.index})`
            if (openParen) {filterExpressionComponent = '(' + filterExpressionComponent}
            if (closeParen) {filterExpressionComponent = filterExpressionComponent + ')'}
        }
        if (this.index !== 0) {
            filterExpressionComponent = ` ${operator} ${filterExpressionComponent}`
        }
        this.paramsObject.FilterExpression += filterExpressionComponent
        this.index += 1
    }

    // Adds specification to get only one attribute. Pass true for all
    addAttributes(attributes) { 
        if (attributes === true) {return}
        attributes.push(this.partitionKey)
        attributes.push(this.sortKey)
        attributes.push(u.INDEX_KEY)
        this.paramsObject.ProjectionExpression = attributes.join(', ')
    }

    write() {
        return this.paramsObject
    }
}

module.exports = ScanQuery
