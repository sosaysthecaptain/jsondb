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

NT_DEFAULT = 'DEFAULT'                    // default terminal node (get node)
NT_META = 'META'                          // meta node (get children)
NT_VERTICAL_POINTER = 'VP'                // specific vertical pointer ()
NT_LATERAL_POINTER = 'LP'                 // large, laterally-extended node
NT_COLLECTION = 'COLLECT'                 // collection
NT_FILE_LINK = 'FILE_LINK'                // file, link
NT_FILE_BUFFER = 'FILE_BUF'               // file, buffer
NT_REF = 'REF'                            // reference to another DBObject

class NodeIndex {

    constructor(id) {
        this.id = id
        this.i = {}
        this.loaded = false
    }

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

        // Add meta nodes for any intermediate paths without metanodes, update sizes of all
        let intermediatePaths = u.getIntermediatePaths(this.i)
        intermediatePaths.forEach((path) => {
            if (!this.i[path]) {
                this.i[path] = new IndexEntry(path)
                this.i[path].type(NT_META)
            }
            let nodeSize = this.getSizeOfNodeAtPath(path, this.i)
            this.i[path].size(nodeSize)
        })

        // Delete any metanodes that no longer have children
        let paths = Object.keys(this.i)
        paths.forEach((path) => {
            if (path === u.INDEX_KEY) return
            let node = this.i[path]
            if (node.isMeta()) {
                let hasChildren = u.getChildren(path, this.i).length
                let hasChildrenPointers = node[CHILDREN_KEY]
                let hasSpilloverPointer = node[SPILLOVER_KEY]
                if (!hasChildren && !hasChildrenPointers && !hasSpilloverPointer) {delete this.i[path]}
            }
        })

        // Add the new index, with its updated size, to the data to be written
        let objectSize = this.getSizeOfNodeAtPath('')
        let indexSize = u.getSize(this.i)

