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

TODO: replace 'message' with dynamo concept of comparison operator such as 
EQ | NE | LE | LT | GE | GT | NOT_NULL | NULL | CONTAINS | NOT_CONTAINS | BEGINS_WITH | IN | BETWEEN
https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Condition.html
*/


class ScanQuery {
    constructor(table_name) {
        this.paramsObject = {
            TableName: table_name,
            FilterExpression: '',
            ExpressionAttributeValues: {}
        }
        this.index = 0
    }

    /*
    For example
        param: 'expertises'
        value: 'automobile accidents'
        message: 'contains'             // '=' for strings, 'contains' for arrays
        operator: 'AND'
    */
    addParam({param, value, message, operator}) {
        this.paramsObject.ExpressionAttributeValues[`:key_${this.index}`] = value
        
        let filterExpressionComponent
        // filterExpressionComponent = `(${param} ${message} :key_${this.index})`
        if (message === '=') {
            filterExpressionComponent = `(${param} = :key_${this.index})`
        } else {
            filterExpressionComponent = `(${message} (${param}, :key_${this.index}))`
        // } else if (message === 'contains') {
        //     filterExpressionComponent = `(contains (${param}, :key_${this.index}))`
        }
        if (this.index !== 0) {
            filterExpressionComponent = ` ${operator} ${filterExpressionComponent}`
        }
        this.paramsObject.FilterExpression += filterExpressionComponent
        this.index += 1
    }

    write() {
        return this.paramsObject
    }
}

module.exports = ScanQuery