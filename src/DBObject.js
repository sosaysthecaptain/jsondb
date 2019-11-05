/*
Represents a virtual object in memory, as stored in dynamo. Begins as a single node, splits itself up 
as necessary. Each DBObject in reality represents an individual node, except that top level nodes 
are designated as such upon instantiation, and keep a cache, while child nodes don't.

*/

const _ = require('lodash')


const NodeIndex = require('./NodeIndex')
const u = require('./u')

class DBObject {
    constructor({id, tableName, dynamoClient, s3Client, isNew, isTimeOrdered, doNotCache, encodedIndex, data}) {
        
        // Handle both instantiation of new object by PK only and whole id
        if (isTimeOrdered) {
            if (id.split('-').length === 1)
            id += '-' + Date.now()
        }
        
        // Information we actually have
        this.id = id,
        this.dynamoClient = dynamoClient,
        this.s3Client = s3Client,
        this.tableName = tableName
        this.key = u.keyFromID(id)
        this.doNotCache = doNotCache

        
        // Default assumptions about information we don't have yet
        this.sensitivityLevel = u.DEFAULT_SENSITIVITY
        this.maximumCacheSize = u.DEFAULT_CACHE_SIZE
        this.parent = null
        
        // Places to put things
        this.index = new NodeIndex(this.id, isNew)
        this.cache = {}
        this.cacheIndex = {}
        this.cacheSize = 0
        this.cachedDirectChildren = {}
        
        // Jumpstarting options
        if (encodedIndex) {
            let indexData = u.decode(encodedIndex)
            this.index.loadData(indexData)
        }

        if (data) {
            this._cacheSet(data)
        }

        return this.id
    }

    // Creates a new object in the database
    async create({data, sensitivity, objectPermission, parent, allowOverwrite, creator, members}) {
        if (!allowOverwrite) {
            if (await this.checkExists()) {throw new Error('DBObject already exists with id ' + this.id)}
        }

        this.parent = parent || null

        if (data[u.INDEX_KEY]) {
            delete initialData[u.INDEX_KEY]
        }
        u.validateKeys(data)
        return await this.set({attributes: data, creator, members, sensitivity, objectPermission})
    }

    async destroy({user, confirm, permissionOverride}={}) {
        await this.ensureIndexLoaded()
        
        if (!permissionOverride) {
            if (!this.checkPermission({user, write: true})) {return undefined}
        }

        // Lateral and collection nodes require special destruction steps
        let allNodes = this.index.getChildren()
        let nodesByType = this.index.getNodesByType(allNodes)
        let lateralIDs = this.index.getAllLateralPointers()
        await this._deleteLateral(lateralIDs)

        // Empty collections
        let collectionNodePaths = Object.keys(nodesByType.collection)
        for (let i = 0; i < collectionNodePaths.length; i++) {
            let path = collectionNodePaths[i]
            await this.emptyCollection({path, user})
        }

        // Delete files
        let fileNodePaths = Object.keys(nodesByType.s3)
        for (let i = 0; i < fileNodePaths.length; i++) {
            let fileID = this.index.getNodeProperty(fileNodePaths[i], 'fileID')
            await this.s3Client.delete(fileID)
        }

        // Get all children, destroy them
        let childNodes = await this.getChildNodes()
        let childIDs = Object.keys(childNodes)
        for (let i = 0; i < childIDs.length; i++) {
            let childID = childIDs[i]
            let childNode = childNodes[childID]
            await childNode.destroy()
        }
        
        // Then destroy this node
        this.invalidateCache()
        await this.dynamoClient.delete({
            tableName: this.tableName,
            key: this.key,
        }).catch((err) => {u.error('failure in DBObject.delete', err)})
        if (confirm) {
            let exists = await this.checkExists()
            return !exists
        }
    }

    async ensureDestroyed({user, permissionOverride}={}) {
        let exists = await this.checkExists()
        if (!exists) {
            return true
        } else {
            await this.destroy({user, permissionOverride})
            return await this.ensureDestroyed({user, permissionOverride})
        }
    }

