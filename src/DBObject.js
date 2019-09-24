/*
Represents a virtual object in memory, as stored in dynamo. Begins as a single node, splits itself up 
as necessary. Each DBObject in reality represents an individual node, except that top level nodes 
are designated as such upon instantiation, and keep a cache, while child nodes don't.

Structure:
    internal_id_of_example_node = {
        d: {
            key_1: {
                d: 'some example data',
                c: null,
            key_2: {
                d: {<multiple keys in here>}
                c: [key_1_direct_child_1_id, key_1_direct_child_2_id]
            },
            key_3: {d: ['these', 'can', 'be', 'arrays', 'too']},
            key_4: {d: {another_key: 'or objects'},
            key_5: {d: 123456789},
            key_6: {d: false}
        },
        l: id_of_lateral_spillover_node,
        c: [id_of_direct_child, another_id_of_direct_child],
        p: permission_level_of_this_node
    }

Public methods:
    - get('path.to.key') - returns data at specified path, omit path to get all, can be array
    - set({
        key: value,
        path.to.deeper.key: anotherValue
    }) 
    - sizeOf()
*/

let dynoItemSize = require('dyno-item-size');

let DynamoClient = require('./DynamoClient')
let u = require('./u')

class DBObject {

    // A DBObject must be instantiated with ID. Size is tracked and determined by dead reckoning
    constructor({id, tableName, dynamoClient, permissionLevel, maximumCacheSize, isTopLevel, doesNotExistYet, size}) {
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
        
        // We know for sure at this point if we exist in the db, but if we've just been instantiated we 
        // don't know our size
        this.exists = !doesNotExistYet
        this.size = size || 0

        this.hardLimitNodeSize = 400 * 1024 * 1024
        this.maxNodeSize = 300 * 1024 * 1024
        this.idealNodeSize = 200 * 1024 * 1024
        this.cache = {}
    }

    // Creates a new object in the database
    async create(initialData) {
        initialData = initialData || {}
        // initialRaw['d'] = initialData
        // initialRaw['c'] = []
        // initialRaw['l'] = null
        // initialRaw['p'] = this.permissionLevel
        
        let formattedContent = this._formatNode(initialData)
        debugger
        this._write(formattedContent, true)
        
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

    // Recursively walks a given object, formatting correctly and updating size metadata
    _formatNode(obj, pathToTop) {
        
        if (obj && typeof obj === 'object') {
            let allKeys = Object.keys(obj)
            for(let i = 0; i < allKeys.length; i++) {
                let key = allKeys[i]
                let value = obj[key]
                pathToTop = pathToTop || key + '.'

                console.log ('formatting ' + key + ', pathToTop: ' + pathToTop)

                // If not a single-letter key, this is data that needs to go in d
                let directParentKey = pathToTop.split('.').slice(0, -1).pop()

                // If this is a real data node
                if ((key === 'd') && (directParentKey !== 'd')) {
                    console.log('    treating this as a data node')
                    obj['d'] = value
                    delete obj[key]
                }
                
                // If we have an obj.d and it has children, whether or not we just created it, 
                // we need to recursively walk its children and apply this transform
                if (typeof obj.d === 'object') {
                    console.log('    recursively walking children')

                    this._formatNode(obj.d, parentWasMetadata)
                }
                
                // If we have obj.d at all, we need to calculate the size of this entire node, including 
                // d's metadata siblings
                if (obj.d) {
                    obj['s'] = dynoItemSize(obj)
                }
            }
        }


        return obj
    }
    
    
    // Writes to this node only, assuming this is appropriate
    async _write(attributes, doNotOverwrite) {
        
        
        let data = await this.dynamoClient.update({
            tableName: this.tableName,
            key: this.key,
            attributes: attributes,
            doNotOverwrite: doNotOverwrite
        }).catch((err) => {
            console.log('failure in DBObject._write')
            console.error(err)
        })
        
        let sizeDelta = dynoItemSize(data)
        
        this.exists = true
    }
    
    
   


    _isThisTooBigToWrite(data) {
        let dataSize = dynoItemSize(data)

        let nodeSize = this.size()
        if (nodeSize > this.maxNodeSize)  {
            return true
        }

        // If we don't know, we err on the conservative side
        if (estimatedSize === null) {
            
        } 
    }

    

    exists() {
        return this.exists
    }
    
    size() {
        return this.size
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