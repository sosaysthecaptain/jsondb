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

const DynamoClient = require('./DynamoClient')
const u = require('./u')

class DBObject {

    /* 
    Four options:
        - creating a new DBObject: {id:'someUser@gmail.com', isTopLevel: true, isNew: true}
        - instantiating an existing DBObject: {id:'someUser@gmail.com', isTopLevel: true}
        - creating a new sub-node: {id:'ad3453jskfheh5k4-5345345353', isNew: true}
        - instantiating an existing sub-node: {id:'ad3453jskfheh5k4-5345345353'}
    
    Note that id must always be specified from the outside
    */
    constructor({id, tableName, dynamoClient, isTopLevel, isNew, isLateral, permissionLevel, maximumCacheSize}) {
        this.id = id,
        this.dynamoClient = dynamoClient,
        this.tableName = tableName
        this.key = {
            uid: id.split('-')[0],
            ts: id.split('-')[1] || 0
        },
        this.permissionLevel = permissionLevel || u.DEFAULT_PERMISSION_LEVEL
        this.maximumCacheSize = maximumCacheSize || u.MAXIMUM_CACHE_SIZE
        this.isTopLevel = isTopLevel
        this.isLateral = isLateral
        
        // We either have our index or else know that we don't exist yet
        this.exists = !isNew
        this.index = index || {}
        this.cachedIndices = {}
        
        // If this is the top level, we keep a cache, otherwise we leave caching to the top level and only
        this.cache = {}

    }

    // Creates a new object in the database
    async create(initialData) {
        u.validateKeys(initialData)
        let data = await this.set(initialData, true)
        // let data = await this._write(initialData, true)
        
        // this.size = formattedContent.s
        this.exists = true
        return data
    }
    
    async get(paths) {
        if (typeof paths === 'string') {
            paths = [paths]
        }

    }

