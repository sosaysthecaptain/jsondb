/*
Represents a virtual object in memory, as stored in dynamo. Begins as a single node, splits itself up 
as necessary. Each DBObject in reality represents an individual node, except that top level nodes 
are designated as such upon instantiation, and keep a cache, while child nodes don't.

*/

const flatten = require('flat')
const unflatten = require('flat').unflatten
const _ = require('lodash')

// const DynamoClient = require('./DynamoClient')
const NodeIndex = require('./NodeIndex')
const u = require('./u')

class DBObject {
    constructor(id, {tableName, dynamoClient, isNew}) {
        
        // Information we actually have
        this.id = id,
        this.dynamoClient = dynamoClient,
        this.tableName = tableName
        this.key = u.keyFromID(id)

        // Default assumptions about information we don't have yet
        this.permissionLevel = u.DEFAULT_PERMISSION_LEVEL
        this.maximumCacheSize = u.MAXIMUM_CACHE_SIZE
        this.parent = null
        
        // Places to put things
        this.index = new NodeIndex(this.id, isNew)
        this.cache = {}
        this.cacheIndex = {}
        this.cacheSize = 0
        this.cachedDirectChildren = {}
    }

    // Creates a new object in the database
    async create(initialData, params={}) {
        this.parent = params.parent || null
        this.permissionLevel = params.permissionLevel || u.DEFAULT_PERMISSION_LEVEL
        let permission = params.permission || null

        if (initialData[u.INDEX_KEY]) {
            delete initialData[u.INDEX_KEY]
        }
        u.validateKeys(initialData)
        return await this.set(initialData, {doNotOverwrite: true, permission})
    }

    async destroy() {
        await this.ensureIndexLoaded()

        // Wipe any lateral nodes
        let lateralIDs = this.index.getAllLateralPointers()
        await this._deleteLateral(lateralIDs)

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
        let data = await this.dynamoClient.delete({
            tableName: this.tableName,
            key: this.key,
        }).catch((err) => {u.error('failure in DBObject.delete', err)})
        return data.Attributes
    }

    async ensureDestroyed() {
        let exists = await this.destroy()
        if (!exists) {
            return true
        } else {
            this.ensureDestroyed()
        }
    }

    async get(path, params={}) {
        let {permission} = params
        await this.ensureIndexLoaded()

        // No path == entire object, gotten by a different methodology
        if (!path) {
            let allKeysFlat = await this._getEntireObject(permission)
            return unflatten(allKeysFlat)
        }
        
        // Otherwise use batchGet and pull out path from naturally formatted object
        let data = await this.batchGet(path, {permission})
        
        if (path !== '') {
            data = unflatten(data)
            let arrPath = u.stringPathToArrPath(path)
            data = _.get(data, arrPath)
            
            return data
        } 
        data = unflatten(data)
        return data
    }
    
    async batchGet(paths, params={}) {
        let {permission} = params
        await this.ensureIndexLoaded()
        let data = {}

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
            pathObj = await this._permissionfilterAttributes(pathObj, permission)
            
            // Get what we can from the cache
            Object.keys(pathObj).forEach((path) => {
                let fromCache = this._cacheGet(path)
                if (fromCache) {data[path] = fromCache}
            })

            // Location of key—-here, on direct child, gettable from direct child
            let pathsByChild = {}
            let specialCases = []
            Object.keys(pathObj).forEach((path) => {

                let childID = this.index.getIDForPath(path)
                if (childID) {
                    if (!pathsByChild[childID]) {pathsByChild[childID] = []}
                    pathsByChild[childID].push(path)
                } else {specialCases.push(paths)}
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
                    let dataFromChild = await childNode.batchGet(pathsOnChild)
                    data = _.assign({}, data, dataFromChild)
                }
                delete pathsByChild[childID]
            }
        } 
        
        // No paths: just dump from dynamo and clean up
        else {
            data = await this._read()
            delete data.uid
            delete data.ts
            delete data[u.INDEX_KEY]
        }
            
