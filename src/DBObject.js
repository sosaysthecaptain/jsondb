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
        let data = await this._write(initialData, true)
        
        // this.size = formattedContent.s
        this.exists = true
        return data
    }
    
    async get(path) {

    }

    async set(attributes) {
        let hypotheticalSize = this._getHypotheticalSize(attributes)
        
        let manualIndex = this._getNewIndex(attributes)
        
        // Handle the split
        if (hypotheticalSize > MAX_NODE_SIZE) {
            
            // Get all key sizes
            
            /*
            Scenarios:
            - lots of little stuff
            - one massive incoming piece
            - one massive incoming blob
            - mismatched things, some bigger 
            */
           
        } else {
            debugger
            let res = await this._write(attributes)
            return res
        }

    }

    async modify() {

    }

    /*  INTERNAL METHODS */

    // Writes given attributes to this specific node
    async _write(attributes, doNotOverwrite) {
        
        // Get new, updated index
        this.index = this._getNewIndex(attributes)
        attributes['i'] = this.index
        
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
        return data
    }

        // let originalIndex = flatten(this.index)
        // let index = u.copy(originalIndex)
        // attributes = flatten(attributes)
        // let changedKeys = Object.keys(attributes)

        // // If new attributes have displaced existing attributes, we first remove those from the index
        // changedKeys.forEach((attributePath) => {  
        //     let children = u.getChildren(attributePath, originalIndex)
        //     children.forEach((childPath) => {
        //         delete index[childPath]
        //     })
        // })

        // // Add new keys to index, write new
        // // TODO: permissions, check that we can write deep attributes that exist
        // changedKeys.forEach((attributePath) => {
        //     index[attributePath + '.d'] = true
        //     index[attributePath + '.p'] = 0                                         // TODO
        //     index[attributePath + '.s'] = u.getSize(attributes[attributePath])
        // })

        // // Add the new index, with its updated size, to the data to be written
        // this.index = unflatten(index)
        // this.index.s = u.getSizeOfNodeAtPath('', index)
        // this.index.s += u.getSize(this.index)
        // this.index.k = this.key
        // attributes['i'] = this.index
        // attributes = unflatten(attributes)
        
        // debugger
        
 
    // Gets hypothetical index, without setting it
    _getNewIndex(attributes) {
        attributes = attributes || {}
        let originalIndex = flatten(this.index)
        let index = u.copy(originalIndex)
        let flatAttributes = flatten(attributes)
        let changedKeys = Object.keys(flatAttributes)

        // If new attributes have displaced existing attributes, we first remove those from the index
        changedKeys.forEach((attributePath) => {  
            let children = u.getChildren(attributePath, originalIndex)
            children.forEach((childPath) => {
                delete index[childPath]
            })
        })

        // Add new keys to index, write new
        changedKeys.forEach((attributePath) => {
            index[attributePath + '.d'] = true
            index[attributePath + '.p'] = 0                                         // TODO
            index[attributePath + '.s'] = u.getSize(flatAttributes[attributePath])
        })

        // Add the new index, with its updated size, to the data to be written
        let unflatIndex = unflatten(index)
        unflatIndex.s = u.getSizeOfNodeAtPath('', index)
        unflatIndex.s += u.getSize(this.index)
        unflatIndex.k = this.key
        return unflatIndex
    }

    _getHypotheticalSize(attributes) {
        let hypotheticalIndex = this._getNewIndex(attributes)
        let currentIndexSize = u.getSize(this.index)
        let newIndexSize = u.getSize(hypotheticalIndex)
        return hypotheticalIndex.s - currentIndexSize + newIndexSize
    }



    // IMPLEMENT ME
    _cache(attributes) {
        
    }















    

    
/* MINOR GETTERS */
    exists() {
        return this.exists
    }
    
    size() {
        return this.index.s
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