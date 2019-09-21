# jsondb
DynamoDB abstraction layer to let you work easily and efficiently with giant virtual objects

## How it works

`jsondb` is an abstraction layer built on top of of AWS DynamoDB that lets you easily work with giant virtual objects, reading and writing them as if they were in memory. It consists two classes, `DBObject` and `DBObjectHandler`. The former represents a virtual object in the database, the latter is instantiated with Dynamo credentials and table name and provides an interface for creating and retrieving DBObjects.

### Configuring DBObjectHandler and using it to create a DBObject
Instantiate a DBObject handler with AWS credentials and TableName, and use it to create, get, and delete DBObjects. You can then use it to create an DBObject instance, a process that writes the object to the database. Note on Dynamo setup: jsondb expects your DynamoDB table to be set up with primary key `id` and sort key `timestamp`, both of type String.

    jsondb = require('jsondb')
    
    let myObjectTypeHandler = new jsondb.DBObjectHandler({
        awsAccessKeyId: 'your_key_id',
        awsSecretAccessKey: 'your_secret_key',
        tableName: 'name_of_table_containing_instances_of_this_object',
        isTimeOrdered: false,                                               // timeOrdered DBObjects can be retrieved pagewise by timestamp
        defaultCacheSize: 10 * 1024 * 1024                                  // 50 mb unless otherwise specified
    }
    
    let myDbObject = myObjectTypeHandler.createObject({
        id: 'optionally_specified_unique_id',
        initial_data:{example_key: 'example_value_to_immediately_set'}
    })

    myObjectTypeHandler.deleteObject(id)

### DBObjectHandler - getting objects
When you "get" a DBObject, you don't actually hit the DB yet, you merely create an in-memory reference to the actual object in the database. Getting can be done individually (returns DBObject) or batchwise (returns array of DBObjects).
Getting can be done by ID, by page or time in the case of timeOrdered objects, or by a scan operation

    myObjectTypeHandler.getObject(id)
    
    myObjectTypeHandler.batchGetObjectById(['id_1', 'id_2', 'id_3'])
    
    myObjectTypeHandler.batchGetObjectByPage({
        page: 3, 
        page_size: 20, 
        ascending: true
    })

    myObjectTypeHandler.batchGetObjectByTime({
        start: 1569005447000, 
        end: 1569091847, 
        ascending: true
    })
    
    myObjectTypeHandler.scan({
        path: 'path.to.key', 
        value: 'value_to_look_for', 
        operator: 'IN / CONTAINS ' etc'
    })
    
### DBObjectHandler - getting data directly from objects
Sometimes, especially in batchwise contexts, you aren't interested in the DBObject abstraction but just want data directly:

    let value = myObjectTypeHandler.getData('id_of_object', 'path.to.key')
    let arrayOfValues = myObjectTypeHandler.batchGetData(['id_1', 'id_2', 'id_3'], 'path.to.key')

## DBObject operations


### Getting, setting, and modifying

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