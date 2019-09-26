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

const dynoItemSize = require('dyno-item-size')
const flatten = require('flat')
const unflatten = require('flat').unflatten

const DynamoClient = require('./DynamoClient')
const u = require('./u')

const HARD_LIMIT_NODE_SIZE = 400 * 1024 * 1024
const MAX_NODE_SIZE = 300 * 1024 * 1024
const IDEAL_NODE_SIZE = 200 * 1024 * 1024

class DBObject {

    // A DBObject must be instantiated with ID. Size is tracked and determined by dead reckoning
    constructor({id, tableName, dynamoClient, permissionLevel, maximumCacheSize, isTopLevel, doesNotExistYet, index}) {
        this.id = id,
        this.dynamoClient = dynamoClient,
        this.tableName = tableName
        this.key = {
            uid: id.split('-')[0],
            ts: id.split('-')[1] || 0
        },
        this.permissionLevel = permissionLevel
        this.maximumCacheSize = maximumCacheSize || 50 * 1024 * 1024
        this.isTopLevel = isTopLevel
        
        // We either have our index or else know that we don't exist yet
        this.exists = !doesNotExistYet
        this.index = index || {s: 0, p: 0}
        
        // If this is the top level, we keep a cache, otherwise we leave caching to the top level and only
        this.cache = {}

    }

    // Creates a new object in the database
    async create(initialData) {

        this._write(initialData)
        
        // this.size = formattedContent.s
        this.exists = true
    }
    
    async get(path) {

    }

    async set() {

    }

    async modify() {

    }

    /*  INTERNAL METHODS */

    // Writes given attributes to this specific node
    async _write(attributes) {
        let originalIndex = flatten(this.index)
        let index = u.copy(originalIndex)
        attributes = flatten(attributes)
        let changedKeys = Object.keys(attributes)

        // REMOVE THIS
        originalIndex = {
            'key1.subkey1.first': 'getting deleted',
            'key1.subkey1.second': 'also getting deleted',
            'key43': 'surviving'
        }
        index = u.copy(originalIndex)

        // If new attributes have displaced existing attributes, we first remove those from the index
        changedKeys.forEach((attributePath) => {  
            let children = u.getChildren(attributePath, originalIndex)
            children.forEach((childPath) => {
                delete index[childPath]
            })
        })

        // Add new keys to index, write new
        changedKeys.forEach((attributePath) => {
            // index[attributePath + '.d'] = 'terminal'
            index[attributePath + '.d'] = true
            index[attributePath + '.p'] = 0
            index[attributePath + '.s'] = u.getSize(attributes[attributePath])
        })

        // Add the new index, with its updated size, to the data to be written
        this.index = unflatten(index)
        this.index.s = u.getSizeOfNodeAtPath('', index)
        this.index.s += u.getSize(this.index)
        attributes['i'] = this.index
        
        // Write to dynamo
        let data = await this.dynamoClient.update({
            tableName: this.tableName,
            key: this.key,
            attributes: attributes,
            doNotOverwrite: false
        }).catch((err) => {
            console.log('failure in DBObject._write')
            console.error(err)
        })

        debugger
        // RESUME: done, except ValidationException: The document path provided in the update expression is invalid for update
        return data

    }















    
    /* 
    Updates this.index and returns the passed attributes as updated with necessary changes to the index

    propertiesToUpdate = {
        key1: 'value1',
        key2.subkey3.subsubkey2: 'value at this path',
        key6: {
            subkey1: {},
            subkey2: {}
        }
    }
    */  
    async _writeOLD(attributes, pathToTop) {
        
        // Reset local cache of changes to the index
        this.currentWriteIndexChanges = {}

        let recursiveUpdateIndexForProperty = (obj, pathToTop) => {
            pathToTop = pathToTop || []        
            if (obj && typeof obj === 'object') {
                let allKeys = Object.keys(obj)
                for(let i = 0; i < allKeys.length; i++) {
                    let key = allKeys[i]
                    let value = obj[key]
                    let childPathToTop = u.copy(pathToTop)
                    childPathToTop.push(key)

                    // Build index object for this node, updating this DBObject's cached index
                    this._buildIndexEntryForNode(value, childPathToTop)
                    
                    // Walk children
                    recursiveUpdateIndexForProperty(value, childPathToTop)
                }
            }
        }

        // Make a record of the original index
        let originalIndex = u.copy(this.index)

        // 


        // After copying the original index, build out the new index structure
        recursiveUpdateIndexForProperty(attributes)

        // Make sure each node's size index accurately represents the sum of all its subkeys' sizes
        attributes = flatten(attributes)
        this._updateIndex(attributes)
        
        
        // attributes now contains index updates as well as original data to be written. Do the write.
        console.log('\n\nreached end of experiment')
        debugger
        
        console.log('\n')
        console.log(this.index)
        return

        let data = await this.dynamoClient.update({
            tableName: this.tableName,
            key: this.key,
            attributes: attributes,
            doNotOverwrite: doNotOverwrite
        }).catch((err) => {
            console.log('failure in DBObject._write')
            console.error(err)
        })
    }

