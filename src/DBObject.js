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
        this._resetCachedPointers()
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
        this.ensureIndexLoaded()

        // Wipe any lateral nodes
        let lateral = u.getLateralPointers(this.index, true)
        let keys = []
        lateral.forEach((id) => {
            keys.push(u.keyFromID(id))
        })
        for (let i = 0; i < keys.length; i++) {
            let key = keys[i]
            await this.dynamoClient.delete({
                tableName: this.tableName,
                key: key,
            }).catch((err) => {
                console.log('failure in DBObject.delete')
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
            try {

                let allKeysFlat = await this.getEntireObject()
                return unflatten(allKeysFlat)
            }catch(err){debugger}
        }
        
        let data = await this.batchGet(path)
        debugger
        
        // We pull out what we want from a naturally formatted object
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
        let data
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

            // Find out on which node of the object (here, direct child, or indirect child) each path is located. 
            let pathsByChild = {}
            let specialCases = []
            Object.keys(pathObj).forEach((path) => {

                let childID = this.index.getIDForPath(path)
                if (childID) {
                    if (!pathsByChild[childID]) {pathsByChild[childID] = []}
                    pathsByChild[childID].push(path)
                } else {
                    specialCases.push(paths)
                }
            })
            
            // Get locally available paths
            let localPaths = pathsByChild[this.id]
            if (localPaths) {
                delete pathsByChild[this.id]
                data = await this._read(localPaths)
            } else {
                data = {}
            }
            
            // If we have outstanding paths to find, instantiate children and use their batchGet
            let childDBObjectNodes = await this.getChildNodes()
            let childObjectKeys = Object.keys(childDBObjectNodes)
            for (let i = 0; i < childObjectKeys.length; i++) {
                let childKey = childObjectKeys[i]
                let childNode = childDBObjectNodes[childKey]
                if (pathsByChild[childNode.id]) {
                    let pathsOnChild = pathsByChild[childNode.id]
                    let dataFromChild = await childNode.batchGet(pathsOnChild)
                    data = _.assign({}, data, dataFromChild)
                }
                delete pathsByChild[childNode.id]
            }

            // TODO: lateral
            if (specialCases.length) {
                debugger
            }
        } 
        
        // If no paths, just don't pass attributes to dynamo
        else {
            data = await this._read()
            
            // Clean up extra metadata
            delete data.uid
            delete data.ts
            delete data[u.INDEX_KEY]
        }
            
        // Cache and return
        this._cacheSet(data)
        return u.unpackKeys(data)
            
            
            
            
            
            
            


        // let pathsRemaining = u.packKeys(paths)
        // let pathsFound = []
        
        // // Get what we can from the cache
        // let data = {}
        // pathsRemaining.forEach((path) => {
        //     let fromCache = this._cacheGet(path)
        //     if (fromCache) {
        //         data[path] = fromCache
        //         pathsFound.push(path)
        //     }
        // })
        // pathsRemaining = _.difference(pathsRemaining, pathsFound)
        // if (!pathsRemaining.length) {
        //     this._cacheSet(data)
        //     return u.unpackKeys(data)
        // }
        
        // // Load index, see where requested properties live
        // await this.ensureIndexLoaded()
        
        // let childNodes = await this.getChildNodes()
        // let pointers = u.getVerticalPointers(this.index)

        // let gettableFromHere = []
        // let addresses = {}
        // for (let i = 0; i < pathsRemaining.length; i++) {
        //     let path = pathsRemaining[i]
            
        //     // Is the path here?
        //     if (this.index[path] && !this.index[path][u.LARGE_EXT_PREFIX]) {
        //         gettableFromHere.push(path)
        //         pathsFound.push(path)
        //     } 
            
        //     // Pointers to large things
        //     else if (this.index[path] && this.index[path][u.LARGE_EXT_PREFIX]) {
        //         let lateralPayloadNodes = await this.index[path][u.LARGE_EXT_PREFIX]
        //         data[path] = await this._getLaterallySplitNode(lateralPayloadNodes)
        //         pathsFound.push(path)
        //     }
            
        //     // If not, does it belong to a child we have record of? 
        //     // (othwise its a metapath for something we already have)
        //     else {
        //         let childNodeID = pointers[path]
        //         if (childNodeID) {
        //             let childNode = childNodes[childNodeID]
        //             data[path] = await childNode.get(path)
        //             pathsFound.push(path)
        //         }
        //     }
        // }
        
        // // Get what properties live here, return them if that's all
        // pathsRemaining = _.difference(pathsRemaining, gettableFromHere)
        // if (gettableFromHere.length) {
        //     let res = await this._read(gettableFromHere)
        //     Object.keys(res).forEach((key) => {
        //         data[key] = res[key]
        //     })
        //     if (!pathsRemaining.length) {
        //         this._cacheSet(data)
        //         return u.unpackKeys(data)
        //     }
        // }

        // // Otherwise, get from child nodes
        // let children = await this.getChildNodes()
        // let childKeys = Object.keys(children)
        // for (let i = 0; i < childKeys.length; i++) {
        //     let childID = childKeys[i]
        //     let dataFromChild = await children[childID].batchGet(addresses[childID])
        //     Object.keys(dataFromChild).forEach((key) => {
        //         data[key] = dataFromChild[key]
        //     })
        // }
        // this._cacheSet(data)
        // return u.unpackKeys(data)
    }

    async set(attributes, doNotOverwrite) {        
        u.validateKeys(attributes)
        attributes = flatten(attributes)
        u.packKeys(attributes)

        this.index.build(attributes)
        
        this._cacheSet(attributes)
        
        // If oversize, split, otherwise write
        if (this.index.isOversize()) {
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

    // Writes given attributes to this specific node
    async _write(attributes, doNotOverwrite) {
        
        u.startTime('write')

        let writableIndexObject = this.index.write()
        attributes[u.INDEX_KEY] = u.encode(writableIndexObject)
        
        // Write to dynamo
        let data = await this.dynamoClient.update({
            tableName: this.tableName,
            key: this.key,
            attributes: attributes,
            doNotOverwrite: doNotOverwrite
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

        // let paths = Object.keys(this.index).filter((a) => a !== u.INDEX_KEY)
        
        // Get all children. Get data from each and add it
        // let children = await this.getChildNodes()

        // let childKeys = Object.keys(children)
        // for (let i = 0; i < childKeys.length; i++) {
        //     let childID = childKeys[i]
        //     let dataFromChild = await children[childID].getEntireObject()
        //     Object.keys(dataFromChild).forEach((key) => {
        //         data[key] = dataFromChild[key]
        //     })
        // }

        // return u.unpackKeys(data)
    }

    async _getLaterallySplitNode(nodeIDs) {
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

    async ensureIndexLoaded(all) {
        try {
            if (!this.index.isLoaded()) {
                await this.loadIndex()
            }

        } catch(err) {debugger}
    }

    async loadIndex(all) {
        let indexData = await this.dynamoClient.get({
            tableName: this.tableName,
            key: this.key,
            attributes: [u.INDEX_KEY]
        })
        if (!indexData) {
            return
        }
        let decodedIndexData = u.decode(indexData[u.INDEX_KEY])
        this.index.loadData(decodedIndexData)
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
        
    // First, deal with anything that requires lateral splitting
    let keysRequiringLateralSplitting = this.index.getOversizeNodes()
    for (let i = 0; i < keysRequiringLateralSplitting.length; i++) {
        let path = keysRequiringLateralSplitting[i]
        let attributeValue = newAttributes[path]
        let latExIDs = await this._splitLateral(attributeValue)
        this.index.setLateralExt(path, latExIDs)
        debugger
    }
    
    let getAmountOver = () => {
        let overBy = this.index.getSize() - u.MAX_NODE_SIZE
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
        if (overBy > 0) {
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

    // Write the remaining new attributes
    await this.set(newAttributes)
}

    // Given appropriately sized chunk of attributes, returns index of new node
    // async _splitVertical(newNodeID, attributes) {
    //     let childNode = new DBObject(newNodeID, {
    //         dynamoClient: this.dynamoClient,
    //         tableName: this.tableName
    //     })
    //     await childNode.create(attributes, {permissionLevel: this.permissionLevel, isSubordinate: true})
    //     return childNode
    // }

    // Given an oversize load, returns ordered array of IDs of all the children splitting it up
    async _splitLateral(payload) {
        let childIDs = []
        let encoded = u.encode(payload)
        
        let index = 0
        while (encoded.length) {
            let encodedAttribute = encoded.slice(0, u.MAX_NODE_SIZE)
            encoded = encoded.slice(u.MAX_NODE_SIZE)
            let newNodeID = u.generateNewID()
            let siblingNode = new DBObject(newNodeID, {
                dynamoClient: this.dynamoClient,
                tableName: this.tableName
            })

            let attributes = {}
            attributes[u.LARGE_SERIALIZED_PAYLOAD] = encodedAttribute
            attributes[u.LARGE_EXT_INDEX] = index

            await siblingNode.create(attributes, {permissionLevel: this.permissionLevel, isSubordinate: true})
            childIDs.push(siblingNode.id)
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

    // Pointers are generated before the index is refreshed, and thus need to be cached
    _cacheVerticalPointer(pathOfAttributeMoving, pointer) {
        this.cachedPointers.vertical[pathOfAttributeMoving] = pointer
    }

    _cacheLateralPointerArray(pathOfAttributeMoving, pointerArray, size) {
        this.cachedPointers.lateral[pathOfAttributeMoving] = {pointers: pointerArray, size}
    }

    _setCachedPointers() {
        Object.keys(this.cachedPointers.vertical).forEach((path) => {
            let pointer = this.cachedPointers.vertical[path]
            let arrPath = u.stringPathToArrPath(path)
            let childKey = arrPath.pop()
            let basePath = u.INDEX_KEY
            if (arrPath.length) {
                let parentNodePath = u.arrayPathToStringPath(arrPath, true)
                basePath = parentNodePath
            }
            
            // Note on the parent node that this node has children at address
            this.index[basePath] = this.index[basePath] || {}
            this.index[basePath][u.EXT_PREFIX] = pointer

            // Note specifically which children
            this.index[basePath][u.EXT_CHILDREN_PREFIX] = this.index[basePath][u.EXT_CHILDREN_PREFIX] || {}
            // this.index[basePath][u.EXT_CHILDREN_PREFIX][childKey] = pointer
            this.index[basePath][u.EXT_CHILDREN_PREFIX][path] = pointer
        })
        Object.keys(this.cachedPointers.lateral).forEach((path) => {
            let pointerObject = this.cachedPointers.lateral[path]
            this.index[path] = {}
            this.index[path][u.LARGE_EXT_PREFIX] = pointerObject.pointers
        })
        this._resetCachedPointers()
    }

    _resetCachedPointers() {
        this.cachedPointers = {lateral: {}, vertical: {}}
    }

    _getPointers() {
        return u.getPointers(this.index)
    }
















    




    /*  **************************************************    */








    // key() {
    //     return this.Key
    // }

    // // Loads and caches entire object from DB for subsequent retrieval
    // async ensure_loaded() {
    //     if (this.data) {
    //         return this.data
    //     }
    //     let get_params = {
    //         table_name: this.TableName,
    //         key: this.Key
    //     }
    //     this.data = await db.get_item(get_params)
    // }

    // // Updates specified params or else the entire object
    // async update(params_to_update) {
        
    //     // If specific params not specified, upload everything
    //     if (!params_to_update) {
    //         params_to_update = this.data
    //     }
        
    //     let set_params = {
    //         table_name: this.TableName,
    //         key: this.Key,
    //         attributes: params_to_update
    //     }
    //     let returned_data = await db.update_item(set_params)
        
    //     // Set this.data either in entirety or only the modified params only
    //     if (!this.data) {
    //         this.data = returned_data
    //     } else {
    //         Object.keys(returned_data).forEach((key) => {
    //             this.data[key] = returned_data[key]
    //         })
    //     }
    //     return this.data
    // }
    

    // async get(key) {
    //     if (this.Key[key]) {
    //         return this.Key[key]
    //     }

    //     let is_secret = this.is_key_secret(key)
    //     await this.ensure_current_user_can_view(is_secret)
    //     await this.ensure_loaded(key)
    //     return data[key]
    // }

    // // Designate keys as secret in config. For now, we're putting everything secret in "secret"
    // async set(key, value) {
    //     if (this.Key[key]) {
    //         throw new Error('This key cannot be set')
    //     }
        
    //     let is_secret = this.is_key_secret(key)
    //     await this.ensure_current_user_can_edit(is_secret)
    //     let key_value_pair = {}
    //     key_value_pair[key] = value
    //     await this.update(key_value_pair)
    //     return this.data[key]
    // }

    // async raw() {
    //     await this.ensure_loaded()

    //     // Returns those keys in data permitted by user's permission level
    //     let get_all_allowed_data = () => {

    //         if (this.current_user_can_view(true)) {
    //             return this.data
    //         } else if (this.current_user_can_view()) {
    //             let permitted_data = u.filter_object(this.data, (key) => {
    //                 return !this.is_key_secret(key)
    //             })
    //             return permitted_data 
    //         }
    //     }
    //     let data = get_all_allowed_data()
    //     return data
    // }



    // // Secret params are designated in config
    // is_key_secret(key) {
    //     return key.includes(config.SECRET_KEY_SUFFIX)
    // }

    // /*
    // PERMISSION METHODS
    // ensure_can_view and ensure_can_edit are superclassed for specific restriction
    // */
    
    // // Throws an error if the current user cannot view this object
    // async ensure_current_user_can_view(sensitive) {
    //     if (!this.current_user_can_view(sensitive)) {
    //         this.throw_unauthorized_error()
    //     }
    // }
    
    // async ensure_current_user_can_edit(sensitive) {
    //     if (!this.current_user_can_edit(sensitive)) {
    //         this.throw_unauthorized_error()
    //     }
    // }

    // async current_user_can_view(sensitive) {
    //     return true
    // }
    
    // async current_user_can_edit(sensitive) {
    //     return true
    // }

    // throw_unauthorized_error() {
    //     throw new Error('Current user does not have required permissions')
    // }
}

module.exports = DBObject