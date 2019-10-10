**not done yet**

# jsondb
**jsondb** is a DynamoDB abstraction layer that lets you work easily and efficiently with giant virtual objects, reading and writing them as if they were in memory. What you can do with it:
- get and set properties as you would on an object: `myObj.set({'some.path': 'a value'})`, `myObj.get('path.to.key')`
- work with collections: `user.getFromCollection('messages', {limit: 20, start: 40})`
- upload and retrieve files from s3 as if they were part of the object: `user.setFile('photos.j3ds0', <buffer>)`
- associate specific permission levels with specific keys, and fetch in a manner that automatically filters out objects above the specified permission level: `user.get(settings, {permission: 3})`
- nest DBObjects inside other DBObjects: `user1.setReference('friends.user2', user2.id)`


Jsondb consists (principally) of two classes:
- `DBObject` represents a virtual object in the database
- `DBObjectHandler` provides an interface for creating and retrieving DBObjects. A DBObjectHandler is instantiated with AWS credentials and the name of a specific table


### Configuring DBObjectHandler
Get started by setting up a DBObjectHandler:
```javascript
jsondb = require('jsondb')

let handler = new jsondb.DBObjectHandler({
    awsAccessKeyId: 'your_key_id',
    awsSecretAccessKey: 'your_secret_key',
    awsRegion: 'us-east-2',
    tableName: 'name_of_table_containing_instances_of_this_object',
    bucketName: 'your-s3-bucket-for-files'
    isTimeOrdered: false,                   // optional, false by default
    defaultCacheSize: 50 * 1024 * 1024,     // optional, 50 mb by default
    doNotCache: false                       // optional, false by default
}
```
Note on Dynamo setup: jsondb expects your DynamoDB table to be set up with primary key `id` and sort key `timestamp`, both of type String. Many objectTypes can share the same table.
    

### Creating and deleting DBObjects with DBObjectHandler
When you create a DBObject instance, the object is written to the database. allowOverwrite is an optional parameter, the default is false.

```javascript
let newObject = handler.createObject('my_object_id', {initial: 'data goes here'})
handler.deleteObject('that_thing')
```


### DBObjectHandler - getting objects
When you "get" a DBObject, you don't actually hit the DB yet, you merely create an in-memory reference to the actual object in the database. Getting can be done individually (returns DBObject) or batchwise (returns array of DBObjects).
Getting can be done by ID, by page or time in the case of timeOrdered objects, or by a scan operation.

```javascript
let object = myObjectTypeHandler.getObject(id)

let convoParticipants = userHandler.batchGetObjectById(['joe@gmail.com', 'susan@gmail.com'])

let firstTen = handler.batchGetObjectByPage({
    limit: 10
})

let objects = myObjectTypeHandler.batchGetObjectByTime({
    start: 1569005447000, 
    end: 1569091847, 
    ascending: true
})

let peopleNamedTim = userHandler.scan({
    param: 'name',
    value: 'tim'
})

```
    

### DBObjectHandler - getting data directly from objects
Sometimes, especially in batchwise contexts, you aren't interested in the DBObject abstraction but just want data directly:

```javascript
let messages = messageHandler.batchGetObjectsByPage({
    limit: 10,
    exclusiveFirstTimestamp: 1570676695978,
    attributes: ['body', 'sender'],
    ascending: true
})

let arrayOfValues = myObjectTypeHandler.batchGetData(['id_1', 'id_2', 'id_3'], {returnData: true})
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

## Subclassing
DBObject can be superclassed to provide type-specific logic and security rules. 

MORE ON THIS LATER, INCLUDING HOW SUBCLASS CAN BE PASSED TO DBOBJECTHANDLER




# Theory
DynamoDB is a serverless NoSQL database built on the notion of object-like documents that can be retrieved, modified, scanned, and sorted. It is intrinsically fast and arbitrarily scalable, but it has a 400 kb size limit on documents and a complicated API. `jsondb` solves these problems by creating an abstraction layer that allows documents to be automatically split up into nodes, and an API that makes objects.

When a DBObject is created it begins as a single document. Every time it is added to, jsondb determines if it is too big, and if so, splits it up into further documents. To see how this works, let's look at the structure of a node:

```javascript
internal_id_of_example_node = {
    d: {
        key_1: {d: 'some example data'},
        key_2: {
            d: 'some more example data',
            c: {internal_id_of_key_2_child: 'some_dynamo_pk'}
        },
        key_3: {d: ['these', 'can', 'be', 'arrays', 'too']},
        key_4: {d: {another_key: 'or objects'},
        key_5: {d: 123456789},
        key_6: {d: false}
    },
    l: internal_pointer_to_lateral_spillover_node: 'dynamo_pk_to_that_node',
    c: {
        internal_id_of_child: 'dynamo_pk_of_child',
        internal_id_of_another_child: 'another_dynamo_pk'
    }
}
```

Nodes are designated with a uniqueID namespaced to the type and table, and have three keys:
- `d` contains data
- `c` contains pointers to child nodes
- `l` in the case of lateral spillover, `l` specifies a pointer to the next node containing data at this level of hierarchy

When it is determined that a write operation will cause a document to become too big, it is split up with the aim of keeping as much data as possibly as high up the tree as is possible. 

Specific keys are then accessed by first fetching the root node and then walking the tree, until either the desired value is found, or it is determined that a pointer must be followed to reach it. At this point a second query is made, the value is returned, and the data is cached on the server up to the specified limit, 50 mb by default. As the desired information is fetched, pointer data is also fetched. Since cache space is used preferentially for pointers, this means that even deeply nested values can usually be gotten with a single call.