    async set(attributes, doNotOverwrite) {        
        u.validateKeys(attributes)
        let newIndex = this._getNewIndex(attributes)
        

        attributes = flatten(attributes)
        
        // Handle the split
        if (newIndex.i.s > u.MAX_NODE_SIZE) {
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


    /*  INTERNAL METHODS */

    // Writes given attributes to this specific node
    async _write(attributes, doNotOverwrite, newIndex) {
        this._convertAttributesToExistingPaths(attributes)
        
        // Get new & updated index, if not already supplied
        newIndex = newIndex || this._getNewIndex(attributes)
        this.index = newIndex
        attributes[u.INDEX_PREFIX] = u.packIndex(newIndex)
        
        // Write to dynamo
        let data = await this.dynamoClient.update({
            tableName: this.tableName,
            key: this.key,
            attributes: attributes,
            doNotOverwrite: doNotOverwrite
        }).catch((err) => {
            debugger
            console.log('failure in DBObject._write')
            console.error(err)
        })

        Object.keys(this.index).forEach((indexKey) => {
            this.index[indexKey][u.EXISTS_PREFIX = true]
        })

        debugger
        return data
    }
 
    // Gets hypothetical index, without setting it
    _getNewIndex(attributes) {
        attributes = attributes || {}
        let originalIndex = flatten(this.index)
        let index = u.copy(originalIndex)
        let flatAttributes = flatten(attributes)
        let changedKeys = Object.keys(flatAttributes)
        let deleted = []

        // If new attributes have displaced existing attributes, we first remove those from the index
        changedKeys.forEach((attributePath) => {  
            let children = u.getChildren(attributePath, originalIndex)
            children.forEach((childPath) => {
                delete index[childPath]
                deleted.push(childPath)
            })
        })

        // Add new keys to index, write new
        changedKeys.forEach((attributePath) => {
            index[attributePath] = {}
            index[attributePath][u.SIZE_PREFIX] = u.getSize(flatAttributes[attributePath]),
            index[attributePath][u.PERMISSION_PREFIX] = u.DEFAULT_PERMISSION_LEVEL
            index[attributePath][u.CHILDREN_PREFIX] = null
            index[attributePath][u.EXISTS_PREFIX] = null
        })

        // Add the new index, with its updated size, to the data to be written
        let objectSize = u.getSizeOfNodeAtPath('', index)
        let indexSize = u.getSize(index)

        index[u.INDEX_PREFIX] = {id: this.id}
        index[u.INDEX_PREFIX].isLateral = isNew, isLateral              // true if it is itself lateral
        index[u.INDEX_PREFIX][u.LATERAL_PREFIX] = null
        index[u.INDEX_PREFIX][u.SIZE_PREFIX] = objectSize + indexSize

        return index
    }

    async _loadIndex() {
        let packedIndex = await this.get(u.INDEX_PREFIX)
        this.index = u.unpackIndex(packedIndex)
    }

    _getHypotheticalSize(attributes) {
        let hypotheticalIndex = this._getNewIndex(attributes)
        let currentIndexSize = u.getSize(this.index)
        let newIndexSize = u.getSize(hypotheticalIndex)
        return hypotheticalIndex[u.INDEX_PREFIX][u.SIZE_PREFIX] - currentIndexSize + newIndexSize
    }

    // If attribute has a parent and that parent doesn,t exist, reformat as: 
    // keyThatExists.firstNew = {firstThatDoesnt:{secondThatDoesnt:{deeplyNestedThing: 'value'}}}
    _convertAttributesToExistingPaths(attributes) {
        
        // A path is invalid if it has no parent in either the index or the other attributes
        let isPathInvalid = (path) => {
            let parentPath = u.stringPathToArrPath(path)
            parentPath.pop()

            // We assume the index to be valid, so if parent key is in index, we're fine
            if (u.pathExists(parentPath, this.index)) {
                return false
            } else if (u.pathExists(parentPath, attributes)) {
                return false
            }
            return true
        }

        // 'one.two.three': 'and four' -> one:{two:{three:'and four'}}
        let reformatAttribute = (oldKey) => {

            // Find the closest parent
            let value = attributes[oldKey]
            let arrPath = u.stringPathToArrPath(oldKey)
            let closestParent = u.findLowestLevelDNE(arrPath, this.index)
            let candidate2 = u.findLowestLevelDNE(arrPath, attributes)
            if (candidate2.length > closestParent.length) {
                closestParent = candidate2
            }

            // Create a new key and value based on this new parent
            let newKey = u.arrayPathToStringPath(closestParent)
            let pathOnTopOfParent = oldKey.slice(newKey.length + 1)
            let newFlatAttribute = {}
            newFlatAttribute[pathOnTopOfParent] = value
            let newValue = unflatten(newFlatAttribute)
            
            // Replace
            delete attributes[oldKey]
            attributes[newKey] = newValue
        }

        // If path is invalid, restructure this attribute to build out objects under it
        let flatAttributes = flatten(attributes)
        Object.keys(flatAttributes).forEach((attributePath) => {
            if (isPathInvalid(attributePath)) {
                reformatAttribute(attributePath)
            }
        })
    }


    /*
    Scenarios:
    - lots of little stuff
    - one massive incoming piece
    - one massive incoming blob
    - mismatched things, some bigger 
    */
    async _handleSplit(newAttributes, newIndex) {
        delete newIndex[u.INDEX_PREFIX]

        // First, deal with anything that requires lateral splitting
        Object.keys(newIndex).forEach((path) => {

            if (newIndex[path][u.SIZE_PREFIX] > u.HARD_LIMIT_NODE_SIZE) {
                let value = u.getAttribute(newAttributes, u.stringPathToArrPath(path))
                newIndex[path][u.CHILDREN_PREFIX] = await this._splitLateral(value)
                newIndex[key][u.SIZE_PREFIX] = 0
                delete newAttributes[key]
            }
        })
        
        let fits = () => {return u.getSizeOfNodeAtPath('', newIndex) < u.MAX_NODE_SIZE}
        
        // Naively adds next fitting key
        let getNextBestNode = () => {
            let newNode = {}
            newNode[u.INDEX_PREFIX] = {id: u.generateNewID()}
            let addAttributesUntilFull = () => {
                let getNextBestKey = (spaceLeft) => {
                    let keys = Object.keys(newIndex)
                    for (let i = 0; i < keys.length; i++) {
                        let key = keys[i]
                        if (!newIndex[key][u.CHILDREN_PREFIX]) {
                            let value = newAttributes[key]
                            let size = u.getSize(value)
                            if (size < spaceLeft) {
                                return key
                            }
                        }
                    }
                }
                let spaceLeft = u.MAX_NODE_SIZE - u.getSize(newNode) 
                let key = getNextBestKey(spaceLeft)
                
                // When we have the next key, strike from newAttributes, add to newNode, set the index to the pointer
                if (key) {
                    let value = newAttributes[key]
                    
                    // TODO: delete existing
                    delete newAttributes[key]
                    
                    newNode[key] = value
                    newIndex[key][u.CHILDREN_PREFIX] = newNode[u.INDEX_PREFIX].id
                    newIndex[key][u.SIZE_PREFIX] = 0
                    addAttributesUntilFull()
                }
            }
            addAttributesUntilFull()
            newNode = unflatten(newNode)
            return newNode
        }

        // Until current node has been depopulated sufficiently to fit, split off new nodes
        while (!fits()) {
            let newNode = getNextBestNode()
            let newNodeIndex = await this._splitVertical(newNode[u.INDEX_PREFIX].id, newNode)
            let newNodeID = newNodeIndex[u.INDEX_PREFIX].id
            this.cachedIndices[newNodeID] = newNodeIndex
        }
        await this.set(newAttributes)
    }

    // Given appropriately sized chunk of attributes, returns index of new node
    async _splitVertical(attributes) {
        let newNodeID = u.generateNewID()
        let childNode = new DBObject({
            id: newNodeID, 
            isNew: true,
            isTopLevel: false,
            isLateral: false
        })
        await childNode.create(attributes)
        return childNode.index
    }

    // Given an oversize load, returns ordered array of IDs of all the children splitting it up
    async _splitLateral(payload) {

        debugger
        let childIDs = []
        let buffer = new Buffer.from(payload)
        while (buffer) {
            let bufferAttribute = buffer.slice(0, u.MAX_NODE_SIZE)
            let buffer = buffer.slice(u.MAX_NODE_SIZE)
            let newNodeID = u.generateNewID()
            let siblingNode = new DBObject({
                id: newNodeID, 
                isNew: true,
                isTopLevel: false,
                isLateral: true
            })
            
            await siblingNode.create({
                buffer: bufferAttribute
            })
            childIDs.push(siblingNode.index.id)
        }
        return childIDs
    }

  
    // IMPLEMENT ME
    _cache(attributes) {
        let currentCacheSize = this._cacheSize()

        Object.keys(attributes).forEach((attributeKey) => {
            let size = u.getSize(attributes[attributeKey])
            if ((currentCacheSize + size) < this.maximumCacheSize) {
                this.cache[attributeKey] = attributes[attributeKey]
            }
            currentCacheSize += size
        })

        // TODO: priority and booting mechanism

    }

    _cacheSize() {
        return u.getSize(this._cache)
    }

    _cacheGet(path) {
        if (this.cache[path]) {
            return this.cache[path]
        }
        return undefined
    }















    

    
/* MINOR GETTERS */
    exists() {
        return this.exists
    }
    
    size() {
        return this.index[u.INDEX_PREFIX][u.SIZE_PREFIX]
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