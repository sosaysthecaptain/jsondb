/*
Represents a virtual object in memory, as stored in dynamo. Begins as a single node, splits itself up 
as necessary. Each DBObject in reality represents an individual node, except that top level nodes 
are designated as such upon instantiation, and keep a cache, while child nodes don't.

*/

const flatten = require('flat')
const unflatten = require('flat').unflatten
const _ = require('lodash')

const DynamoClient = require('./DynamoClient')
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
        this.isSubordinate = false
        
        // Places to put things
        this.index = new NodeIndex(this.id, isNew)
        this.cache = {}
        this.cacheIndex = {}
        this.cacheSize = 0
        this.cachedDirectChildren = {}
    }

    // Creates a new object in the database
    async create(initialData, params) {
        params = params || {}
        this.isSubordinate = params.isSubordinate || false
        this.permissionLevel = params.permissionLevel || u.DEFAULT_PERMISSION_LEVEL

        if (initialData[u.INDEX_KEY]) {
            delete initialData[u.INDEX_KEY]
        }
        u.validateKeys(initialData)
        return await this.set(initialData, true)
    }

    async destroy() {
        await this.ensureIndexLoaded()

        // Wipe any lateral nodes
        let lateralIDs = this.index.getAllLateralPointers()
        for (let i = 0; i < lateralIDs.length; i++) {
            let key = u.keyFromID(lateralIDs[i])
            await this.dynamoClient.delete({
                tableName: this.tableName,
                key: key,
            }).catch((err) => {
                console.log('failure in DBObject.delete, lateral pointers')
                console.error(err)
            })
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
        let deleted = await this.dynamoClient.delete({
            tableName: this.tableName,
            key: this.key,
        }).catch((err) => {
            console.log('failure in DBObject.delete')
            console.error(err)
        })
        return _.has(deleted, 'Attributes')
    }

    // Destroys if not destroyed, returns true to confirm object doesn't exist in db
    async ensureDestroyed() {
        let exists = await this.destroy()
        if (!exists) {
            return true
        } else {
            this.ensureDestroyed()
        }
    }

    async get(path) {
        await this.ensureIndexLoaded()

        // No path == entire object, gotten by a different methodology
        if (!path) {
            let allKeysFlat = await this.getEntireObject()
            return unflatten(allKeysFlat)
        }
        
        // Otherwise use batchGet and pull out path from naturally formatted object
        let data = await this.batchGet(path)
        
        if (path !== '') {
            data = unflatten(data)
            let arrPath = u.stringPathToArrPath(path)
            data = u.getAttribute(data, arrPath)
            return data
        } 
        data = unflatten(data)
        return data
    }
    
    async batchGet(paths) {
        await this.ensureIndexLoaded()
        let data = {}

        // Does this node go further than what we have reference of in the local index?
        if (!paths && this.index.isThisTheBottom()) {paths = this.index.getChildren()}

        if (paths) {
            if (typeof paths === 'string') {
                paths = [paths]
            }
            paths = u.packKeys(paths)
            let pathObj = {}
            
            // Add this path and all its children to an object
            paths.forEach((path) => {
                pathObj[path] = null
                let children = this.index.getChildren(path)
                children.forEach((childPath) => {
                    pathObj[childPath] = null
                })
            })

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
        this._cacheSet(data)
        return u.unpackKeys(data)
    }

    async set(attributes, doNotOverwrite) {
        u.validateKeys(attributes)
        attributes = flatten(attributes)
        u.packKeys(attributes)

        this.index.build(attributes)
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
        let res = this.set({path: obj})
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


    /*  INTERNAL METHODS */

    // Writes given attributes to this specific node, assumes index is prepared
    async _write(attributes, doNotOverwrite) {
        u.startTime('write')
        this.index.subordinate(this.isSubordinate)
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
        }).catch((err) => {
            console.log('failure in DBObject._read')
            console.error(err)
        })
        return data
    }

    // Returns all keys, flat. It is the responsibility of the caller to unflatten
    async getEntireObject() {

        await this.ensureIndexLoaded()

        // Get everything locally available
        let data = await this.batchGet()

        // Get all children. Get data from each and add it
        let children = await this.getChildNodes()
        let childKeys = Object.keys(children)
        for (let i = 0; i < childKeys.length; i++) {
            let childID = childKeys[i]
            let dataFromChild = await children[childID].getEntireObject()
            Object.keys(dataFromChild).forEach((key) => {
                data[key] = dataFromChild[key]
            })
        }

        return u.unpackKeys(data)
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

    _formatAttributes(attributes) {
        let flat = flatten(attributes)
        u.packKeys(flat)
        return flat
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
        this.isSubordinate = this.index.subordinate()
        return
    }

    _getHypotheticalSize(attributes) {

        // marc-look-here
        let hypotheticalIndex = this._getNewIndex(attributes)
        let currentIndexSize = u.getSize(this.index)
        let newIndexSize = u.getSize(hypotheticalIndex)
        return hypotheticalIndex[u.INDEX_KEY][u.SIZE_PREFIX] - currentIndexSize + newIndexSize
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
                
                // Create the new node
                let newNode = new DBObject(newNodeID, {
                    dynamoClient: this.dynamoClient,
                    tableName: this.tableName
                })
                let pathsOnNewNode = Object.keys(attributesForNewNode)
                console.log(pathsOnNewNode)
                await newNode.create(attributesForNewNode, {permissionLevel: this.permissionLevel, isSubordinate: true})
                
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
            }).catch((err) => {
                console.log('failure in DBObject._splitLateral')
                console.error(err)
            })
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
        if (this.isSubordinate) {return}
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

}

module.exports = DBObject