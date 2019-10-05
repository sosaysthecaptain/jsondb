const flatten = require('flat')
const unflatten = require('flat').unflatten
const _ = require('lodash')

const u = require('./u')

TYPE_KEY = 'TYPE'
SIZE_KEY = 'SIZE'
PERMISSION_KEY = 'PERM'
POINTER_KEY = 'POINTER'
SPILLOVER_KEY = 'SPILLOVER'           // for meta nodes, next place to go look for further keys
CHILDREN_KEY = 'CHILDREN'
S3_REF_KEY = 'S3'

INDEX_KEY = 'I'

NT_DEFAULT = 'DEFAULT'                    // default terminal node (get node)
NT_META = 'META'                          // meta node (get children)
NT_VERTICAL_POINTER = 'VP'                // specific vertical pointer ()
NT_LATERAL_POINTER = 'LP'                 // large, laterally-extended node
NT_COLLECTION = 'COLLECT'                 // collection
NT_FILE_LINK = 'FILE_LINK'                // file, link
NT_FILE_BUFFER = 'FILE_BUF'               // file, buffer
NT_REF = 'REF'                            // reference to another DBObject

class NodeIndex {

    // Jumpstarts with index read from DB
    constructor(id, index) {
        this.id = id
        this.i = index || {}
        this.loaded = false
    }

    // getBlankIndexObj() {
    //     return {
    //         terminal: {},
    //         meta: {},
    //         overall: null
    //     }
    // }

    // Creates or updates the index on the basis of new attributes
    build(attributes) {
        attributes = attributes || {}
        
        let changedKeys = Object.keys(attributes)
        let keysToDelete = []
        
        // If new attributes have displaced existing attributes, we first remove those from the index
        changedKeys.forEach((path) => {  
            let children = this.getChildren(path)
            children.forEach((childPath) => {
                delete this.i[childPath]
                keysToDelete.push(childPath)
            })
        })
        
        // Add new keys to index, write new
        changedKeys.forEach((path) => {
            
            // If this path does not yet have an index node, create one
            if (!this.i[path]) {
                this.i[path] = new IndexEntry(path)
            }
            this.i[path].size(u.getSize(attributes[path])) 
        })
                
        // Add intermediate nodes, including the top level
        this.updateMetaPaths()
        this.loaded = true

        return this.i
    }

    // Updates meta nodes
    updateMetaPaths() {

        // Add any intermediate paths that don't exist yet. For those that do exist, erase their
        // size, as we'll recalculate it
        let intermediatePaths = u.getIntermediatePaths(this.i)
        intermediatePaths.forEach((path) => {
            if (!this.i[path]) {
                this.i[path] = new IndexEntry(path)
                this.i[path].type(NT_META)
            }
        })

        // Update all intermediate path sizes, delete any intermediate paths with no children
        let paths = Object.keys(this.i)
        paths.forEach((path) => {
            if (path === u.INDEX_PREFIX) return                 // ignore the top level meta node
            if (this.i[path][u.GROUP_SIZE_KEY]) {
                // let children = u.getChildren(path, this.i)

                let nodeSize = this.getSizeOfNodeAtPath(path, this.i)
                this.i[path].size(nodeSize)
                
                // If there are no children, actual or as pointers, delete this meta node
                if (!nodeSize && !this.i[path][CHILDREN_KEY && !this.i[path][SPILLOVER_KEY]]) {
                    delete this.i[path]
                }
            }
        })

        // Add the new index, with its updated size, to the data to be written
        let objectSize = this.getSizeOfNodeAtPath('')
        let indexSize = u.getSize(this.i)

        // Update or create the top level index entry
        this.i[INDEX_KEY] = this.i[INDEX_KEY] || new IndexEntry(INDEX_KEY)
        this.i[INDEX_KEY].size(objectSize + indexSize)
        this.i[INDEX_KEY].permission('FIX THIS')
        this.i[INDEX_KEY].id = this.id
        this.i[INDEX_KEY].isLateralExtension = false            // fix this too
    }

    // Returns IndexEntries
    getChildren(path) {
        
        // No path == root
        let childKeys = []
        if (path === '') {
            return Object.keys(this.i)
        }

        // For all paths, find those that begin the same but aren't the same
        Object.keys(this.i).forEach((key) => {
            if (key.startsWith(path) && (key !== path)) {
                if (!this.i[key][u.GROUP_SIZE_KEY]) {
                    childKeys.push(key)
                }
            }
        })
        return childKeys
    }

    getSizeOfNodeAtPath(path) {
        let childPaths = this.getChildren(path)
        let size = 0

        childPaths.forEach((childPath) => {
            size += this.i[childPath].size()
        })
        return size
    }

    // Output index as object
    write(complete) {
        let writtenIndex = {}
        Object.keys(this.i).forEach((path) => {
            let nodeObject = this.i[path]
            let nodeData = nodeObject.write(complete)
            if (nodeData) {writtenIndex[path] = nodeData}
        })
        return writtenIndex
    }

    isOversize() {return this.i[INDEX_KEY].size() > u.HARD_LIMIT_NODE_SIZE}
    isLoaded() {return this.loaded}

}

// Record-keeping mechanism for index
// TYPE_KEY = 'TYPE'
// SIZE_KEY = 'SIZE'
// PERMISSION_KEY = 'PERM'
// POINTER_KEY = 'POINTER'
// CHILDREN_KEY = 'CHILDREN'
// S3_REF_KEY = 'S3
class IndexEntry {
    constructor(path) {
        this.writable = {}
        this.local = {
            path: path
        }
    }


    type(type) {return this.univGetSet('TYPE', type)}
    size(size) {return this.univGetSet('S', size)}
    permission(permission) {return this.univGetSet('P', permission)}
    pointer(pointer) {return this.univGetSet('PTR', pointer)}
    s3Ref(s3Ref) {return this.univGetSet('S3', s3Ref)}

    univGetSet(writableKey, value) {
        if (value) {this.writable[writableKey] = value} 
        else {return this.writable[writableKey]}
    }

    size(size) {
        if (size !== undefined) {
            if (this.isDefault()) {this.writable[SIZE_KEY] = size}
            else if (this.isMeta()) {this.local.groupSize = size}
        } else {
            if (this.isDefault()) {return this.writable[SIZE_KEY]} 
            else if (this.isMeta()) {return this.local.groupSize} 
            else {return 0}
        }
    }

    
    addChild(childPath, childID) {this.writable[CHILDREN_KEY][childPath] = childID}
    removeChild(childPath) {delete this.writable[CHILDREN_KEY][childPath]}
    clearChildren() {this.writable[CHILDREN_KEY] = {}}
    children(children) {
        if (children) {this.writable[CHILDREN_KEY] = children}
        else {return this.writable[CHILDREN_KEY]}
    }

    write(complete) {
        let ret = u.copy(this.writable)
        if (complete) {
            // Object.keys(this.local).forEach((localKey) => {
            //     ret[localKey] = this.local[localKey]
            // })

            if (this.isDefault()) {
                ret[TYPE_KEY] = NT_DEFAULT
            }
        } else {
            // If this node has nothing more interesting to say about itself than that it's a meta node,
            // it doesn't get to go to dynamo
            if (this.isMeta() && (Object.keys(ret).length === 1)) {return}
        }




        return ret
    }


    isDefault() {return (this.writable[TYPE_KEY] === NT_DEFAULT) || (this.writable[TYPE_KEY] === undefined)}
    isMeta() {return this.writable[TYPE_KEY] === NT_META}
}

module.exports = NodeIndex