    async get({path, permission, user, noCache}={}) {
        await this.ensureIndexLoaded()
        if (user) {permission = await this.getMemberPermission({id: user})}

        // No path == entire object, gotten by a different methodology
        if (!path) {
            let allKeysFlat = await this._getEntireObject({permission, noCache})
            return u.unflatten(allKeysFlat)
        }
        
        // Otherwise use batchGet and pull out path from naturally formatted object
        let data = await this.batchGet({paths: path, permission, noCache})
        
        if (path !== '') {
            data = u.unflatten(data)
            let humanPath = u.unpackKeys(path)
            let arrPath = u.stringPathToArrPath(humanPath)
            data = _.get(data, arrPath)
            
            return data
        } 
        
        data = u.unflatten(data)
        return data
    }
    
    async batchGet({paths, permission, user, noCache}) {
        await this.ensureIndexLoaded()
        let data = {}

        if (user) {permission = await this.getMemberPermission({id: user})}

        // Does this node go further than what we have reference of in the local index?
        if (!paths && this.index.isTheBottom()) {paths = this.index.getChildren()}

        if (paths) {
            if (typeof paths === 'string') {
                paths = [paths]
            }
            paths = u.packKeys(paths)

            // Add this path and all its children to an object
            let pathObj = {}
            paths.forEach((path) => {
                pathObj[path] = null
                let children = this.index.getChildren(path)
                children.forEach((childPath) => {
                    pathObj[childPath] = null
                })
            })

            // Filter requests by permission
            pathObj = await this._permissionFilterAttributes(pathObj, permission)
            
            // Get what we can from the cache
            if (!noCache) {
                Object.keys(pathObj).forEach((path) => {
                    let fromCache = this._cacheGet(path)
                    if (fromCache) {data[path] = fromCache}
                })
            }

            // Location of key—-here, on direct child, gettable from direct child
            let pathsByChild = {}
            let specialCases = []
            Object.keys(pathObj).forEach((path) => {

                let childID = this.index.getIDForPath(path)
                if (childID) {
                    if (!pathsByChild[childID]) {pathsByChild[childID] = []}
                    pathsByChild[childID].push(path)
                } else {
                    specialCases.push(paths)
                    let test = this.index.getIDForPath(path)
                }
            })
            
            // Read local
            let localPaths = pathsByChild[this.id]
            if (localPaths) {
                delete pathsByChild[this.id]
                let dataFromLocal = await this._read(localPaths)
                data = _.assign({}, data, dataFromLocal)
            }

            // Lateral reconstruction
            for (let i = 0; i < specialCases.length; i++) {
                let path = specialCases[i]
                let latPtrs = this.index.getLateralPointers(path)
                if (latPtrs) {
                    let lateralData = {}
                    lateralData[path] = await this._reconstructLaterallySplitNode(latPtrs)
                    data = _.assign({}, data, lateralData)
                }
            }
            
            // Everything non-local, via batchGet of direct children
            let childDBObjectNodes = await this.getChildNodes()
            let childObjectKeys = Object.keys(childDBObjectNodes)
            for (let i = 0; i < childObjectKeys.length; i++) {
                let childID = childObjectKeys[i]
                if (pathsByChild[childID]) {
                    let pathsOnChild = pathsByChild[childID]
                    let childNode = childDBObjectNodes[childID]
                    let dataFromChild = await childNode.batchGet({paths: pathsOnChild})
                    data = _.assign({}, data, dataFromChild)
                }
                delete pathsByChild[childID]
            }
        } 
        
        // No paths: just dump from dynamo and clean up
        else {
            data = await this._read()
            delete data[u.PK]
            delete data[u.SK]
            delete data[u.INDEX_KEY]
        }
            
        // Cache and return
        // u.processReturn(data)
        this._cacheSet(data)
        return u.unpackKeys(data)
    }

