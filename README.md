# jsondb
*CURRENT STATUS: ALMOST STABLE*

**jsondb** is a database access layer that sits atop DynamoDB abd lets you work easily and efficiently with giant virtual objects, reading and writing them as if they were in memory.

It consists (principally) of two classes:
- `DBObject` represents a virtual object in the database. It can store arbitrary amounts of data at arbitrary paths, as well as files, specific references to other DBObjects, and collections of other DBObjects.
- `DBObjectHandler` provides an interface for creating and retrieving DBObjects. A DBObjectHandler is instantiated with AWS credentials and the name of a specific table.


## `DBObjects` are things you can put in a database
`DBObjects` are class instances that represent virtual objects in the database. They can be arbitrary large, and they function more or less as objects in memory, with a few special features. Things you can do with a DBObject:
- **get and set** properties as you would on an object in memory
- create and retrieve from time-ordered **collections** 
- **upload and retrieve files from s3** as if they were part of the object: `user.setFile('thumbnail', <buffer>)`
- **nest DBObjects** inside other DBObjects: `user1.setReference('friends.user2', user2.id)`
- **scan and query** objects
- give objects **objectPermissions** and individual nodes with them **sensitivity levels**, fetching in a manner that automatically filters out objects for which the current user is not permissioned
- assign **creators and members** to objects


### `create` puts objects into the database, `destroy` removes them
`create` will put an object into the database, failing if it already exists.

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
    allowOverwrite: true,
    objectPermission: {read: 3, write: 5},
    members: {
        'irene@gmail.com': {read: 5, write: 5},
        'joe@gmail.com': {read: 5, write: 2},
        'ebullfinch@midston.edu': {read: 9, write: 9},
    },
    creator: 'danny@gmail.com'
    sensitivity: 0
})

await thing.destroy({confirm: true})

```
`create` parameters:
- `data`: the object going into the database
- `allowOverwrite`
- `objectPermission` - read/write permission level required for object access, more on this later. Format is `{read: 4, write: 2}`, where permission levels are integers between 0 and 9. Defaults to unrestricted access.
- `sensitivity` - the individual sensitivity level of each of the paths to write, an integer from 0-9. A path with a sensitivity of 5 will require a permission of 5 to read, and will be omitted from the returned results without adequate specified permission. More on this later
- `members` - an object of `{id:permissionObj}` representing users who should have access
- `creator` - a unique ID that will be set as a member with max permissions

`destroy` parameters: 
- `confirm`: optional, returns true if destruction successful
- `user`, `permission`: see below


### `get` and `set` handle basic assignment
```javascript


// Pass set an attributes object of key-value pairs to set
await user.set({
    attributes: {
        'personalInfo.phone': '(123) 456-7890'
        another: 'thing to set'
        someObject: {
            stuff: 'goes here'
        }
    }
})

// Specify path to get a single attribute
let phoneNumber = await user.get({path: 'personalInfo.phone'})

// Specify paths to get multiple attributes
let partialObject = await user.get({paths: ['firstName', 'lastName']})

// Specify nothing to get the entire object
let entireObject = await user.get()
```
`set` parameters:
- `attributes`: key-value pairs to set. Nested paths can be `'represented.like.this'`
- `sensitivity`: a numerical permission level, 0-9, required to access these attributes. Get `operations` will omit attributes for which the user is not permissioned
- `user`: ID of member whose permission level should be used
- `permission`: manually passed permission object(`{read: x, write: y}`), overrides user permission

`get` parameters:
- `path`: path, as a string, representing `'path.to.desired.attribute'`. If `path` is specified, only the requested value is returned.
- `paths`: an array of multiple such paths, used in place of `path`. In this case, the method will return an object of key-value pairs
- `noCache`: forces jsondb to hit the database again even if the cached value is present
- `user`, `permission`: exactly the same as in `set`

### `setReference` is used to set a DBObject field to reference another DBObject
`setReference` is used to create a reference to another DBObject at a specified path. `getReference` will then return this DBObject, while an ordinary `get` operation will only return the id.
```javascript
await user.setReference({
    path: 'mother',
    id: 'id_of_DBObject_representing_users_mother'
})
let usersMother = await user.getReference({path: 'mother'})
let motherID = await user.get({path: 'mother'})