    // Every terminal object has its own entry
    _buildIndexEntryForNode(value, pathToTop) {
        let originalPathToTop = u.copy(pathToTop)

        // If a node doesn't exist at the path, adds it and calls self again for the next level up
        let recursiveFillNodes = (path) => {
            
            // Fill up from the bottom, finding the next level on the way that doesn't exist.
            let nextPathThatDoesntExist = u.findLowestLevelDNE(path, this.index)
            u.setAttribute({
                obj: this.index, 
                path: nextPathThatDoesntExist, 
                value: {},
            })
            let propertiesPath = u.copy(nextPathThatDoesntExist)
            propertiesPath.push('p')
            u.setAttribute({
                obj: this.index, 
                path: propertiesPath,
                value: 0,                                   // marc-todo
            })
            let sizePath = u.copy(nextPathThatDoesntExist)
            sizePath.push('s')
            u.setAttribute({
                obj: this.index, 
                path: sizePath, 
                // value: u.getSize(value),
                value: 0,
            })
            
            // If the current level exists, we're done, otherwise do it again
            if (u.pathExists(originalPathToTop, this.index)) {
                return
            }
            recursiveFillNodes(path)   
        }

        // Fill in any nodes that don't exist yet under this one
        recursiveFillNodes(pathToTop)
    }

    // // Updates existing index with size of new attributes
    // _updateSizeIndices(attributes) {
        
    //     // Add sizes of all the child nodes, set it as the size of this node
    //     let updateAllParents = (path) => {

    //         let correctSizeOfNode = (path) => {
                
                
    //             let arrPath = u.stringPathToArrPath(path)
    //             let indexNode = u.getAttribute(this.index, arrPath)
    //             let sizesOfChildren = []
    //             Object.keys(indexNode).forEach((key) => {

    //                 if (u.validateKey(key)) {
    //                     if (indexNode[key] && indexNode[key].s) {
    //                         sizesOfChildren.push(indexNode[key].s)
    //                     }
    //                 }
    //             })
    //             arrPath.push('s')

                
    //             let size = 0
    //             sizesOfChildren.forEach((childSize) => {
    //                 size += (childSize || 0)
    //             })
                
                
                
                
    //             // resume here
                
    //             let existingSize = u.getAttribute(arrPath)  || 0
    //             console.log('correcting size of ' + path + `to ${existingSize} + ${size} = ${existingSize + size}`)
    //             size = size + existingSize
    //             u.setAttribute({
    //                 obj: this.index,
    //                 path: arrPath,
    //                 value: size
    //             })
    //             if (path === '.s') {
    //                 console.log('setting top level size to ' + size)
                    
    //             }
    //         }
    //         correctSizeOfNode(path)
            
    //         // Only stop once we've already run with empty path
    //         if (path === '') {
    //             return
    //         } else {
    //             path = path.split('.').slice(0, -1).join('.')
    //             updateAllParents(path)
    //         }
    //     }

    //     // For each attribute, update the size of that node and then all the nodes above it
    //     let attributePaths = u.getKeysByDepth(attributes, true)
    //     attributePaths.forEach((path) => {
    //         let attributeValue = attributes[path]
    //         let size = u.getSize(attributeValue)
    //         let arrPath = u.stringPathToArrPath(path)
    //         u.setAttribute({obj: this.index, path: arrPath, value: size})
    //         arrPath = arrPath.slice(0, -1)
    //         path = u.arrayPathToStringPath(arrPath)

    //         console.log('\n\nSTART, ' + path)
    //         updateAllParents(path)
    //         console.log('  END, total: ' + this.index.s)
    //         debugger
    //     })

