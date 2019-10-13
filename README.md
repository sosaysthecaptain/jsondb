# jsondb
**jsondb** is a DynamoDB abstraction layer that lets you work easily and efficiently with giant virtual objects, reading and writing them as if they were in memory. What you can do with it:
- **get and set** properties as you would on an object: `obj.set({'some.path': 12345})`, `obj.get('path.to.key')`
- **work with collections:** `user.getFromCollection('messages', {limit: 20})`
- **upload and retrieve files from s3** as if they were part of the object: `user.setFile('thumbnail', <buffer>)`
- associate specific **permission levels** with specific keys, and fetch in a manner that automatically filters out objects above the specified permission level: `user.get(settings, {permission: 3})`
- **nest DBObjects** inside other DBObjects: `user1.setReference('friends.user2', user2.id)`


jsondb consists (principally) of two classes:
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
Note on Dynamo setup: jsondb expects your DynamoDB table to be set up with primary key `uid` and sort key `ts`, of types String and Number respectively. Many objectTypes can share the same table.
    

### Creating and deleting DBObjects with DBObjectHandler
When you create a DBObject instance, the object is written to the database. allowOverwrite is an optional parameter, the default is false.

```javascript
let newObject = await handler.createObject({
    id: 'my_object_id', 
    data: {
        initial: 'data goes here'
    }
})
await handler.deleteObject('that_thing')
```


### DBObjectHandler - getting objects
When you "get" a DBObject, you don't actually hit the DB yet, you merely create an in-memory reference to the actual object in the database. Getting can be done individually (returns DBObject) or batchwise (returns array of DBObjects).
Getting can be done by ID, by page or time in the case of timeOrdered objects, or by a scan operation.

```javascript
let object = await myObjectTypeHandler.getObject({id})

let convoParticipants = await userHandler.instantiate({ids: ['joe@gmail.com', 'susan@gmail.com']})

let firstTen = await handler.getPagewise({limit: 10})
let secondTenTen = await handler.getPagewise({limit: 10})
handler.resetPage()

let objects = await myObjectTypeHandler.batchGetObjectByTime({
    start: 1569005447000, 
    end: 1569091847, 
    ascending: true
})

let people = await parentObj.collection('friends').scan({
    params: [
        ['firstName', '=', 'joe', 'AND'],
        ['friends', 'contains', 'danny']
    ],
    returnData: true
})

let peopleNamedTim = await userHandler.scan({
    param: 'firstName',
    value: 'tim'
})

```
    

### DBObjectHandler - getting data directly from objects
Sometimes, especially in batchwise contexts, you aren't interested in the DBObject abstraction but just want data directly:

```javascript
let messages = await messageHandler.getObjects({
    limit: 10,
    exclusiveFirstTimestamp: 1570676695978,
    attributes: ['body', 'sender'],
    ascending: true
})

let placesWherePeopleNamedTimLive = await userHandler.scan({
    params: [
        ['firstName', '=', 'tim']
    ],
    attributes: ['address']
})
```


## DBObject operations
The entire point of `jsondb` is the ability to work with virtual objects in memory. a `DBObject` represents a large JSON object in the database, and provides an API for reading and writing parts of it without needing to retrieve the whole. 


### Getting and setting values
Getting and setting specific values is done by specifying a dot-separated path.
```javascript
let entireObject = myObject.get()

let valueOfSpecifiedKey = myObject.get({path: 'path.to.key'})

await myObject.set({attributes: {'path.to.key': value}})

await user.set({attributes: {password: '4321bang', {permission: 5}}})
```


### Modifying DBObject values
You can modify DBObject values without getting and then rewriting them:
```javascript
myObject.modify({id: 'path.to.arrayToModify', fn: (arrayToModify => {
    arrayToModify.push(newValue)
})})
```
### References
DBObjects can be nested one inside another:

```javascript
await userOne.setReference({path: 'friends.userTwo', id: userTwo.id})

let userTwo = await userOne.getReference({path: 'friends.userTwo'})
let userTwoID = await userOne.get({path: 'friends.userTwo'})
```

### Collections
Collections are essentially DBObjectHandlers nested inside DBObjects. They can contain arbitrary numbers of sub-objects, by default ordered by time and gettable pagewise.