    async set({attributes, sensitivity, creator, members, objectPermission}) {
        let newAttributes = u.copy(attributes)
        u.validateKeys(newAttributes)
        // u.processAttributes(newAttributes)
        newAttributes = u.flatten(newAttributes)
        u.packKeys(newAttributes)
        await this.getChildNodes()

        // Identify nodes that need to be deleted, delete them
        let changedPaths = this.index.getPathsToDelete(newAttributes)
        if (changedPaths.length) {
            await this.handleDeletions(changedPaths)
            this._cacheUnsetDeleted(changedPaths)
        }

        // Update the index, set its sensitivity levels
        this.index.build(newAttributes, sensitivity)
        this.index.updateSensitivities(sensitivity, newAttributes)
        this._cacheSet(newAttributes)

        // Set top level creator/member data
    
        if (creator) {await this.setCreator({id: creator})}
        if (objectPermission) {await this.setObjectPermission({objectPermission})}        
        if (members) {
            let memberIDs = Object.keys(members)
            for (let i = 0; i < memberIDs.length; i++) {
                let memberID = memberIDs[i]
                await this.setMemberPermission({
                    id: memberID, 
                    permission: members[memberID]
                })
            }
        }
        
        // If oversize, split, otherwise write
        if (this.index.isOversize() || this.index.hasOversizeKeys()) {
            return await this._handleSplit(newAttributes)
        } else {
            return await this._write(newAttributes)
        }
    }

    async modify({path, fn, permission, user}) {
        u.startTime('modify ' + path)
        let obj = await this.get({path, permission, user})
        fn(obj)

        let attributes = {}
        attributes[path] = obj

        let res = this.set({attributes})
        u.stopTime('modify ' + path)
        return res
    }

    invalidateCache(path) {
        if (!path) {
            this.cache = {}
            this.cacheIndex = {}
            this.cacheSize = 0
            return
        }
        delete this.cache[path]
        let size = this.cacheIndex[path].size
        delete this.cacheIndex[path]
        this.cacheSize -= size
    }

    size() {
        if (this.index.size) {
            return this.index.size()
        }
        return 0
    }

    async ensureIndexLoaded() {if (!this.index.isLoaded()) {await this.loadIndex()}}
    async loadIndex() {
        let indexData = await this.dynamoClient.get({
            tableName: this.tableName,
            key: this.key,
            attributes: [u.INDEX_KEY]
        })
        if (!indexData) {return}
        let decodedIndexData = u.decode(indexData[u.INDEX_KEY])
        this.index.loadData(decodedIndexData)
        this.parent = this.index.parent()
        return
    }

    async checkExists() {
        let gotten = await this.dynamoClient.get({
            tableName: this.tableName,
            key: this.key,
            attributes: [u.PK]
        })
        if (gotten) {return true}
        return false
    }

    timestamp() {return u.keyFromID(this.id)[u.SK]}

    /* 
    SPECIAL TYPES
    References, collections, and files are stored by reference as normal data, and accessed singly 
    via special purpose getters and setters

    */
   async setReference({path, id, sensitivity}) {
       await this.ensureIndexLoaded()
       path = u.packKeys(path)
       let attributes = {}
       attributes[path] = id
       this.index.setNodeProperty(path, 'reference', id)
       this.index.setDontDelete(path, true)
       await this.set({attributes, sensitivity})
    }
    
    async getReference({path, permission, user}) {
        await this.ensureIndexLoaded()
        path = u.packKeys(path)
        let id = await this.get({path, permission, user})
        let dbobject = new DBObject({
            id: id,
            dynamoClient: this.dynamoClient,
            tableName: this.tableName,
            doNotCache: true
        })
        await dbobject.loadIndex()
        return dbobject
    }
    
    // Set type to s3, write to s3, put link as string content of node
    async setFile({path, data, sensitivity}) {
        await this.ensureIndexLoaded()
        path = u.packKeys(path)

        // Generate fileID, store it on the index, set nodetype
        let fileID = u.uuid()
        this.index.setNodeType(path, u.NT_S3REF)
        this.index.setNodeProperty(path, 'fileID', fileID)
        this.index.setDontDelete(path, true)
        
        // Write the file to s3, write the url to the node
        let ref = await this.s3Client.write(fileID, data)
        let attributes = {}
        attributes[path] = ref
        await this.set({attributes, sensitivity})
        return ref
    }
    
