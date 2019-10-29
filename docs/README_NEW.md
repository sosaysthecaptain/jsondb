# jsondb
**jsondb** is a DynamoDB abstraction layer that lets you work easily and efficiently with giant virtual objects, reading and writing them as if they were in memory. What you can do with it:
- **get and set** properties as you would on an object: `obj.set({'some.path': 12345})`, `obj.get('path.to.key')`
- **work with collections:** `user.getFromCollection('messages', {limit: 20})`
- **upload and retrieve files from s3** as if they were part of the object: `user.setFile('thumbnail', <buffer>)`
- associate specific **sensitivity levels** with specific keys, and fetch in a manner that automatically filters out objects above the specified sensitivity level: `user.get(settings, {sensitivity: 3})`
- **nest DBObjects** inside other DBObjects: `user1.setReference('friends.user2', user2.id)`


jsondb consists (principally) of two classes:
- `DBObject` represents a virtual object in the database
- `DBObjectHandler` provides an interface for creating and retrieving DBObjects. A DBObjectHandler is instantiated with AWS credentials and the name of a specific table


## DBObjectHandler

[Instantiating a DBObjectHandler] (./handlerInstantiate.md)
[Creating and destroying objects] (./handlerCreateDestroy.md)
[Instantiating objects] (./handlerInstantiate.md)
[Getting data directly from objects] (./handlerDirectGet.md)
[Getting objects in a pagewise fashion] (./handlerPagewise.md)
[Querying objects] (./handlerQuery.md)

## DBObject
[Getting and setting basic values] (./dbobjectGetSet.md)
[References: DBObjects as properties of other DBObjects] (./dbobjectReferences.md)
[Files: S3 Integration] (./dbobjectFiles.md)
[Collections: Time-ordered DBObjectHandlers as properties of DBObjects] (./dbobjectCollections.md)

## Permissions
[Permissions: understanding object permissions, collection permissions, and node sensitivities] (./permissions.md)