```
`setReference` parameters:
- `path`: the path at which to set the reference
- `id` of the DBObject to set
- `sensitivity`, `user`, `permission`: as in ordinary `set`
`getReference` parameters
- `path` to get
- `permission`, `user` as in ordinary `get`


### `setFile` and `getFile` are used to store files in s3 and access them like other object fields
`setFile` is used to upload a file to s3 and store it on the object as if it were any other property. `getFile` will return the file as it went in, while an ordinary `get` operation will return an s3 link. See the section on instantiating a DBObjectHandler for information on how s3 credentials and bucket name are specified.
```javascript
await user.setFile({
    path: 'homework.essayDueTuesday',
    data: essayDueTuesdayAsBuffer,
})
let essayDueTuesdayAsBuffer = await user.getReference({path: 'homework.essayDueTuesday'})
let s3Link = await user.get({path: 'homework.essayDueTuesday'})

```
`setFile` parameters:
- `path`: the path at which to 'store' the file
- `data`: buffer (or string, for that matter) to store
- `sensitivity`, `user`, `permission`: as in ordinary `set`
`getFile` parameters
- `path` to get
- `permission`, `user` as in ordinary `get`

## DBObjectHandlers are used to create, get, and find objects
While methods on `DBObject` are used to access fields within a single object, instances of `DBOBjectHandler` are used to create, destroy, get, batchGet, and scan DBobjects within a table. Handlers are instantiated with AWS credentials, DynamoDB table names, and s3 bucket names. 

Handlers may be timeOrdered or not: those that are have a `seriesKey` used as a common primary key, and are automatically assigned a timestamp as a sortKey upon creation. DBObjects belonging to a timeOrdered handler can fetched pagewise by timestamp.

Handlers, as discussed here, are top-level, but handlers can also be assigned to paths on a DBObject, like any other piece of data, in which case they are called `collections`. Collections are universally timeOrdered, and will be covered in depth later.

### Instantiating a `DBObjectHandler`, and a note on DynamoDB table setup
Handlers are instantiated with AWS credentials, and refer to a specific table. **Tables for jsondb must be set with a primaryKey of 'uid', of type string, and a sortKey of 'ts', of type number.**

```javascript
let userHandler = new jsondb.DBObjectHandler({
    awsAccessKeyId: 'your_key_id',
    awsSecretAccessKey: 'your_secret_key',
    awsRegion: 'us-east-2',
    tableName: 'name_of_table_containing_instances_of_this_object',
    bucketName: 'your-s3-bucket-for-files'
    isTimeOrdered: false,
    seriesKey: null,
    defaultCacheSize: 50 * 1024 * 1024,
    doNotCache: false,
    Subclass: YourUserClass,
    permission: {read: 0, write: 5}
})
```
`DBobjectHandler` constructor parameters:
- `awsAccessKeyId`, `awsSecretAccessKey`, and `awsRegion` are AWS credentials; refer to DynamoDB docs for more on this
- `tableName` refers to the DynamoDB table this handler will address. This table must exist and be configured as described above
- `bucketName` refers to the s3 bucket in which `setFile`'d files will go. It may be permissioned however you like, and is an optional parameter.
- `isTimeOrdered`: if true, all members will share a primaryKey, have a timestamp sortKey, and will be gettable pagewise. This is generally only used in the context of a collection
- `seriesKey`: shared primaryKey for timeOrdered handlers, omit if not timeOrdered
- `defaultCacheSize`: how large the cache of an individual object instance is allowed to be. Specified in bytes, 50 MB by default.
- `doNotCache`: specify true to disable caching altogether
- `Subclass`: specify your own subclass of DBObject for the handler to instantiate

### Using a handler to `instantiate` one or more DBObjects
A DBObjectHandler is a convenient way to instantiate a DBObject, specifying only its id. Instantiating is a synchronous operation, and does not hit the database.

Note that jsondb ids take the form of a string, hyphenated with a timestamp in the case of timeOrdered objects.

```javascript
let user = userHandler.instantiate({id: 'user1ID'})
let users = userHandler.instantiate({ids: ['user1ID, user2ID']})

let severalMessages = messageHandler.instantiate({ids: [
    'danny_message-1573957572', 
    'danny_message-1573957933'
]})
```

### Basic operations: `createObject`, `destroyObject`
While DBObjects can be instantiated and then created and destroyed with their own class methods, `DBObjectHandler` offers a more convenient interface:

```javascript
let newObject = await userHander.createObject({
    id: 'ebullfinch@midston.edu', 
    data: {
        firstName: 'Euclid',
        lastName: 'Bullfinch',
        title: 'Professor'
    }
})

await handler.destroyObject({
    id: 'ebullfinch@midston.edu', 
    confirm: true
})
```
`createObject` parameters:
- `id`: string, jsondb ID of object to create
- `data`: initial object to store in the database
- `allowOverwrite`, 'objectPermission', `creator`, `members` as in `DBObject.create`


`destroyObject` parameters:
- `id`
- `confirm`: as in `DBObject.destroy`
- `permissionOverride`: boolean, set `true` to override the DBObject's own write permission check, to which this operation is otherwise subject


### getObject can get data directly from objects without first instantiating them
Similar to createObject and destroyObject, getObject skips over instantiating a DBObject and lets you access data directly. This is particularly useful if you are getting multiple objects at once, as this way you can perform a batchGet in one operation.

```javascript
let danny = await userHandler.getObject({
    id: 'danny@gmail.com,
    returnData: true
})

