/*
Represents a virtual object in memory, as stored in dynamo. Begins as a single node, splits itself up 
as necessary. Each DBObject in reality represents an individual node, except that top level nodes 
are designated as such upon instantiation, and keep a cache, while child nodes don't.

Structure:
    dbobject = {
        data: {}
        index: {
            s: 42345
            key1Name: {
                s: 425,
                c: [],
                p: '5',
                l: '',
                subKey1Name: {d: null, s: 235}, // null data just means terminal
                subKey2Name: {d: null, s: 190}
            },
            key2Name: {
                subKey1Name: {...},
                subKey2Name: {...}
            },
        }
    }

    // internal_id_of_example_node = {
    //     d: {
    //         key_1: {
    //             d: 'some example data',
    //             c: null,
    //         key_2: {
    //             d: {<multiple keys in here>}
    //             c: [key_1_direct_child_1_id, key_1_direct_child_2_id]
    //         },
    //         key_3: {d: ['these', 'can', 'be', 'arrays', 'too']},
    //         key_4: {d: {another_key: 'or objects'},
    //         key_5: {d: 123456789},
    //         key_6: {d: false}
    //     },
    //     l: id_of_lateral_spillover_node,
    //     c: [id_of_direct_child, another_id_of_direct_child],
    //     p: permission_level_of_this_node
    // }

Public methods:
    - get('path.to.key') - returns data at specified path, omit path to get all, can be array
    - set({
        key: value,
        path.to.deeper.key: anotherValue
    }) 
    - sizeOf()
*/

const flatten = require('flat')
const unflatten = require('flat').unflatten
const _ = require('lodash')

const DynamoClient = require('./DynamoClient')
const u = require('./u')

class DBObject {
    constructor(id, {tableName, dynamoClient}) {
        
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
        this.index = {}
        this.cache = {}
        this.cacheIndex = {}
        this.cacheSize = 0
        this.cachedDirectChildren = {}
        this.indexLoaded = false
        this._resetCachedPointers()
    }

    // Creates a new object in the database
    async create(initialData, params) {
        params = params || {}
        this.isSubordinate = params.isSubordinate || false
        this.permissionLevel = params.permissionLevel || u.DEFAULT_PERMISSION_LEVEL

        if (initialData[u.INDEX_PREFIX]) {
            delete initialData[u.INDEX_PREFIX]
        }
        u.validateKeys(initialData)
        return await this.set(initialData, true)
    }