    async getFile({path, permission, user, returnAsBuffer}) {
        await this.ensureIndexLoaded()

        if (user) {permission = await this.getMemberPermission({id: user})}

        path = u.packKeys(path)
        if (this.index.getNodeType(path, u.NT_S3REF) !== u.NT_S3REF) {
            throw new Error('Node is not a file')
        }

        // Manually check sensitivity, since we don't necessarily have the built-in check
        if (permission) {
            let nodeSensitivity = this.index.getNodeSensitivity(path)
            if (permission < nodeSensitivity) {return null}
        }
        
        // Return either s3 url from object or else read the buffer from fileID on index
        if (!returnAsBuffer) {
            return await this.get({path})
        } else {
            let fileID = this.index.getNodeProperty(path, 'fileID')
            let buffer = await this.s3Client.read(fileID)
            return buffer
        }
    }

    async deleteFile({path}) {
        await this.s3Client.delete(path)
    }
    
    async createCollection({path, permission, creator, members, subclass}) {
        await this.ensureIndexLoaded()
        path = u.packKeys(path)
        members = members || {}

        this.index.setNodeType(path, u.NT_COLLECTION)
        this.index.setNodeProperty(path, 'seriesKey', this._getCollectionSeriesKey(path))
        this.index.setNodeProperty(path, 'subclass', subclass)
        this.index.setNodeProperty(path, 'creator', creator)
        this.index.setNodeProperty(path, 'members', members)
        // this.index.setNodeSensitivity(path, sensitivity)
        this.index.setNodeProperty(path, 'permission', permission)
        this.index.setNodeProperty(path, 'creationDate', Date.now())
        this.index.setDontDelete(path, true)
        let attributes = {}
        attributes[path] = '<COLLECTION>'
        await this.set({attributes})
        return this._getCollectionSeriesKey(path)
    }

    _getCollectionSeriesKey(path) {return this.id + '_' + path}
    
    async emptyCollection({path, user}) {
        await this.ensureIndexLoaded()
        path = u.packKeys(path)
        this._ensureIsCollection(path)
        while (true) {
            let dbobjects = await this.collection({path, user}).getObjects()
            if (!dbobjects.length) {break}
            for (let i = 0; i < dbobjects.length; i++) {
                let dbobject = dbobjects[i]
                await this.collection({path, user}).destroyObject({id: dbobject.id, permissionOverride: true})
            }
        }
    }

    async setCollectionMember({path, member, permission, deleteMember}) {
        debugger
        this.index.setDontDelete(path, true)
        let members = this.index.getNodeProperty(path, 'members')

        if (!deleteMember) {
            delete members[member]
        } else {
            members[member] = permission
        }

        this.index.setNodeProperty(path, 'members', members)
        
        // To set we have to do an empty write
        let attributes = {}
        attributes[path] = '<COLLECTION>'
        await this.set({attributes})
        return this._getCollectionSeriesKey(path)
    }

    // Zero permission unless member set, or unless collection was created by object creator
    _getCollectionUserPermission({path, user}) {
        if (user) {
            let creator = this.index.getNodeProperty(path, 'creator')
            if (creator === user) {return {read: 9, write: 9}}
            let members = this.index.getNodeProperty(path, 'members')
            if (members && members[user]) {
                return members[user]
            }
        }
        return {read: 0, write: 0}
    }

    collection({path, user}) {
        path = u.packKeys(path)
        this._ensureIsCollection(path)

        // userPermission: assumes default only if no user passed
        let userPermission
        userPermission = this._getCollectionUserPermission({path, user})
        if (!userPermission) {
            userPermission = {read: 0, write: 0}
        }
        
        let permission = this.index.getNodeProperty(path, 'permission')

        let seriesKey = this._getCollectionSeriesKey(path)
        let subclass = this.index.getNodeProperty(path, 'subclass')
        let DBObjectHandler = require('./DBObjectHandler')
        return new DBObjectHandler({
            seriesKey: seriesKey,
            awsAccessKeyId: this.dynamoClient.awsAccessKeyId,
            awsSecretAccessKey: this.dynamoClient.awsSecretAccessKey,
            awsRegion: this.dynamoClient.awsRegion,
            bucketName: this.s3Client.bucketName,
            tableName: this.tableName,
            subclass: subclass,
            isTimeOrdered: true, 
            doNotCache: true,
            
            permission: permission,
            userPermission: userPermission, 
        })
    }
    
