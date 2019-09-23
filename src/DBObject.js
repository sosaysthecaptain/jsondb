/*
Represents a virtual object in memory, as stored in dynamo. Begins as a single node, splits itself up as necessary.

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

let DynamoClient = require('./DynamoClient')

class DBObject {
    constructor({id, tableName, dynamoClient, permissionLevel, maximumCacheSize}) {
        this.id = id,
        this.dynamoClient = dynamoClient,
        this.tableName = tableName
        this.key = {
            uid: id.split('-')[0],
            ts: id.split('-')[1] || 0
        },
        this.permissionLevel = permissionLevel
        this.cache = {}
        this.maximumCacheSize = maximumCacheSize || 50 * 1024 * 1024
    }

    // Creates a new object in the database
    async create(initialData) {
        initialData = initialData || {}
        let initialRaw = {
            d: initialData,
            c: [],
            l: null,
            p: this.permissionLevel
        }

        await this.dynamoClient.update({
            tableName: this.tableName,
            key: this.key,
            attributes: initialRaw,
            doNotOverwrite: true
        }).catch((err) => {
            console.log('failure in DBObject.create')
            console.error(err)
        })
    }
    
    get(path) {

    }

    set() {

    }

    modify() {

    }














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