    async destroy() {

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
        }).catch((err) => {
            console.log('failure in DBObject.delete')
            console.error(err)
        })
        return _.has(data, 'Attributes')
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
        if (!path) {
            let allKeysFlat = await this.getEntireObject()
            return unflatten(allKeysFlat)
        }
        let originalPath = path
        path = u.packKeys(path)
        let paths = [path]
        
        // Get those children present on this object
        let everythingUnderThisPath = u.getChildren(path, this.index)
        everythingUnderThisPath.forEach((path) => {
            paths.push(path)
        })
        
        let data = await this.batchGet(paths)

        // We pull out what we want from a naturally formatted object
        if (originalPath !== '') {
            data = unflatten(data)
            let originalArrPath = u.stringPathToArrPath(originalPath)
            data = u.getAttribute(data, originalArrPath)
            return data
        } 
        data = unflatten(data)
        return data
    }
    
    async batchGet(paths) {

        // If called without paths, will get all the paths in the local index only
        if (!paths) {
            paths = Object.keys(this.index)
            paths.filter((a) => a !== u.INDEX_PREFIX)
        }

        if (typeof paths === 'string') {
            paths = [paths]
        }
        let pathsRemaining = u.packKeys(paths)
        let pathsFound = []

        if (u.flag && !this.isSubordinate) {debugger}
        
        // Get what we can from the cache
        let data = {}
        pathsRemaining.forEach((path) => {
            let fromCache = this._cacheGet(path)
            if (fromCache) {
                data[path] = fromCache
                pathsFound.push(path)
            }
        })
        pathsRemaining = _.difference(pathsRemaining, pathsFound)
        if (!pathsRemaining.length) {
            return u.unpackKeys(data)
        }
        
        // Load index, see where requested properties live
        await this.ensureIndexLoaded()
        
        let childNodes = await this.getChildNodes()
        let pointers = u.getVerticalPointers(this.index)
        
        if (u.flag && !this.isSubordinate) {debugger}

        let gettableFromHere = []
        let addresses = {}
        for (let i = 0; i < pathsRemaining.length; i++) {
            let path = pathsRemaining[i]
            
            // Is the path here?
            if (this.index[path]) {
                gettableFromHere.push(path)
                pathsFound.push(path)
            } 
            
            // MARC RESUME HERE, THURS PM
            // problem is that pointers has k1s3, but path is k3__k1s3

            // If not, does it belong to a child we have record of? 
            // (othwise its a metapath for something we already have)
            else {
                let childNodeID = pointers[path]
                if (childNodeID) {
                    let childNode = childNodes[childNodeID]
                    data[path] = await childNode.get(path)
                    pathsFound.push(path)
                }
            }

        }

        // TODO: lateral reconstruction

        
        // Get what properties live here, return them if that's all
        pathsRemaining = _.difference(pathsRemaining, gettableFromHere)
        if (gettableFromHere.length) {
            let res = await this._read(gettableFromHere)
            Object.keys(res).forEach((key) => {
                data[key] = res[key]
            })
            if (!pathsRemaining.length) {
                return u.unpackKeys(data)
            }
        }

        // Otherwise, get from child nodes
        let children = await this.getChildNodes()
        let childKeys = Object.keys(children)
        for (let i = 0; i < childKeys.length; i++) {
            let childID = childKeys[i]
            let dataFromChild = await children[childID].batchGet(addresses[childID])
            
            console.log(`getting from ${childID}`)
            console.log(Object.keys(dataFromChild))
            
            Object.keys(dataFromChild).forEach((key) => {
                data[key] = dataFromChild[key]
            })
        }
        return u.unpackKeys(data)
    }

    async set(attributes, doNotOverwrite) {        
        u.validateKeys(attributes)
        attributes = flatten(attributes)
        u.packKeys(attributes)

        let newIndex = this._getNewIndex(attributes)
        this._cacheSet(attributes)
        
        // Handle the split
        if (newIndex[u.INDEX_PREFIX][u.GROUP_SIZE_PREFIX] > u.HARD_LIMIT_NODE_SIZE) {
            return await this._handleSplit(attributes, newIndex)
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

    // TODO: overall size option
    size(index) {
        index = index || this.index
        return this.index[u.INDEX_PREFIX][u.GROUP_SIZE_PREFIX]
    }


    /*  INTERNAL METHODS */

    // Writes given attributes to this specific node
    async _write(attributes, doNotOverwrite, newIndex) {
        
        u.startTime('write')
        
        // Get new & updated index, if not already supplied. Add in any cached pointers 
        newIndex = newIndex || this._getNewIndex(attributes)
        this.index = newIndex
        this._setCachedPointers()
        // let indexCopy = u.copy(this.index)

        // if (!this.isSubordinate) {
        //     debugger
        //     console.log('writing index: ')
        //     console.log(indexCopy)
        // }
        // u.cleanIndex(indexCopy)


        attributes[u.INDEX_PREFIX] = u.encode(this.index)
        
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

        Object.keys(this.index).forEach((indexKey) => {
            delete this.index[indexKey][u.DNE_PREFIX]
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

        // if(u.flag) {debugger}

        await this.ensureIndexLoaded()
        
        // Get local data
        let paths = Object.keys(this.index).filter((a) => a !== u.INDEX_PREFIX)
        let data = await this.batchGet(paths)
        
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

    async _getLaterallySplitNode(nodeIDs) {
        debugger

        let keys = []
        nodeIDs.forEach((id) => {
            keys.push(u.keyFromID(id))
        })
        let serialized = ''
        let pieces = await this.dynamoClient.batchGet({
            tableName: this.tableName,
            keys: keys,
            attributes: [u.LARGE_SERIALIZED_PAYLOAD]
        })
        pieces.reverse()
        pieces.forEach((piece) => {
            serialized = serialized.concat(piece[u.LARGE_SERIALIZED_PAYLOAD])
        })
        return u.decode(serialized)
    }

    // Instantiates all child nodes
    async getChildNodes() {
        await this.ensureIndexLoaded()
        let ids = u.getVerticalPointers(this.index, true)
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

 
    // Gets hypothetical index, without setting it
    _getNewIndex(attributes) {
        attributes = attributes || {}
        let originalIndex = u.copy(this.index)
        let index = u.copy(this.index)
        
        let changedKeys = Object.keys(attributes)
        let keysToDelete = []

        // If new attributes have displaced existing attributes, we first remove those from the index
        changedKeys.forEach((attributePath) => {  
            let children = u.getChildren(attributePath, originalIndex)
            children.forEach((childPath) => {
                delete index[childPath]
                keysToDelete.push(childPath)
            })
        })

        // Add new keys to index, write new
        changedKeys.forEach((attributePath) => {
            index[attributePath] = {}
            index[attributePath][u.SIZE_PREFIX] = u.getSize(attributes[attributePath]),
            index[attributePath][u.PERMISSION_PREFIX] = u.DEFAULT_PERMISSION_LEVEL
            index[attributePath][u.DNE_PREFIX] = true   // this one doesn't exist yet
        })

        // Add intermediate nodes
        u.updateIndex(index)

        // Add the new index, with its updated size, to the data to be written
        let objectSize = u.getSizeOfNodeAtPath('', index)
        let indexSize = u.getSize(index)

        index[u.INDEX_PREFIX] = {id: this.id}
        index[u.INDEX_PREFIX][u.LARGE_EXT_PREFIX] = null
        index[u.INDEX_PREFIX][u.GROUP_SIZE_PREFIX] = objectSize + indexSize
        index[u.INDEX_PREFIX][u.PERMISSION_PREFIX] = u.DEFAULT_PERMISSION_LEVEL     // permission todo
        
        return index
    }

    async ensureIndexLoaded(all) {
        try {
            if (!this.indexLoaded) {
                await this.loadIndex(all)
            }

        } catch(err) {debugger}
    }

    async loadIndex(all) {

        // Get this index, directly via dynamoClient
        let index = await this.dynamoClient.get({
            tableName: this.tableName,
            key: this.key,
            attributes: [u.INDEX_PREFIX]
        })
        if (!index) {
            return
        }
        this.index = u.decode(index[u.INDEX_PREFIX])
        this.indexLoaded = true
        
        if (!all) {
            return this.index
        }

        // If we want all indexes, get all pointers, instantiate all objects, add their indices
        let allPointers = u.getVerticalPointers(this.index, true)
        let keys = Object.values(allPointers.vertical)
        let indices = await this.dynamoClient.batchGet({
            tableName: this.tableName,
            keys: keys,
            attributes: [u.INDEX_PREFIX]
        })
        
        indices.forEach((index) => {
            index = u.decode(index[u.INDEX_PREFIX])
            let newNodeID = index[u.INDEX_PREFIX].id
            let dbobj = new DBObject(newNodeID, {
                dynamoClient: this.dynamoClient,
                tableName: this.tableName
            })
            this.cachedDirectChildren[index[u.INDEX_PREFIX].id] = dbobj
        })
    }

    _getHypotheticalSize(attributes) {
        let hypotheticalIndex = this._getNewIndex(attributes)
        let currentIndexSize = u.getSize(this.index)
        let newIndexSize = u.getSize(hypotheticalIndex)
        return hypotheticalIndex[u.INDEX_PREFIX][u.SIZE_PREFIX] - currentIndexSize + newIndexSize
    }


    /*
    Scenarios:
    - lots of little stuff
    - one massive incoming piece
    - one massive incoming blob
    - mismatched things, some bigger 
    */
   async _handleSplit(newAttributes, newIndex) {

    // First, deal with anything that requires lateral splitting
    let indexKeys = Object.keys(newIndex)
    for (let i = 0; i < indexKeys.length; i++) {
        let path = indexKeys[i]
        if (newIndex[path][u.SIZE_PREFIX] > u.HARD_LIMIT_NODE_SIZE) {
            let value = u.getAttribute(newAttributes, u.stringPathToArrPath(path))
            let latExIDs = await this._splitLateral(value)
            this._cacheLateralPointerArray(path, latExIDs, newIndex[path][u.SIZE_PREFIX])
            delete newIndex[path]
            delete newAttributes[path]
        }
    }
    
    let getAmountOver = () => {
        let overBy = u.getSizeOfNodeAtPath('', newIndex) - u.MAX_NODE_SIZE
        if (overBy > 0) {
            return overBy
        }
        return 0
    }

    // Lifts off as large a single vertical chunk as possible
    let pullOffNextBestNode = async () => {
        let newNodeID = u.generateNewID()
        let overBy = getAmountOver()

        // Get data on intermediate groupings
        let intermediatePaths = u.getIntermediatePaths(newIndex)
        let candidates = {}
        intermediatePaths.forEach((path) => {
            let order = u.stringPathToArrPath(path).length
            let size = newIndex[path][u.GROUP_SIZE_PREFIX]
            let dne = newIndex[path][u.DNE_PREFIX]
            candidates[order] = candidates[order] || []
            candidates[order].push({path, size, order, dne, children: u.getChildren(path, newIndex)})
        })
        
        // Look for the largest groups that can be split off intact
        // NOTE: for now, only moving attributes not yet written
        let newNodeSizeLeft = u.MAX_NODE_SIZE
        let newNodeAttributes = {}
        for (let depth = 0; depth < u.MAX_NESTING_DEPTH; depth++) {
            if (candidates[depth]) {
                candidates[depth].sort((a, b) => (a.size < b.size))
                candidates[depth].forEach((candidate) => {
                    if ((candidate.size < newNodeSizeLeft) && candidate.DNE) {
                        
                        // Migrate each child
                        candidate.children.forEach((childPath) => {
                            newNodeAttributes[childPath] = newAttributes[childPath]
                            delete newAttributes[childPath]
                            delete newIndex[childPath]
                            this._cacheVerticalPointer(childPath, newNodeID)
                        })
                        delete newIndex[candidate.path]
                        newNodeSizeLeft -= candidate.size
                        overBy -= candidate.size
                    }
                })
                
            }
        }

        // If we're still over, add new attributes one by one
        if (overBy > 0) {
            Object.keys(newAttributes).forEach((attributePath) => {
                if (newIndex[attributePath][u.SIZE_PREFIX] < newNodeSizeLeft) {
                    let value = newAttributes[attributePath]
                    let size = newIndex[attributePath][u.SIZE_PREFIX]
                    newNodeAttributes[attributePath] = value
                    delete newIndex[attributePath]
                    delete newAttributes[attributePath]
                    u.updateIndex(newIndex)
                    overBy -= size
                    newNodeSizeLeft -= size
                    this._cacheVerticalPointer(attributePath, newNodeID)
                }
            })
        }

        // Create the new node
        let newNode = await this._splitVertical(newNodeID, newNodeAttributes)

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
    async _splitVertical(newNodeID, attributes) {
        let childNode = new DBObject(newNodeID, {
            dynamoClient: this.dynamoClient,
            tableName: this.tableName
        })
        await childNode.create(attributes, {permissionLevel: this.permissionLevel, isSubordinate: true})
        return childNode
    }

    // Given an oversize load, returns ordered array of IDs of all the children splitting it up
    async _splitLateral(payload) {
        let childIDs = []
        let encoded = u.encode(payload)
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
            await siblingNode.create(attributes, {permissionLevel: this.permissionLevel, isSubordinate: true})
            childIDs.push(siblingNode.id)
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
            let setSuccessfully = setIfFits(path, attributes[path])
            if (!setSuccessfully) {
                clearSpace(u.getSize(attributes.path))
                setIfFits(path, attributes[path])
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
            let basePath = u.INDEX_PREFIX
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