    getCollectionSeriesKey(path) {return (this.id + '_' + path)}

    
    _ensureIsCollection(path) {
        if (this.index.getNodeType(path) !== u.NT_COLLECTION) {
            throw new Error('Specified path is not a collection')
        }
    }

    async setCreator({id}) {
        await this.ensureIndexLoaded()
        this.index.metaIndex().data[u.CREATOR] = id
        this.index.metaIndex().data[u.CREATED_DATE] = Date.now()
    }
    async getCreator() {
        await this.ensureIndexLoaded()
        return this.index.metaIndex().data[u.CREATOR]
    }
    
    async getCreatedDate() {
        await this.ensureIndexLoaded()
        return this.index.metaIndex().data[u.CREATED_DATE]
    }

    async setMemberPermission({id, permission}) {
        await this.ensureIndexLoaded()
        this.index.metaIndex().data[u.MEMBERS] = this.index.metaIndex().data[u.MEMBERS] || {}
        this.index.metaIndex().data[u.MEMBERS][id] = permission
    }
    
    async getMemberPermission({id}) {
        await this.ensureIndexLoaded()
        if (id && (this.index.metaIndex().data[u.CREATOR] === id)) {return u.MAX_PERMISSION}
        
        if (id) {
            let members = this.index.metaIndex().data[u.MEMBERS]
            if (members) {
                return this.index.metaIndex().data[u.MEMBERS][id]   
            }
        }
        return u.DEFAULT_PERMISSION
    }

    async getMembers() {
        await this.ensureIndexLoaded()
        return this.index.metaIndex().data[u.MEMBERS]

    }
    
    async removeMember({id}) {
        await this.ensureIndexLoaded()
        this.index.metaIndex().data[u.MEMBERS] == this.index.metaIndex()[u.MEMBERS] || {}
        delete this.index.metaIndex().data[u.MEMBERS][id]
    }

    async checkPermission({user, write}) {
        let userPermission = await this.getMemberPermission({id: user})
        let objectPermission = await this.getObjectPermission()

        if (write) {
            if (!userPermission) {
                return object
            }
            return (userPermission.write >= objectPermission.write)
        }
        return (userPermission.read >= objectPermission.read)
    }

    async setObjectPermission({objectPermission}) {
        if (objectPermission) {
            await this.ensureIndexLoaded()
            this.index.metaIndex().data.permission = permission
        }
    }
    
    async getObjectPermission() {
        await this.ensureIndexLoaded()
        let objectPermission = this.index.metaIndex().data.permission
        objectPermission = objectPermission || u.DEFAULT_PERMISSION
        return objectPermission

    }


    // Takes object of attributes to get, filters down those user has read permission for
    // Can take permission object {read: x, write: y} or simply integer read permission
    async _permissionFilterAttributes(attributes, permission=u.DEFAULT_PERMISSION) {
        let readPermission = permission
        if (permission.read !== undefined) {readPermission = permission.read}

        let filtered = {}
        Object.keys(attributes).forEach((path) => {
            let nodeSensitivity = this.index.getNodeSensitivity(path)
            nodeSensitivity = nodeSensitivity || u.DEFAULT_SENSITIVITY
            if (nodeSensitivity <= readPermission) {
                filtered[path] = attributes[path]
            }
        })
        return filtered
    }


    /*  INTERNAL METHODS */