        // Update or create the top level index entry
        this.i[u.INDEX_KEY] = this.i[u.INDEX_KEY] || new IndexEntry(u.INDEX_KEY)
        this.i[u.INDEX_KEY].size(objectSize + indexSize)
        this.i[u.INDEX_KEY].type = NT_META
        this.i[u.INDEX_KEY].permission('FIX THIS')
        this.i[u.INDEX_KEY].id = this.id
        this.i[u.INDEX_KEY].isLateralExtension = false            // fix this too
    }

    // Fed the raw index object from dynamo, loads into memory and recomputes locally stored values
    loadData(data) {
        Object.keys(data).forEach((path) => {
            this.i[path] = new IndexEntry(path, data[path])
        })
        this.updateMetaPaths()
        this.loaded = true
    }

    /* Given a path, return:
        a) this.id, if it's locally available
        b) direct child ID, if we have positive record of it belonging to a child node
        c) spillover node ID, if present
    */
    getIDForPath(path) {
        debugger
        let indexNode = this.i[path]
        if (indexNode) {

            // If local, return this DBObjectNode's id
            if (indexNode.isDefault()) {return this.id}
            
            // If it's a direct child, return child DBObjectNode's id
            else if (indexNode.isMeta()) {
                if (indexNode[CHILDREN_KEY] && Object.values(indexNode[CHILDREN_KEY].includes(path))) {
                    return indexNode[CHILDREN_KEY][path]
                }
            }

            // If a spillover node references it, return that node's id
            let spilloverID = this.getSpilloverNodeID(path)
            if (spilloverID) {return spilloverID}
        }

        Object.keys(this.i).forEach((indexKey) => {
            let indexNode = this.i[indexKey]
            if (indexNode.isDefault()) {return this.id}

        })
    }

    // Returns any spillover node ID for a given path
    getSpilloverNodeID(path) {
        if (this.i[path] && this.i[path][SPILLOVER_KEY]) {return this.i[path][SPILLOVER_KEY]}
        else {
            let arrPath = u.stringPathToArrPath(path)
            arrPath.pop()
            if (!arrPath.length) {return}
            path = u.arrayPathToStringPath(path)
            return this.getSpilloverNodeID(path)
        }
    }


    // Returns all paths stored on this object node
    // getAvailablePaths() {
    //     let availablePaths = []
    //     Object.keys(this.i).forEach((path) => {
    //         if (path === INDEX_KEY) {return}
    //         let indexNode = this.i[path]
    //         if (indexNode.isDefault()) {availablePaths.push(path)}
    //     })
    //     return availablePaths
    // }

    // If return paths explicitly available on children
    // getPathsAvailableFromChildren() {
    //     let pathsToKeys = []
    //     Object.keys(this.i).forEach((path) => {
    //         if (path === INDEX_KEY) {return}
    //         let indexNode = this.i[path]
    //         if (indexNode.isMeta() && indexNode[CHILDREN_KEY]) {
    //             let childIDs = indexNode[CHILDREN_KEY]
    //             pathsToKeys[path] = childIDs
    //         }
    //     })
    //     return availablePaths
    // }







    // Returns IndexEntries
    getChildren(path) {
        let pathsToSearch = []
        Object.keys(this.i).forEach((path) => {
            // if (path === u.INDEX_KEY) {return}
            if (!this.i[path].isMeta()) {pathsToSearch.push(path)}
        })
        debugger
        
        // No path == root
        let childKeys = []
        if (path === '') {
            childKeys = pathsToSearch
        }

        // For all paths, find those that begin the same but aren't the same
        pathsToSearch.forEach((key) => {
            if (key.startsWith(path) && (key !== path)) {
                // let node = this.i[key]
                // if (!node.isMeta()) {childKeys.push(key)}
                childKeys.push(key)
            }
        })



        return childKeys
    }

    getSizeOfNodeAtPath(path) {
        let childPaths = this.getChildren(path)
        let size = 0
        childPaths.forEach((childPath) => {
            let child = this.i[childPath]
            if (!child.isMeta()) {
                size += child.size()
            }
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

    isOversize() {return this.i[u.INDEX_KEY].size() > u.HARD_LIMIT_NODE_SIZE}
    isLoaded() {return this.loaded}

}

class IndexEntry {
    constructor(path, data) {
        this.data = {}
        this.metadata = {path}

        // If the index object from the DB has been supplied, instantiate all nodes and recompute meta
        if (data) {
            Object.keys(data).forEach((dataKey) => {
                this.data[dataKey] = data[dataKey]
            })
        }
    }


    type(type) {return this.univGetSet('TYPE', type)}
    size(size) {return this.univGetSet('S', size)}
    permission(permission) {return this.univGetSet('P', permission)}
    pointer(pointer) {return this.univGetSet('PTR', pointer)}
    s3Ref(s3Ref) {return this.univGetSet('S3', s3Ref)}

    univGetSet(writableKey, value) {
        if (value) {this.data[writableKey] = value} 
        else {return this.data[writableKey]}
    }

    size(size) {
        if (size !== undefined) {
            if (this.isDefault()) {this.data[SIZE_KEY] = size}
            else if (this.isMeta()) {this.metadata.groupSize = size}
        } else {
            if (this.isDefault()) {return this.data[SIZE_KEY]} 
            else if (this.isMeta()) {return this.metadata.groupSize} 
            else {return 0}
        }
    }

    
    addChild(childPath, childID) {this.data[CHILDREN_KEY][childPath] = childID}
    removeChild(childPath) {delete this.data[CHILDREN_KEY][childPath]}
    clearChildren() {this.data[CHILDREN_KEY] = {}}
    children(children) {
        if (children) {this.data[CHILDREN_KEY] = children}
        else {return this.data[CHILDREN_KEY]}
    }

    write(complete) {
        let ret = u.copy(this.data)
        if (complete) {
        
            // We don't store "default", but here we specify
            if (this.isDefault()) {
                ret[TYPE_KEY] = NT_DEFAULT
            }
        } 
        return ret
    }


    isDefault() {return (this.data[TYPE_KEY] === NT_DEFAULT) || (this.data[TYPE_KEY] === undefined)}
    isMeta() {return this.data[TYPE_KEY] === NT_META}
}

module.exports = NodeIndex