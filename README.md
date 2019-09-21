# jsondb
**jsondb** is a DynamoDB abstraction layer that lets you work easily and efficiently with giant virtual objects, reading and writing them as if they were in memory. It consists two classes:
- `DBObject` represents a virtual object in the database
- `DBObjectHandler` provides an interface for creating and retrieving DBObjects. A DBObjectHandler is instantiated with AWS credentials and the name of a specific table.


### Configuring DBObjectHandler
Note on Dynamo setup: jsondb expects your DynamoDB table to be set up with primary key `id` and sort key `timestamp`, both of type String.

```javascript
jsondb = require('jsondb')

let myObjectTypeHandler = new jsondb.DBObjectHandler({
    awsAccessKeyId: 'your_key_id',
    awsSecretAccessKey: 'your_secret_key',
    tableName: 'name_of_table_containing_instances_of_this_object',
    isTimeOrdered: false,                                               // timeOrdered DBObjects can be retrieved pagewise by timestamp
    defaultCacheSize: 10 * 1024 * 1024                                  // 50 mb unless otherwise specified
}
```
    

### Creating and deleting DBObjects with DBObjectHandler
When you create a DBObject instance, the object is written to the database. allowOverwrite is an optional parameter, the default is false.

```javascript
let myDbObject = myObjectTypeHandler.createObject({
    id: 'optionally_specified_unique_id',
    initial_data:{example_key: 'example_value_to_immediately_set'}
    allowOverwrite: false
})

myObjectTypeHandler.deleteObject(id)
```


### DBObjectHandler - getting objects
When you "get" a DBObject, you don't actually hit the DB yet, you merely create an in-memory reference to the actual object in the database. Getting can be done individually (returns DBObject) or batchwise (returns array of DBObjects).
Getting can be done by ID, by page or time in the case of timeOrdered objects, or by a scan operation.

```javascript
let object = myObjectTypeHandler.getObject(id)

let objects = myObjectTypeHandler.batchGetObjectById(['id_1', 'id_2', 'id_3'])

let objects = myObjectTypeHandler.batchGetObjectByPage({
    page: 3, 
    page_size: 20, 
    ascending: true
})

let objects = myObjectTypeHandler.batchGetObjectByTime({
    start: 1569005447000, 
    end: 1569091847, 
    ascending: true
})

let objects = myObjectTypeHandler.scan({
    path: 'path.to.key', 
    value: 'value_to_look_for', 
    operator: 'IN / CONTAINS / etc'
})
```
    

### DBObjectHandler - getting data directly from objects
Sometimes, especially in batchwise contexts, you aren't interested in the DBObject abstraction but just want data directly:

```javascript
let value = myObjectTypeHandler.getData('id_of_object', 'path.to.key')

let arrayOfValues = myObjectTypeHandler.batchGetData(['id_1', 'id_2', 'id_3'], 'path.to.key')
```


## DBObject operations
The entire point of `jsondb` is the ability to work with virtual objects in memory. a `DBObject` represents a large JSON object in the database, and provides an API for reading and writing parts of it without needing to retrieve the whole. 


### Getting and setting values
Getting and setting specific values is done by specifying a dot-separated path.
```javascript
let entireObject = myObject.get()

let valueOfSpecifiedKey = myObject.get('path.to.key')

myObject.set('path.to.key', value)
```


### Modifying DBObject values
You can modify DBObject values without getting and then rewriting them:
```javascript
myObject.modify('path.to.arrayToModify', (arrayToModify) => {
    arrayToModify.push(newValue)
})
```







term
: definition