let multipleUsers = await userHandler.getObject({
    ids: ['danny@gmail.com', 'joe@gmail.com', 'irene@gmail.com'],
    attributes: ['firstName', 'lastName', 'personalInfo.phone'],
    permission: {read: 5, write: 2}
})
```
`getObject` parameters:
- `id`: single jsondb id to get
- `ids`: array of jsondb ids to get in batch operation, use instead of id. In this case, the method will return an array of objects
- `attributes`: array of specific paths to get
- `returnData`: boolean, specify `true` to get the entire object
- `includeID`: boolean, specify `true` to include the object id in the return
- `user`, `permission`: as elsewhere


### scan is used to search for DBObjects
`scan` allows you to perform basic search operations on the handler's table. `scan` can return:
- DBObjects
- some attributes only: pass an array of `attributes`
- the entire object: specify `returnData: true`
- only the id of the objects: specify `idOnly`

Queries are constructed with the params object, as shown below. They consist of an array of array statements, of the following form: `['attribute.in.question', 'COMPARISON_OPERATOR', 'targetValue', 'AND/OR']`. Currently supported comparison operators:
- `=`: direct equality
- `CONTAINS: used with an array or string and a value to find within it
- 'INTERSECTS': used with arrays. Returns the object if the specified attribute and supplied value have a member in common.

Note that there exists a `query` method, identical to the scan method except that it operates within the scope of a single primaryKey, for use on collections.

```javascript
let read9 = await userHandler.scan({
    params: [
        ['firstName', '=', 'joe', 'AND'],
        ['friends', 'CONTAINS', 'danny']
    ],
    attributes: ['firstName', 'lastName', 'phone']    // TODO: change to "paths"
})

```
`scan` parameters:
- `params`: the query, as described above
- `attributes`: `['array', 'of', 'specific.attributes']` to return. If supplied, the method will return an array of objects containing these attributes, as well as an array of members and the object's ID
- `returnData`: boolean, returns the entire object if true
- `idOnly`: return nothing but an array of ids of found objects
- `user`, `permission` as elsewhere

## Collections are like handlers that are object properties
Suppose you have a conversation object on which you want to store a potentially huge number of messages, which you'd like to be able to get one page at a time, sorted by when they were sent. In this case you'd use a `collection`, which is essentially a timeOrdered DBObjectHandler that exists as an attribute on a DBObject. Unlike freestanding handlers, collections can have permissions, creators, and members.

**TODO: rename 'permission' to 'sensitivity', capitalize 'subclass'**

Collections are created with the `DBObject.createCollection` method:

```javascript
await parentObj.createCollection({
    path,
    subclass: MySubclass,
    creator: 'me@gmail.com',
    members: {
        'you@gmail.com': {read: 5, write: 5},
        'theOtherGuy@gmail.com': {read: 5, write: 0}
    },
    permission: {read: 5, write: 7}
})
```
`createCollection` parameters:
- `path`: `'path.to.this.collection'` as in any other set operation
- `subclass` as in DBObjectHandler constructor
- `creator`, `members`, `permission` as elsewhere

### You can think of a collection as a handler accessible with the `collection` method
The `collection` method takes `path`, as well as `user` and `permission` as elsewhere, and returns the collection handler. The collection itself behaves exactly like any other DBObject handler. Note, however, that you should use the `query` method, which namespaces the search to within the primaryKey of the collection and is therefore considerably less expensive, in place of `scan`.

Note also that, since `collection` is a synchronous method, the DBObject index must be loaded before it can be used.

### `batchGetObjectsByPage` and `batchGetObjectsByTime` can be used on collections
Since collections are time ordered, you can get them pagewise. `batchGetObjectsByPage` and `batchGetObjectsByTime` both work much the way getObject and scan do, but return limited numbers of objects within specified ranges.

```javascript
await convo.collection({path: 'collection'}).batchGetObjectsByPage({
    limit: 20,
    exclusiveFirstTimestamp: 1573962788,
    returnData: true
})

await convo.collection({path: 'collection'}).batchGetObjectsByPage({
    startTime: 1573960724,
    endTime: 1573962788,
    attributes: ['firstName', 'lastName', 'email']
    returnData: true
})

```
`batchGetObjectsByPage` parameters:
- `limit`: max number of objects to return
- `exclusiveFirstTimestamp`: the last timestamp of the last batch, used to get the next page. Timestamps can be gotten by calling `DBObject.timestamp()` on objects from an ordered handler.
- `ascending`: `false` by default
- `attributes`, `returnData`, `idOnly`, `includeID` as in other handler methods
- user, permission as elsewhere