    // Writes given attributes to this specific node, assumes index is prepared
    async _write(attributes) {

        u.startTime('write')
        this.index.parent(this.parent)
        this.index.resetDontDelete()
        let writableIndexObject = this.index.write()
        attributes[u.INDEX_KEY] = u.encode(writableIndexObject)

        u.packAttributes(attributes)
        
        // Write to dynamo
        let data = await this.dynamoClient.update({
            tableName: this.tableName,
            key: this.key,
            attributes: attributes
        }).catch((err) => {
            console.log('failure in DBObject._write')
            throw(err)
        })

        this.indexLoaded = true

        u.stopTime('write', {
            attributes: Object.keys(attributes).toString(),
            size: `${Math.round((u.getSize(attributes)/1024), 1)} KB`
        })
        return data
    }

    async _read(attributes) {
        let data = await this.dynamoClient.get({
            tableName: this.tableName,
            key: this.key,
            attributes: attributes
        }).catch((err) => {u.error('failure in DBObject._read', err)})

        u.unpackAttributes(attributes)

        return data
    }

    // Returns all keys, flat. It is the responsibility of the caller to unflatten
    async _getEntireObject({permission, user, noCache}) {
        await this.ensureIndexLoaded()

        if (user) {permission = await this.getMemberPermission({id: user})}

        // Get everything locally available
        let data = await this.batchGet({permission, noCache})

        // Get all children. Get data from each and add it
        let children = await this.getChildNodes()
        let childKeys = Object.keys(children)
        for (let i = 0; i < childKeys.length; i++) {
            let childID = childKeys[i]
            let dataFromChild = await children[childID]._getEntireObject({permission, noCache})
            Object.keys(dataFromChild).forEach((key) => {
                data[key] = dataFromChild[key]
            })
        }

        // Filter by sensitivity -- TODO: MAKE THIS BETTER, MOVE ONTO NEW INDEX?
        this._permissionFilterAttributes(data, permission)
        return u.unpackKeys(data)
    }

    // Recursive, use cache on top level
    async handleDeletions(keysToDelete) {
        if (this.parent) {
            await this.ensureIndexLoaded()
        }
        let condemned = this.index.getNodesByType(keysToDelete)
        if (Object.keys(condemned.local).length) {
            await this.dynamoClient.deleteAttributes({
                tableName: this.tableName,
                key: this.key,
                attributes: Object.keys(condemned.local)
            }).catch((err) => {u.error('failure in DBObject.handleDeletions', err)})
        }
        
        // Lateral
        let idsToDelete = []
        Object.keys(condemned.lateral).forEach((path) => {
            let node = condemned.lateral[path]
            idsToDelete = idsToDelete.concat(node.getLateralPointers())
        })
        await this._deleteLateral(idsToDelete)
        
        // Elsewhere
        let childNodesWithShitToDelete = {}
        Object.keys(condemned.elsewhere).forEach((path) => {
            let node = condemned.elsewhere[path]
            let pointer = node.getVerticalPointer()
            childNodesWithShitToDelete[pointer] = childNodesWithShitToDelete[pointer] || [] 
            childNodesWithShitToDelete[pointer].push(path)
        })
        let pointers = Object.keys(childNodesWithShitToDelete)
        for (let i = 0; i < pointers.length; i++) {
            let pointer = pointers[i]
            let paths = childNodesWithShitToDelete[pointer]
            await this.cachedDirectChildren[pointer].handleDeletions(paths)
        }

        // If this is subordinate and we've deleted the last entry, delete the entire node
        if (this.parent) {
            keysToDelete.forEach((path) => {
                delete this.index.i[path]
            })
            this.index.updateMetaNodes()
            let allKeysInIndex = this.index.getChildren()
            if (!allKeysInIndex.length) {await this.destroy()}
        }

        // TODO: COLLECTION, FILE, REF
    }

    async _deleteLateral(lateralIDs) {
        for (let i = 0; i < lateralIDs.length; i++) {
            let key = u.keyFromID(lateralIDs[i])
            await this.dynamoClient.delete({
                tableName: this.tableName,
                key: key,
            }).catch((err) => {u.error('failure in DBObject._deleteLateral', err)})
        }
    }

