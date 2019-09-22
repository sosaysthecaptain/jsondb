/*
Use this to generate scan queries for dynamo, to be used in dynamo.scan
Example usage:
let scan_query = new db.ScanQuery('User')
scan_query.add_param('is_lawyer', true, '=')
scan_query.add_param('expertises', 'auto accidents', 'contains', 'AND')
scan_query.add_param('states', 'California', 'contains', 'AND')
let params_object = scan_query.get_params_object()

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
*/

class ScanQuery {
    constructor(table_name) {
        this.params_object = {
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
        message: 'contains'
        operator: 'AND'
    */
    add_param(param, value, message, operator) {
        this.params_object.ExpressionAttributeValues[`:key_${this.index}`] = value
        
        let filter_expression_component
        if (message === '=') {
            filter_expression_component = `(${param} = :key_${this.index})`
        } else if (message === 'contains') {
            filter_expression_component = `(contains (${param}, :key_${this.index}))`
        }
        if (this.index !== 0) {
            filter_expression_component = ` ${operator} ${filter_expression_component}`
        }
        this.params_object.FilterExpression += filter_expression_component
        this.index += 1
    }

    get_params_object() {
        return this.params_object
    }
}

module.exports = ScanQuery