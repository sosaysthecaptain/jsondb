**not done yet**

# jsondb
**jsondb** is a DynamoDB abstraction layer that lets you work easily and efficiently with giant virtual objects, reading and writing them as if they were in memory. What you can do with it:
- **get and set** properties as you would on an object: `myObj.set({'some.path': 'a value'})`, `myObj.get('path.to.key')`
- work with **collections:** `user.getFromCollection('messages', {limit: 20, start: 40})`
- **upload and retrieve files from s3** as if they were part of the object: `user.setFile('photos.j3ds0', <buffer>)`
- associate specific **permission levels** with specific keys, and fetch in a manner that automatically filters out objects above the specified permission level: `user.get(settings, {permission: 3})`
- **nest DBObjects** inside other DBObjects: `user1.setReference('friends.user2', user2.id)`


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
let newObject = await handler.createObject('my_object_id', {initial: 'data goes here'})
await handler.deleteObject('that_thing')
```


### DBObjectHandler - getting objects
When you "get" a DBObject, you don't actually hit the DB yet, you merely create an in-memory reference to the actual object in the database. Getting can be done individually (returns DBObject) or batchwise (returns array of DBObjects).
Getting can be done by ID, by page or time in the case of timeOrdered objects, or by a scan operation.

```javascript
let object = await myObjectTypeHandler.getObject(id)

let convoParticipants = await userHandler.batchGetObjectById(['joe@gmail.com', 'susan@gmail.com'])

let firstTen = await handler.batchGetObjectByPage({
    limit: 10
})

let objects = await myObjectTypeHandler.batchGetObjectByTime({
    start: 1569005447000, 
    end: 1569091847, 
    ascending: true
})

let peopleNamedTim = await userHandler.scan({
    param: 'name',
    value: 'tim'
})

```
    

### DBObjectHandler - getting data directly from objects
Sometimes, especially in batchwise contexts, you aren't interested in the DBObject abstraction but just want data directly:

```javascript
let messages = await messageHandler.batchGetObjectsByPage({
    limit: 10,
    exclusiveFirstTimestamp: 1570676695978,
    attributes: ['body', 'sender'],
    ascending: true
})

let arrayOfValues = await myObjectTypeHandler.batchGetData(['id_1', 'id_2', 'id_3'], {returnData: true})
```


# DBObject operations
The entire point of `jsondb` is the ability to work with virtual objects in memory. a `DBObject` represents a large JSON object in the database, and provides an API for reading and writing parts of it without needing to retrieve the whole. 


### Getting and setting values
Getting and setting specific values is done by specifying a dot-separated path.
```javascript
let entireObject = myObject.get()

let valueOfSpecifiedKey = myObject.get('path.to.key')

await myObject.set({'path.to.key': value})

await user.set({password: '4321bang', {permission: 5}})
```


### Modifying DBObject values
You can modify DBObject values without getting and then rewriting them:
```javascript
myObject.modify('path.to.arrayToModify', (arrayToModify) => {
    arrayToModify.push(newValue)
})
```
### References
DBObjects can be nested one inside another:

```javascript
await userOne.setReference('friends.userTwo', userTwo.id)

let userTwo = await userOne.getReference('friends.userTwo')
let userTwoID = await userOne.get('friends.userTwo')
```

### Collections
Collections can be thought of as DBObjectHandlers nested inside DBObjects:

```javascript
await conversation.createCollection('messages')
await conversation.addToCollection('messages', {
    body: 'I can add a million messages to this object if I want',
    sender: 'Marc',
    timestamp: 'late'
})
let messages = await conversation.getFromCollection('messages', {limit: 10})

await conversation.deleteFromCollection('messages', 'some_message_id')

let messagesFromUser3 = conversation.scanCollection('messages', {param: 'email', value: user3.email})
conversation.emptyCollection('messages')
```


### Files
In the spirit of not having to worry about file size and not spend time reimplementing things like s3 interaction layers, jsondb has one built in:

```javascript
await user.setFile('documents.resume', resumeBuffer)
let buffer = user.getFile('documents.resume')
let s3url = user.get('documents.resume')
```



# Theory
DynamoDB is a serverless NoSQL database built on the notion of object-like documents that can be retrieved, modified, scanned, and sorted. It is intrinsically fast and arbitrarily scalable, but it has a 400 kb size limit on documents and a complicated API. `jsondb` solves these problems by creating an abstraction layer that allows documents to be automatically split up into nodes, and an API that allows you to interact with it on the level of the classes in memory you're already working with.

When a DBObject is created it begins as a single document. Every time it is added to, jsondb determines if it is too big, and if so, splits it up into further documents. To see how this works, let's look at the structure of a node:

```javascript
originalObject = {
    key1: {
        k1subkey1: 'some data here',
        k1subkey2: {
            subsub: {
                another: 'object',
                inside: 12345
            },
        },
    key2: 'more stuff'
}

dynamoNode = {
    key1__k1subkey1: 'some data here',
    key1__k1subkey2__subsub__another: 'object',
    key1__k1subkey2__subsub__inside: 12345,
    key2: 'more stuff'
    META: {
        <index tracking size and type of each node>
    }
}

```

Nodes are designated with a uniqueID namespaced to the type and table, store data in flattened key-value pairs,and have an index that stores size, type, and any metadata about the value at each path. When it is determined that a write operation will cause a document to become too big, it is split up with the aim of keeping groupings together. Single giant payloads can be split laterally among multiple nodes.

Specific keys are then accessed by first fetching the root node and then walking the tree, until either the desired value is found, or it is determined that a pointer must be followed to reach it. At this point a second query is made, the value is returned, and the data is cached on the server up to the specified limit, 50 mb by default. As the desired information is fetched, pointer data is also fetched. Since cache space is used preferentially for pointers, this means that even deeply nested values can usually be gotten with a single call.