        // Cache and return
        u.processReturn(data)
        this._cacheSet(data)
        return u.unpackKeys(data)
    }

    async set(attributesOriginal, params={}) {
        let {doNotOverwrite, permission} = params
        let attributes = u.copy(attributesOriginal)
        u.validateKeys(attributes)
        u.processAttributes(attributes)
        attributes = flatten(attributes)
        u.packKeys(attributes)
        await this.getChildNodes()

        // Identify nodes that need to be deleted, delete them
        let changedPaths = this.index.getPathsToDelete(attributes)
        if (changedPaths.length) {
            await this.handleDeletions(changedPaths)
            this._cacheUnsetDeleted(changedPaths)
        }

        // Update the index, set its permissions
        this.index.build(attributes, permission)
        this.index.updatePermissions(permission, attributes)
        this._cacheSet(attributes)
        
        
        // If oversize, split, otherwise write
        if (this.index.isOversize() || this.index.hasOversizeKeys()) {
            return await this._handleSplit(attributes)
        } else {
            return await this._write(attributes, doNotOverwrite)
        }
    }

    async modify(path, fn) {
        u.startTime('modify ' + path)
        let obj = await this.get(path)
        fn(obj)

        let attributes = {}
        attributes[path] = obj

        let res = this.set(attributes)
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


    /*  INTERNAL METHODS */

    // Writes given attributes to this specific node, assumes index is prepared
    async _write(attributes, doNotOverwrite) {
        u.startTime('write')
        this.index.parent(this.parent)
        let writableIndexObject = this.index.write()
        attributes[u.INDEX_KEY] = u.encode(writableIndexObject)
        
        // Write to dynamo
        let data = await this.dynamoClient.update({
            tableName: this.tableName,
            key: this.key,
            attributes: attributes
        }).catch((err) => {
            console.log('failure in DBObject._write')
            console.error(err)
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
        return data
    }

    // Returns all keys, flat. It is the responsibility of the caller to unflatten
    async _getEntireObject(permission) {

        await this.ensureIndexLoaded()

        // Get everything locally available
        let data = await this.batchGet()

        // Get all children. Get data from each and add it
        let children = await this.getChildNodes()
        let childKeys = Object.keys(children)
        for (let i = 0; i < childKeys.length; i++) {
            let childID = childKeys[i]
            let dataFromChild = await children[childID]._getEntireObject(permission)
            Object.keys(dataFromChild).forEach((key) => {
                data[key] = dataFromChild[key]
            })
        }

        // Filter by permission -- TODO: MAKE THIS BETTER, MOVE ONTO NEW INDEX?
        this._permissionfilterAttributes(data, permission)

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
            if (!allKeysInIndex.length) {this.destroy()}
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
                this.cachedDirectChildren[id] = new DBObject(id, {
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

    // marc-look
    // Takes object of attributes to get, filters down those user has permission for
    async _permissionfilterAttributes(attributes, userPermission=9) {
        if (userPermission == undefined) {return attributes}
        let filtered = {}
        Object.keys(attributes).forEach((path) => {
            let nodePermission = this.index.getNodePermission(path)
            if (nodePermission <= userPermission) {
                filtered[path] = attributes[path]
            }
        })
        return filtered
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
                    // attributesToAdd.push(indexEntry.getPath())
                    attributesToAdd.forEach((key) => {
                        attributesForNewNode[key] = newAttributes[key]
                        delete newAttributes[key]
                    })
                    // let MARC_DO_SOMETHING_ABOUT_THIS = this.index.deleteNode(indexEntry.getPath())
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
                let newNode = new DBObject(newNodeID, {
                    dynamoClient: this.dynamoClient,
                    tableName: this.tableName
                })
                let pathsOnNewNode = Object.keys(attributesForNewNode)
                await newNode.create(attributesForNewNode, {
                    permissionLevel: this.permissionLevel, 
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
        await this.set(newAttributes)
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