`batchGetObjectsByTime` parameters are the same as above, except include `startTime` and `endTime`, and omit `limit` and `exclusiveFirstTimestamp`
- 


```javascript
let convo = convoHandler.instantiate({id: 'myConvo'})
await convo.ensureIndexLoaded()
await convo.collection({path: 'messages'}).createObject({
    data: {
        recipient: 'ajgrimes@elsewhere.edu',
        subject: 'stuff',
        body: 'this is a message'
    }
})
await convo.collection({path: 'messages'}).createObject({
    data: {
        recipient: 'ajgrimes@elsewhere.edu',
        subject: 'stuff',
        body: 'this is another message'
    }
})
await convo.collection({path: 'messages'}).createObject({
    data: {
        recipient: 'mrsmiller@gmail.com',
        subject: 'something else',
        body: 'more messages!'
    }
})
await convo.collection({path: 'messages'}).createObject({
    data: {firstName: 'joe', friends: ['johnny']}
})

let messagesAboutStuff = await convo.collection({path: 'messages'}).query({
    params: [
        ['recipient', '=', 'ajgrimes@gmail.com', 'AND'],
        ['stuff', '=', 'stuff']
    ],
    returnData: true
})
```
`collection` parameters:
- `path` to collection
- `user`, `permission`, as elsewhere


## Permissions
jsondb includes a native permissions mechanism. It extends across all functionality and allows you to:
- specify an `objectPermission` to a DBObject, used to enforce read and write access
- further specify a `sensitivity` to individual paths within an object, which is inherited by subordinate paths inherit this sensitivity. Note that sensitivites apply only to read access
- filter objects by sensitivity, returning only those paths below a specified threshold

All permissions default to zero, meaning that this system can be ignored completely if your application does not require selective permissioning.

### jsondb uses permission objects specifying read and write values from 0-9
Anytime you see 'permission' throughout jsondb, it refers to an object like this:
```js
permisson = {read: 6, write: 2}
```

### DBObjects have `objectPermissions` and their individual paths have `sensitivity` levels
DBObjects take an `objectPermission` upon creation, which specifies read and write levels necessary to perform relevant methods on the object. 

`sensitivity` is a property of individual object nodes, and works a bit differently: it is specified with a single integer, and reads done below that threshold simply filter the sensitive attribute out of the returned object. This is useful for, for instance, storing private information on an otherwise public user profile.

### DBObjects have creators and members
Objects and collections have a concept of members, mappings of user ids to permission objects. Members are specified with permission objects, while the creator has full permissions automatically. Both `creator` and `members` arguments can be specified to `DBObject.create` and `DBObject.createCollection`, but afterwards members can be added and removed.

Member data is stored in the index rather than on the object, but for convenience, a `members` array, including ids of all members and the creator, is included within the body of a DBObject.

```js
let myDocument = await documentHander.createObject({
    id: 'myDocumentID', 
    data: {
        stuff: '...'
    },
    objectPermission: {read: 0, write: 3},
    creator: 'me@gmail.com'
    members: {
        'you@gmail.com': {read: 4, write: 2},
        'him@gmail.com': {read: 2, write: 0},
        'her@gmail.com': {read: 9, write: 7}
    }
})

await myDocument.setMemberPermission({
    id: 'john@gmail.com',
    permission: {read: 5, write: 5}
})

await myDocument.setMemberPermission({
    id: 'mary@gmail.com',
    permission: {read: 8, write: 0}
})

await myDocument.removeMember(id: 'mary@gmail.com')

// NOTE: setMemberPermission and removeMember require a subsequent set operation to write to the db
// This can be done with empty attributes if necessary
await myDocument.set({attributes: {}})

let johnPermission = await myDocument.getMemberPermission({id: 'john@gmail.com'})

let creator = await myDocument.getCreator()
let createdDate = await myDocument.getCreatedDate()

let membersArray = await myDocument.getMembers()
let membersArrayIsAlsoOnTheObjectItself = await myDocument.get({path: 'members'})

```

### "user" or "permission" can be specified to gain access to an object
If an object uses `objectPermission` or `sensitivity`, then read operations on it will return nothing and write operations, in the former case, will fail unless credentials are specified. These can be specified as in two ways:
- `user`: the id of a potential member/creator. If this object contains such a member, the operation will be carried out with that member's permissions
- `permission`: a permission object can be passed directly. This will override a user and conduct the operation at the specified permission level.

