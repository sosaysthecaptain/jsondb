const flatten = require('flat')
const unflatten = require('flat').unflatten
const _ = require('lodash')

const u = require('./u')

PREFIX_TYPE = 'TYPE'
PREFIX_SIZE = 'SIZE'
PREFIX_PERMISSION = 'PERM'
PREFIX_POINTER = 'POINTER'
PREFIX_SPILLOVER = 'SPILLOVER'           // for meta nodes, next place to go look for further keys
PREFIX_CHILDREN = 'CHILDREN'
PREFIX_S3_REF = 'S3'

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
        this.meta = {}
    }

    // Creates or updates the index on the basis of new attributes
    build(attributes, dontSet) {
        debugger
        attributes = attributes || {}
        let originalIndex = u.copy(this.i)
        let index = u.copy(this.i)
        
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
        
        debugger
        
        if (!dontSet) {
            this.i = index
        }
        return index
    }

    // Updates meta nodes
    update() {

        // Add any intermediate paths that don't exist yet. For those that do exist, erase their
        // size, as we'll recalculate it
        let intermediatePaths = u.getIntermediatePaths(this.i)
        intermediatePaths.forEach((path) => {
            if (!index[path]) {
                index[path] = {}
                index[path][u.GROUP_SIZE_PREFIX] = -1
                index[path][u.EXT_PREFIX] = null
            }
        })

        // Update all intermediate path sizes, delete any intermediate paths with no children
        let paths = Object.keys(index)
        paths.forEach((path) => {
            if (path === u.INDEX_PREFIX) return
            if (index[path][u.GROUP_SIZE_PREFIX]) {
                let children = u.getChildren(path, index)
                let nodeSize = u.getSizeOfNodeAtPath(path, index)
                index[path][u.GROUP_SIZE_PREFIX] = nodeSize
                if (!nodeSize) {
                    delete index[path]
                }
            }
        })

        // Update index's top level size, if it's already been instantiated
        if (index[u.INDEX_PREFIX]) {
            index[u.INDEX_PREFIX][u.GROUP_SIZE_PREFIX] = u.getSizeOfNodeAtPath('', index)
        }
    }


}

// Record-keeping mechanism for index
// PREFIX_TYPE = 'TYPE'
// PREFIX_SIZE = 'SIZE'
// PREFIX_PERMISSION = 'PERM'
// PREFIX_POINTER = 'POINTER'
// PREFIX_CHILDREN = 'CHILDREN'
// PREFIX_S3_REF = 'S3
class IndexEntry {
    constructor({path, permission, type}) {
        
        // Things that go to the DB
        this[PREFIX_TYPE] = type || NT_DEFAULT
        this[PREFIX_PERMISSION] = permission 
        this[PREFIX_SIZE] = null
        this[PREFIX_SPILLOVER] = null
        this[PREFIX_POINTER] = null
        this[PREFIX_CHILDREN] = []
        this[PREFIX_S3_REF] = null

        // Things for local use only
        this.path = path
        this.sizeOfChildren = null
    }

    data() {
        let data = {}
        data[] = this[PREFIX_TYPE]

        return {
            path: this.path,
            type: this[PREFIX_TYPE],
            permission: this[PREFIX_PERMISSION],
            size: this.getSize(),
            pointer: this.pointer(),
            terminal: this.isTerminal
        }
        return data
    }

    // What data we want to write to the DB

    writable() {
        let data = {}
        data[PREFIX_TYPE] = this[PREFIX_TYPE]

        if (this[PERMISSION_PREFIX]) {
            data[PERMISSION_PREFIX] = this[PERMISSION_PREFIX]
        }

        // Terminal: record size
        if (this[PREFIX_TYPE] === NT_DEFAULT) {
            data[SIZE_PREFIX] = this.size()
        }

        // Meta nodes store lateral pointers, in addition to path-specific pointers
        if (this[PREFIX_TYPE] === NT_META) {
            data[PREFIX_SPILLOVER] = this[PREFIX_SPILLOVER]
            data[PREFIX_CHILDREN] = this[PREFIX_CHILDREN]
        }

        // Pointers
        if ((this[PREFIX_TYPE] === NT_VERTICAL_POINTER )|| (this[PREFIX_TYPE] === NT_LATERAL_POINTER )) {
            data[PREFIX_POINTER] = this[PREFIX_POINTER]
        }
        
        // Files
        if ((this[PREFIX_TYPE] === NT_FILE_LINK )|| (this[PREFIX_TYPE] === NT_FILE_BUFFER )) {
            data[PREFIX_S3_REF] = this[PREFIX_S3_REF]
        }
        return data
    }

    setType(type) {
        this[PREFIX_TYPE] = type
    }

    setSize(size) {
        if (this[PREFIX_TYPE] === NT_DEFAULT) {
            this._size = size
        } else if (this[PREFIX_TYPE] === NT_META) {
            this._sizeOfChildren = size
        }
    }

    size(index) {
        if (this[PREFIX_TYPE] === NT_DEFAULT) {
            return this._size
        } else if (this[PREFIX_TYPE] === NT_META) {
            return this._sizeOfChildren
        } else {
            return 0
        }
    }

    pointer() {
        return thisthis[PREFIX_POINTER]
    }
    
    
}

module.exports = NodeIndex