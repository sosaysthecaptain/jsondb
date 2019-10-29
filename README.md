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

### Quickstart
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
let imageBuffer = await user.getFile({path: 'profilePicture})
let imageLink = await user.get({path: 'profilePicture})

// References
await user.setReference({
    path: 'sister',
    id: "id_of_DBObject_representing_user's_sister"

})
let usersSister = await user.getReference({path: 'sister'})

// Collections
// TODO


```


## DBObjectHandler

[Instantiating a DBObjectHandler] (./docs/handlerInstantiate.md)
[Creating and destroying objects] (./docs/handlerCreateDestroy.md)
[Instantiating objects] (./docs/handlerInstantiate.md)
[Getting data directly from objects] (./docs/handlerDirectGet.md)
[Getting objects in a pagewise fashion] (./docs/handlerPagewise.md)
[Querying objects] (./docs/handlerQuery.md)

## DBObject
[Getting and setting basic values] (./docs/dbobjectGetSet.md)
[References: DBObjects as properties of other DBObjects] (./docs/dbobjectReferences.md)
[Files: S3 Integration] (./docs/dbobjectFiles.md)
[Collections: Time-ordered DBObjectHandlers as properties of DBObjects] (./docs/dbobjectCollections.md)

## Permissions
[Permissions: understanding object permissions, collection permissions, and node sensitivities] (./docs/permissions.md)