    async _reconstructLaterallySplitNode(nodeIDs) {
        let keys = []
        nodeIDs.forEach((id) => {
            keys.push(u.keyFromID(id))
        })
        let serialized = ''
        let pieces = await this.dynamoClient.batchGet({
            tableName: this.tableName,
            keys: keys,
            attributes: [u.LARGE_SERIALIZED_PAYLOAD, u.LARGE_EXT_INDEX]
        })

        pieces.sort((a, b) => a[u.LARGE_EXT_INDEX] > b[u.LARGE_EXT_INDEX])
        pieces.forEach((piece) => {
            serialized = serialized.concat(piece[u.LARGE_SERIALIZED_PAYLOAD])
        })

        return u.decode(serialized)
    }

    // Instantiates all child nodes
    async getChildNodes() {
        await this.ensureIndexLoaded()
        let ids = this.index.getAllVerticalPointers()
        let dbobjects = {}
        ids.forEach((id) => {
            if (!this.cachedDirectChildren[id]) {
                this.cachedDirectChildren[id] = new DBObject({
                    id,
                    dynamoClient: this.dynamoClient,
                    tableName: this.tableName
                })
            }
        })
        ids.forEach((id) => {
            dbobjects[id] = this.cachedDirectChildren[id]
        })
        return dbobjects
    }

    async _handleSplit(newAttributes) {
        
        /* LATERAL SPLIT */
        let keysRequiringLateralSplitting = this.index.getOversizeNodes()
        for (let i = 0; i < keysRequiringLateralSplitting.length; i++) {
            let path = keysRequiringLateralSplitting[i]
            let attributeValue = newAttributes[path]
            let latExIDs = await this._splitLateral(attributeValue)
            delete newAttributes[path]
            this.index.setLateralExt(path, latExIDs)
            this.index.updateMetaNodes()
        }
        
        /* VERTICAL SPLIT */
        let doVerticalSplit = async () => {
            let getAmountOver = () => {
                let overBy = this.index.getSize() - (u.MAX_NODE_SIZE + u.INDEX_MARGIN)
                if (overBy > 0) {
                    return overBy
                }
                return 0
            }
            
            // Lifts off as large a single vertical chunk as possible
            let pullOffNextBestNode = async () => {
                
                let newNodeID = u.generateNewID()
                let newNodeSizeLeft = u.MAX_NODE_SIZE
                let overBy = getAmountOver()
                let attributesForNewNode = {}
                
                
                let moveNodeToNewIndex = (indexEntry) => {
                    let attributesToAdd = this.index.getTerminalChildren(indexEntry.getPath())
                    attributesToAdd.forEach((key) => {
                        attributesForNewNode[key] = newAttributes[key]
                        delete newAttributes[key]
                    })
                    newNodeSizeLeft -= indexEntry.size()
                    overBy -= indexEntry.size()
                }
                
                // Group metanodes by order
                let metaNodePaths = this.index.getMetaNodes()
                let candidates = {}
                metaNodePaths.forEach((path) => {
                    let order = u.stringPathToArrPath(path).length
                    candidates[order] = candidates[order] || []
                    candidates[order].push(this.index.getNodeAtPath(path))
                })
                
                // Look for the largest groups that can be split off intact
                for (let depth = 0; depth < u.MAX_NESTING_DEPTH; depth++) {
                    if (candidates[depth]) {
                        candidates[depth].sort((a, b) => (a.size() < b.size()))
                        candidates[depth].forEach((candidate) => {
                            if ((candidate.size() < newNodeSizeLeft)) {
                                moveNodeToNewIndex(candidate)
                            }
                        })
                        
                    }
                }
                
                // If we're still over, iterate terminal nodes and add new attributes one by one
                if (overBy > u.INDEX_MARGIN) {
                    let allTerminal = this.index.getTerminalNodes()
                    allTerminal.forEach((path) => {
                        let candidate = this.index.getNodeAtPath(path)
                        if (candidate.size() < newNodeSizeLeft) {
                            moveNodeToNewIndex(candidate)
                        }
                    })
                }

                // TODO: SPILLOVER WOULD BE DEALT WITH HERE, IF THIS OBJECT HELD NOTHING BUT POINTERS
                
                // Create the new node
                let newNode = new DBObject({
                    id: newNodeID,
                    dynamoClient: this.dynamoClient,
                    tableName: this.tableName
                })
                let pathsOnNewNode = Object.keys(attributesForNewNode)
                await newNode.create({
                    data: attributesForNewNode,
                    sensitivityLevel: this.sensitivityLevel, 
                    parent: this.id
                })
                this.index.setVerticalPointer(newNode.id, pathsOnNewNode)
                return newNode
            }
            
            // Until current node has been depopulated sufficiently to fit, split off new nodes
            while (getAmountOver() > 0) {
                let newNode = await pullOffNextBestNode()
                this.cachedDirectChildren[newNode.id] = newNode
            }
        }

        if (this.index.isOversize()) {await doVerticalSplit()}
        
        // Write the remaining new attributes
        await this.set({attributes: newAttributes})
}

