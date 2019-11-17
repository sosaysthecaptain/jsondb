# jsondb
*NEW DOCUMENTATION IN PROGRESS*

**jsondb** is a DynamoDB abstraction layer that lets you work easily and efficiently with giant virtual objects, reading and writing them as if they were in memory. What you can do with it:
- **get and set** properties as you would on an object: `obj.set({'some.path': 12345})`, `obj.get('path.to.key')`
- **work with collections:** `user.getFromCollection('messages', {limit: 20})`
- **upload and retrieve files from s3** as if they were part of the object: `user.setFile('thumbnail', <buffer>)`
- associate specific **sensitivity levels** with specific keys, and fetch in a manner that automatically filters out objects above the specified sensitivity level: `user.get(settings, {sensitivity: 3})`
- **nest DBObjects** inside other DBObjects: `user1.setReference('friends.user2', user2.id)`


jsondb consists (principally) of two classes:
- `DBObject` represents a virtual object in the database. It can store arbitrary amounts of data at arbitrary paths, as well as files, specific references to other DBObjects, and collections of other DBObjects.
- `DBObjectHandler` provides an interface for creating and retrieving DBObjects. A DBObjectHandler is instantiated with AWS credentials and the name of a specific table.

## Quickstart
```javascript
// Create a handler
let handler = new jsondb.DBObjectHandler({
    awsAccessKeyId: 'your_key_id',
    awsSecretAccessKey: 'your_secret_key',
    awsRegion: 'us-east-2',
    tableName: 'name_of_table_containing_instances_of_this_object',
    bucketName: 'your-s3-bucket-for-files'
    isTimeOrdered: false,                   // optional, false by default
    defaultCacheSize: 50 * 1024 * 1024,     // optional, 50 mb by default
    doNotCache: false                       // optional, true by default
})

// Use it to create, instantiate, and destroy objects
let newObject = await handler.createObject({
    id: 'my_object_id', 
    data: {
        initial: 'data goes here'
    }
})

let user = handler.instantiate({id: 'user_1_id'})
let users = handler.instantiate({ids: ['user_1_id, user_2_id']})

await handler.destroyObject({
    id: 'that_thing',
    confirm: true
})

// Get and set basic parameters on an object
await user.set({
    attributes: {
        personalInfo.phone: '(123) 456-7890' 
    }
})
let phone_number = await user.get({path: 'personalInfo.phone'})

// Files
await user.setFile({
    path: 'profilePicture',
    data: profilePicBuffer

})
let imageBuffer = await user.getFile({path: 'profilePicture'})
let imageLink = await user.get({path: 'profilePicture'})

// References
await user.setReference({
    path: 'sister',
    id: 'id_of_DBObject_representing_users_sister'
})
let usersSister = await user.getReference({path: 'sister'})



// // Collections
// let path = 'subclassPath'
// await parentObj.createCollection({
//     path: 'myCollection, 
//     subclass: YourSubclass})
    
// let subclassDBObject = await parentObj.collection({path: 'myCollection'}).createObject({
//     data: {
//         body: "I live in a collection object"
//     }
// })

// // Scan

// // 

```



## DBObjects are things you can put in a database
DBObjects are class instances that represent virtual objects in the database. They can be arbitrary large, and they function more or less as objects in memory, with a few special features. Things you can do with a DBObject:
- **get and set** properties as you would on an object: `obj.set({'some.path': 12345})`, `obj.get('path.to.key')`
- **work with collections:** `user.getFromCollection('messages', {limit: 20})`
- **upload and retrieve files from s3** as if they were part of the object: `user.setFile('thumbnail', <buffer>)`
- associate specific **sensitivity levels** with specific keys, and fetch in a manner that automatically filters out objects above the specified sensitivity level: `user.get(settings, {sensitivity: 3})`
- **nest DBObjects** inside other DBObjects: `user1.setReference('friends.user2', user2.id)`


### create puts an object into the database
`create` will put an object into the database, failing if it already exists. (For the moment let's assume the object is already instantiated/)

```javascript

// A reasonable example
await user.create({
    data: {
        firstName: 'Danny',
        lastName: 'Dunn',
        personalInfo: {
            phone: null,
            hometown: 'Midston'
        }
    }
})

// A contrived example, demonstrating all possible arguments
await thing.create({
    data: someObject,
    allowOverwrite: true,                               // false by default
    objectPermission: {read: 3, write: 5},              // required to access object
    members: {                                          // ids with permissions that can be used to access
        'irene@gmail.com': {read: 5, write: 5},
        'joe@gmail.com': {read: 5, write: 2},
        'prof_bullfinch@midston.edu': {read: 9, write: 9},
    },
    creator: 'danny@gmail.com'
    sensitivity: 0
})

```
`create` parameters:
- data: the object going into the database
- allowOverwrite
- objectPermission - read/write permission level required for object access, more on this later. Format is `{read: 4, write: 2}`, where permission levels are integers between 0 and 9. Defaults to unrestricted access.
- sensitivity - the individual sensitivity level of each of the paths to write, an integer from 0-9. A path with a sensitivity of 5 will require a permission of 5 to read, and will be omitted from the returned results without adequate specified permission. More on this later
- members
- creator - a unique ID that will be set as a member with max permissions


### get and set handle basic assignment
```javascript


// Pass set an attributes object of key-value pairs to set
await user.set({
    attributes: {
        'accountBalance': 12345,
        'personalInfo.phone': '(123) 456-7890'
    }
})
let phoneNumber = await user.get({path: 'personalInfo.phone'})
let entireObject = await user.get()
```

### setReference is used to set a DBObject field to reference another DBObject

### setFile is used to store a file in s3 and access it as if it were another object field

## DBObjectHandlers are used to create, get, and find objects

### Basic handler operations: createObject, destroyObject, getObject, and instantiate

### scan is used to search for DBObjects

## Collections are like handlers that are object properties

## Permissions

### DBObjects and their individual paths have sensitivity levels

### DBObjects have creators and members

### "user" or "permission" can be specified to gain access to an object





[Instantiating a DBObjectHandler] (./docs/handlerInstantiate)
[Creating and destroying objects] (./docs/handlerCreateDestroy)
[Instantiating objects] (./docs/handlerInstantiate)
[Getting data directly from objects] (./docs/handlerDirectGet)
[Getting objects in a pagewise fashion] (./docs/handlerPagewise)
[Querying objects] (./docs/handlerQuery)

## DBObject
[Getting and setting basic values] (./docs/dbobjectGetSet)
[References: DBObjects as properties of other DBObjects] (./docs/dbobjectReferences)
[Files: S3 Integration] (./docs/dbobjectFiles)
[Collections: Time-ordered DBObjectHandlers as properties of DBObjects] (./docs/dbobjectCollections)

## Permissions
[Permissions: understanding object permissions, collection permissions, and node sensitivities] (./docs/permissions)