    //     // Finally, add the size of the index itself to the overall size
    //     let indexSize = u.getSize(this.index)
    //     debugger
    //     this.index.s = this.index.s + indexSize
    // }

// Returns an object of nodes that either have new sizes or have been deleted
_updateIndex(attributes) {   
     
    // Get existing attribute sizes
    let flattenedIndex = flatten(this.index)
    let indexKeys = u.getKeysByDepth(this.index, true)
    let indexKeysStripped = []
    indexKeys.forEach((key) => {
        if (key.slice(-2, -1) === '.') {
            key = key.slice(0, -2)
        }
        if (!indexKeysStripped.includes(key)) {
            indexKeysStripped.push(key)
        }
    })
    let indexSizes = {}
    indexKeysStripped.forEach((key) => {
        let nodeSize = flattenedIndex[key + '.s']
        indexSizes[key] = nodeSize
    })
    let oldIndexSizes = u.copy(indexSizes)
    
    // Get new node sizes, assuming attributes is already flat
    let attributeKeys = u.getKeysByDepth(attributes, true)
    let newAttributeSizes = {}
    attributeKeys.forEach((key) => {
        let attributeNode = attributes[key]
        let nodeSize = u.getSize(attributeNode)
        newAttributeSizes[key] = nodeSize
    })

    // Remove from index any nodes no longer present

    /* get newly
        - get newly updated node sizes - DONE
        - get newly deleted node sizes
        
    */
    // Now indexSizes accounts for new terminal node sizes, but has not reconciled these up the tree
    let updatedIndexSizes = {}
    indexKeysStripped.forEach((key) => {
        let oldSize = indexSizes[key]
        // indexSizes[key] = getReconciledSize(key)

        // If the value has changed, note this both in the array of changes to update in the DB and the local index
        if (indexSizes[key] !== oldSize) {
            updatedIndexSizes[key] = indexSizes[key]
            flattenedIndex[key + '.s'] = indexSizes[key]
        }
    })




    let exhaustiveIndex = u.getKeysByOrder(this.index)
    debugger

    return updatedIndexSizes
}





// no
    _isThisTooBigToWrite(data) {
        let dataSize = dynoItemSize(data)

        let nodeSize = this.size()
        if (nodeSize > MAX_NODE_SIZE)  {
            return true
        }

        // If we don't know, we err on the conservative side
        if (estimatedSize === null) {
            
        } 
    }

    
/* MINOR GETTERS */
    exists() {
        return this.exists
    }
    
    size() {
        return this.index.s
    }

    /*  **************************************************    */














    key() {
        return this.Key
    }

    // Loads and caches entire object from DB for subsequent retrieval
    async ensure_loaded() {
        if (this.data) {
            return this.data
        }
        let get_params = {
            table_name: this.TableName,
            key: this.Key
        }
        this.data = await db.get_item(get_params)
    }

    // Updates specified params or else the entire object
    async update(params_to_update) {
        
        // If specific params not specified, upload everything
        if (!params_to_update) {
            params_to_update = this.data
        }
        
        let set_params = {
            table_name: this.TableName,
            key: this.Key,
            attributes: params_to_update
        }
        let returned_data = await db.update_item(set_params)
        
        // Set this.data either in entirety or only the modified params only
        if (!this.data) {
            this.data = returned_data
        } else {
            Object.keys(returned_data).forEach((key) => {
                this.data[key] = returned_data[key]
            })
        }
        return this.data
    }
    

    async get(key) {
        if (this.Key[key]) {
            return this.Key[key]
        }

        let is_secret = this.is_key_secret(key)
        await this.ensure_current_user_can_view(is_secret)
        await this.ensure_loaded(key)
        return data[key]
    }

    // Designate keys as secret in config. For now, we're putting everything secret in "secret"
    async set(key, value) {
        if (this.Key[key]) {
            throw new Error('This key cannot be set')
        }
        
        let is_secret = this.is_key_secret(key)
        await this.ensure_current_user_can_edit(is_secret)
        let key_value_pair = {}
        key_value_pair[key] = value
        await this.update(key_value_pair)
        return this.data[key]
    }

    async raw() {
        await this.ensure_loaded()

        // Returns those keys in data permitted by user's permission level
        let get_all_allowed_data = () => {

            if (this.current_user_can_view(true)) {
                return this.data
            } else if (this.current_user_can_view()) {
                let permitted_data = u.filter_object(this.data, (key) => {
                    return !this.is_key_secret(key)
                })
                return permitted_data 
            }
        }
        let data = get_all_allowed_data()
        return data
    }



    // Secret params are designated in config
    is_key_secret(key) {
        return key.includes(config.SECRET_KEY_SUFFIX)
    }

    /*
    PERMISSION METHODS
    ensure_can_view and ensure_can_edit are superclassed for specific restriction
    */
    
    // Throws an error if the current user cannot view this object
    async ensure_current_user_can_view(sensitive) {
        if (!this.current_user_can_view(sensitive)) {
            this.throw_unauthorized_error()
        }
    }
    
    async ensure_current_user_can_edit(sensitive) {
        if (!this.current_user_can_edit(sensitive)) {
            this.throw_unauthorized_error()
        }
    }

    async current_user_can_view(sensitive) {
        return true
    }
    
    async current_user_can_edit(sensitive) {
        return true
    }

    throw_unauthorized_error() {
        throw new Error('Current user does not have required permissions')
    }
}

module.exports = DBObject