    // Manually divvies up overside load
    async _splitLateral(payload) {
        let childIDs = []
        let encoded = u.encode(payload)
        
        let index = 0
        while (encoded.length) {
            let encodedAttribute = encoded.slice(0, u.MAX_NODE_SIZE)
            encoded = encoded.slice(u.MAX_NODE_SIZE)
            let subNodeID = u.generateNewID()
            let subNodeKey = u.keyFromID(subNodeID)
            let attributes = {}
            attributes[u.LARGE_SERIALIZED_PAYLOAD] = encodedAttribute
            attributes[u.LARGE_EXT_INDEX] = index

            await this.dynamoClient.update({
                tableName: this.tableName,
                key: subNodeKey,
                attributes: attributes
            }).catch((err) => {u.error('failure in DBObject._splitLateral', err)})
            childIDs.push(subNodeID)
            index ++
        }
        return childIDs
    }

    _cacheGet(path) {
        if (this.doNotCache) {return undefined}
        if (this.cache[path]) {
            this.cacheIndex[path].accessed += 1
            this.cacheIndex[path].timestamp = Date.now()
            return this.cache[path]
        }
        return undefined
    }

    // Sets to cache if space, ejects oldest things if not
    _cacheSet(attributes) {
        if (this.parent) {return}
        let setIfFits = (key, value) => {
            let size = (u.getSize(value))
            let indexRecord
            let oldSize = 0
            if (this.cacheIndex[key] && this.cacheIndex[key].size) {
                oldSize = this.cacheIndex[key].size
            }
            let difference = size - oldSize
            if (this.cacheSize + difference < this.maximumCacheSize) {
                this.cache[key] = value
                this.cacheIndex[key] = {
                    timestamp: Date.now(),
                    accessed: 0,
                    size: size
                }
                this.cacheSize += difference
                return true
            } else {
                return false
            }
        }

        // Deletes oldest key until sufficient space cleared
        let clearSpace = (space) => {
            while (this.cacheSize + space > this.maximumCacheSize) {
                let oldestTimestamp = Date.now()
                let oldestKey
                Object.keys(this.cache).forEach((key) => {
                    if (this.cache[key].timestamp < oldestTimestamp) {
                        oldestTimestamp = this._cacheIndex[key].timestamp
                        oldestKey = key
                    }
                })
                if (Date.now() - oldestTimestamp > 15 * 1000) {
                    return false
                }
                this.cacheSize -= this.cacheIndex[key].size
                delete this.cache[key]
                delete this.cacheIndex[key]
            }
            return true
        }

        // If path already exists and size not a problem, replace, make space and try again
        Object.keys(attributes).forEach((path) => {
            if (path !== u.LARGE_SERIALIZED_PAYLOAD){
                let setSuccessfully = setIfFits(path, attributes[path])
                if (!setSuccessfully) {
                    clearSpace(u.getSize(attributes.path))
                    setIfFits(path, attributes[path])
                }
            }
        })
    }  

    _cacheUnsetDeleted(attributes) {
        attributes.forEach((path) => {
            delete this.cache[path]
        })
    }

}

module.exports = DBObject