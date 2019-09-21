# jsondb
DynamoDB abstraction layer to let you work easily and efficiently with giant virtual objects

## How it works

JSONDB is an abstraction layer built on top of of AWS DynamoDB that lets you easily work with giant virtual objects, reading and writing them as if they were in memory. It consists two classes, `DBObject` and `DBObjectHandler`. The former represents a virtual object in the database, the latter is instantiated with Dynamo credentials and table name and provides an interface for creating and retrieving DBObjects.

### Using DBObjectHandler

    jsondb = require('jsondb')
    
    // Instantiate a DBObjectHandler
    let myObjectTypeHandler = new jsondb.DBObjectHandler({
        AwsAccessKeyId: 'your_key_id',
        AwsSecretAccessKey: 'your_secret_key',
        TableName: 'name_of_table_containing_instances_of_this_object',
        IsTimeOrdered: false,                // 
        defaultCacheSize: 10 * 1024 * 1024          // 50 mb unless otherwise specified
    }
    
    // Creating, getting, and deleting from the DB
    let myDbObject = myObjectTypeHandler.create({
        id: 'optionally_specified_unique_id', 
        initial_data:{example_key: 'example_value_to_immediately_set'}
    })
    myObjectTypeHandler.get(id)
    myObjectTypeHandler.delete(id)    // ids can be arrays of ids
    
    // Batch operations
    myObjectTypeHandler.batch_get_by_id(['id_1', 'id_2', 'id_3'])
    myObjectTypeHandler.batch_get_by_page({page: 3, page_size: 20, ascending: true})
    myObjectTypeHandler.batch_get_by_time({start: 1569005447000, end: 1569091847, ascending: true})
    myObjectTypeHandler.scan('path.to.key', 'value_to_look_for')
    
    // Operations that only return data (not DBObject class instances)
    myObjectTypeHandler.get_data({'id_of_object'})
    myObjectTypeHandler.batch_get_data(['id_1', 'id_2', 'id_3'], 'path.to.key')

### DBObject operations: getting, setting, and modifying

    // Retrieve only a specific value from your object
    let value_of_specified_key = myObject.get('path.to.key')
    
    // Retrieve the entire object
    let entire_object = my_object.get()
    
    // Set a key-value pair. The value can be a string, number, array, or object
    my_object.set('path.to.key', value)
    
    // Operations can be done on small values
    my_object.modify('path.to.arrayToModify', (arrayToModify) => {
        arrayToModify.push(newValue)
    })