```javascript
// Creating a collection
await conversation.createCollection({'messages'})

// Creating an object in a collection
await conversation.collection('messages').createObject({
    data: {
        body: 'I can add a million messages to this object if I want',
        sender: 'Marc',
        timestamp: 'late'
    }
})

// Getting things pagewise
let firstPage = await someConversation.collection('messages').getObjects({limit: 10})
let secondPageAsData = await someConversation.collection('messages').getObjects({
    limit: 10, 
    returnData: true
})
await someConversation.resetCollectionPage('messages')
let posts = await myBlog.collection('posts').getObjects({limit: 10, exclusiveFirstTimestamp: 1570676695978})


// Performing scans on collections
let peopleThatLikeMeBack = me.collection('likes').scan({params: [
    ['likes', 'contains', me.id]
})

let joe = await user.collection('friends').scan({
    params: [
        ['firstName', '=', 'joe', 'AND'],
        ['friends', 'contains', 'danny']
    ]
})

// Deletion
await someConversation.collection(('messages').destroyObject({id: 'some_message_id'})
await someConversation.emptyCollection('messages')
```


### Files
In the spirit of not having to worry about file size and not spend time reimplementing things like s3 interaction layers, jsondb has one built in:

```javascript
await user.setFile({path: 'documents.resume', data: resumeBuffer})
let buffer = user.getFile({path: 'documents.resume'})
let s3url = user.get({path: 'documents.resume'})
```



## Theory
DynamoDB is a serverless NoSQL database built on the notion of object-like documents that can be retrieved, modified, scanned, and sorted. It is intrinsically fast and arbitrarily scalable, but it has a 400 kb size limit on documents and a complicated API. `jsondb` solves these problems by creating an abstraction layer that allows documents to be automatically split up into nodes, and an API that allows you to interact with it on the level of the classes in memory you're already working with.

When a DBObject is created it begins as a single document. Every time it is added to, jsondb determines if it is too big, and if so, splits it up into further documents. To see how this works, let's look at the structure of a node:

```javascript
originalObject = {
    key1: {
        subkey1: 'this is key1.subkey1',
        subkey2: 'this is key1.subkey2',
        subkey3: {
            subsubkey1: 8882,
            subsubkey2: 'asd',
            subsubkey3: null,
        },
    },
    key2: {
        subkey1: 'this is key2.subkey1',
        subkey2: 'this is key2.subkey2',
        subkey3: 'this is key2.subkey3',
    },
    key3: {
        subkey1: 'this is key3.subkey1',
        subkey2: 'this is key3.subkey2',
        subkey3: 'this is key3.subkey3',
    }
}

dynamoNode = {
    {
        key1__subkey1: "this is key1.subkey1",      // Objects are stored flattened
        key1__subkey2: "this is key1.subkey2",
        key1__subkey3__subsubkey1: 8882,
        key1__subkey3__subsubkey2: "asd",
        key1__subkey3__subsubkey3: null,
        key2__subkey1: "this is key2.subkey1",
        key2__subkey2: "this is key2.subkey2",
        key2__subkey3: "this is key2.subkey3",
        key3__subkey1: "this is key3.subkey1",
        key3__subkey2: "this is key3.subkey2",
        key3__subkey3: "this is key3.subkey3"
    },
    META: {                                         // This is the index
        key1__subkey1: {S: 20},                     // S: size of individual payload
        key1__subkey2: {S: 20},
        key1__subkey3__subsubkey1: {S: 4},
        key1__subkey3__subsubkey2: {S: 3},
        key1__subkey3__subsubkey3: {S: 0},
        key2__subkey1: {S: 20},
        key2__subkey2: {S: 20},
        key2__subkey3: {S: 20},
        key3__subkey1: {S: 20},
        key3__subkey2: {S: 20},
        key3__subkey3: {S: 20},
        key1: {T: "M"},                             // T: type is "meta", meaning a non-terminal node
        key1__subkey3: {T: "M"},
        key2: {T: "M"},
        key3: {T: "M"},
        META: {T: "M", S: 1437}                     // Overall node size is stored here
    }
}

```

Nodes are designated with a uniqueID namespaced to the type and table, store data in flattened key-value pairs,and have an index that stores size, type, and any metadata about the value at each path. When it is determined that a write operation will cause a document to become too big, it is split up with the aim of keeping groupings together. Single giant payloads can be split laterally among multiple nodes.

Specific keys are then accessed by first fetching the root node and then walking the tree, until either the desired value is found, or it is determined that a pointer must be followed to reach it. At this point a second query is made, the value is returned, and the data is cached on the server up to the specified limit, 50 mb by default. As the desired information is fetched, pointer data is also fetched. Since cache space is used preferentially for pointers, this means that even deeply nested values can usually be gotten with a single call.