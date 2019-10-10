/*
Direction: 
- everything that isn't lateral, vertical, spillover is set with set/get. Kill all the unused consts
- expose setNodeProperty, getNodeProperty
- collections, references, and files are then handled as getter/setter pairs in DBObject

Handling index spillover
- possibility: add third type to lateral/vertical: spillover
    - when a chunk is lifted off, if the index is past a certain size, use a stub index path with a 
    spillover key. Kill the rest in the index, thus allowing arbitrarily many things under a single node
    - create a this.index.pathInSpillover(path) method returning this spillover node ID, if necessary
    - if pathInSpillover, batchGet simply forwards the request to that node

*/


const _ = require('lodash')

const u = require('./u')

TYPE_KEY = 'TYPE'
SIZE_KEY = 'SIZE'
PERMISSION_KEY = 'PERM'
POINTER_KEY = 'POINTER'                   // single vertical pointer
LATERAL_POINTER_ARRAY_KEY = 'LAT_PTR'     // array of lateral pointers
S3_REF_KEY = 'S3'


// currently unused
SPILLOVER_KEY = 'SPILLOVER'               // for meta nodes, next place to go look for further keys

class NodeIndex {

    constructor(id) {
        this.id = id
        this.i = {}
        this.loaded = false
    }

    // Returns existing keys displaced by incoming attributes, does not delete
    getPathsToDelete(attributes) {
        attributes = attributes || {}
        let changedKeys = Object.keys(attributes)
        let toDelete = []
        changedKeys.forEach((path) => {  
            let children = this.getChildren(path)
            children.push(path)
            children.forEach((childPath) => {
                let node = this.getNodeAtPath(childPath)
                if (node) {
                    let shouldDelete = !this.getNodeProperty(childPath, 'dontDelete')
                    if (shouldDelete) {toDelete.push(childPath)}
                }
            })
        })
        return toDelete
    }

    // Creates or updates the index on the basis of new attributes
    build(attributes) {
        attributes = attributes || {}

        // Strike displaced nodes from index, they should already have been deleted
        let changedKeys = Object.keys(attributes)
        let toDelete = this.getPathsToDelete(attributes)
        toDelete.forEach((path) => {
            delete this.i[path]
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
        this.updateMetaNodes()
        this.loaded = true
        return this.i
    }

    // Updates meta nodes
    updateMetaNodes() {

        // Add meta nodes for any intermediate paths without metanodes, update sizes of all
        let intermediatePaths = u.getIntermediatePaths(this.i)
        intermediatePaths.forEach((path) => {
            if (!this.i[path]) {
                this.i[path] = new IndexEntry(path)
                this.i[path].type(u.NT_META)
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
                // let hasChildrenPointers = node[CHILDREN_KEY]
                let hasSpilloverPointer = node[SPILLOVER_KEY]
                // if (!hasChildren && !hasChildrenPointers && !hasSpilloverPointer) {delete this.i[path]}
                if (!hasChildren && !hasSpilloverPointer) {delete this.i[path]}
            }
        })

        // Add the new index, with its updated size, to the data to be written
        let objectSize = this.getSizeOfNodeAtPath('')
        let indexSize = u.getSize(this.i)

        // Update or create the top level index entry
        this.i[u.INDEX_KEY] = this.i[u.INDEX_KEY] || new IndexEntry(u.INDEX_KEY)
        this.i[u.INDEX_KEY].type(u.NT_META)
        this.i[u.INDEX_KEY].size(objectSize + indexSize)
        // this.i[u.INDEX_KEY].permission('FIX THIS')
        this.i[u.INDEX_KEY].id = this.id
    }

    // Updates only those specified, others inherit permission of closest parent with permission
    updatePermissions(permission, attributes) {
        if (attributes) {
            Object.keys(attributes).forEach((path) => {
                let node = this.getNodeAtPath(path)
                node.permission(permission)
            })
        } else {
            this.metaIndex().permission(permission)
        }
    }

    // Fed the raw index object from dynamo, loads into memory and recomputes locally stored values
    loadData(data) {
        Object.keys(data).forEach((path) => {
            this.i[path] = new IndexEntry(path, data[path])
        })
        this.updateMetaNodes()
        this.loaded = true
    }

    // TODO: DELETE NODES UNDER IT
    deleteNode(path) {
        let downstreamToAudit = []
        let children = this.getChildren(path)
        children.forEach((childPath) => {
            downstreamToAudit = downstreamToAudit.concat(this.i[childPath].pointers())
            delete this.i[childPath]
        })
        delete this.i[path]
        this.updateMetaNodes()
        return downstreamToAudit
    }

    /* Given a path, return:
        a) this.id, if it's locally available
        b) direct child ID, if we have positive record of it belonging to a child node
        c) spillover node ID, if present
        NOTE LATERAL IS HANDLED SEPARATELY
    */
    getIDForPath(path) {
        let indexNode = this.i[path]
        if (indexNode) {

            // If local, return this DBObjectNode's id
            if (indexNode.isDefault()) {return this.id}
            
            // If it's a direct child, return child DBObjectNode's id
            else if (indexNode.getVerticalPointer()) {
                return indexNode.getVerticalPointer()
            }

            // If a spillover node references it, return that node's id
            // let spilloverID = this.getSpilloverNodeID(path)
            // if (spilloverID) {return spilloverID}
        }

        // If no node is specified, return all default nodes
        Object.keys(this.i).forEach((indexKey) => {
            let indexNode = this.i[indexKey]
            if (indexNode.isDefault()) {return this.id}

        })
    }

    getNodesByType(paths) {
        let data = {
            local: {},
            lateral: {},
            s3: {},
            collection: {},
            reference: {},
            elsewhere: {}
        }
        paths.forEach((path) => {
            let node = this.getNodeAtPath(path)
            let type = node.type()
            if ((type === u.NT_DEFAULT) || (!type)) {
                data.local[path] = node
            } else if (type === u.NT_VERTICAL_POINTER) {
                data.elsewhere[path] = node
            } else if (type === u.NT_LATERAL_POINTER) {
                data.lateral[path] = node
            } else if (type === u.NT_COLLECTION) {
                data.collection[path] = node
            } else if (type === u.NT_S3REF) {
                data.s3[path] = node
            } else if (type === u.NT_REF) {
                data.ref[path] = node
            }
        })
        return data
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

    metaIndex() {return this.i[u.INDEX_KEY]}


    // Returns all paths stored on this object node, used by getEntireObject
    // getAvailablePaths() {
    //     let availablePaths = []
    //     Object.keys(this.i).forEach((path) => {
    //         if (path === u.INDEX_KEY) {return}
    //         let indexNode = this.i[path]
    //         if (indexNode.isDefault()) {availablePaths.push(path)}
    //     })
    //     return availablePaths
    // }

    // NOPE 
    // Returns all 
    // getPathsByID() {
    //     let pathsToKeys = {}
    //     Object.keys(this.i).forEach((path) => {
    //         if (path === u.INDEX_KEY) {return}
    //         let indexNode = this.i[path]

    //         // Add locally available
    //         if (indexNode.isDefault()) {
    //             pathsToKeys[path] = pathsToKeys[path] || []
    //             pathsToKeys[path] = this.id
    //         } 
            
    //         // Add direct children
    //         else if (indexNode.isMeta() && indexNode[CHILDREN_KEY]) {
    //             let childIDs = indexNode[CHILDREN_KEY]
    //             if (childIDs.length) {
    //                 pathsToKeys[path] = pathsToKeys[path] || []
    //                 pathsToKeys[path] = childIDs
    //             }
    //         }

    //         // Add indirect children
    //         // else {
    //         //     let spilloverPath = this.getSpilloverNodeID(path)
    //         //     if (spilloverPath) {
    //         //         pathsToKeys[path] = pathsToKeys[path] || []
    //         //         pathsToKeys[path] = [spilloverPath]
    //         //     }
    //         // }
    //     })
    //     return pathsToKeys
    // }







    // Returns all non-meta IndexEntries under path specified
    getChildren(path) {    
        let pathsToSearch = []
        Object.keys(this.i).forEach((p) => {
            if (p === u.INDEX_KEY) {return}
            if (!this.i[p].isMeta()) {pathsToSearch.push(p)}
        })

        // No path == root
        let childKeys = []
        if (!path) {return pathsToSearch}

        // Otherwise, child == starts the same, including 
        pathsToSearch.forEach((key) => {
            if (key.startsWith(path) && (key !== path)) {
                childKeys.push(key)
            }
        })
        return childKeys
    }

    // Locally present only
    getTerminalChildren(path) {
        let res = []
        let allNonMeta = this.getChildren(path)
        allNonMeta.forEach((path) => {
            let node = this.i[path]
            if (node.isDefault()) {
                res.push(path)
            }
        })
        if (this.i[path].isDefault()) {res.push(path)}
        return res
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

    // True if nothing is not in some way represented on this node
    arePathsAccountedFor(paths) {
        paths.forEach((path) => {if (!this.i[path]) {return false} else {return true}})
    }

    // TODO: account for lateral extension of a node 
    isTheBottom() {
        // Object.keys(this.i).forEach((path) => {
        //     let node = this.i[path]
        //     let isTerminal = node.isTerminal()
        //     let isMeta = node.isMeta()
        //     if (!isTerminal && !isMeta) {return false}
        // })
        return true
    }

    getNodeAtPath(path) {return this.i[path]}
    ensureNodeAtPath(path) {if (!this.i[path]) {this.i[path] = new IndexEntry(path)}}


    setNodeType(path, value) {
        this.ensureNodeAtPath(path)
        this.getNodeAtPath(path).data[TYPE_KEY] = value
    }
    getNodeType(path) {return this.getNodeAtPath(path).data[TYPE_KEY]}

    setNodeProperty(path, property, value) {
        this.ensureNodeAtPath(path)
        let node = this.getNodeAtPath(path)
        node.data[property] = value
    }
    getNodeProperty(path, property) {
        let node = this.getNodeAtPath(path)
        return node.data[property]
    }
    
    setNodePermission(path, permission) {
        this.ensureNodeAtPath(path)
        let node = this.getNodeAtPath(path)
        node.data[u.PERMISSION_KEY] = permission
    }
    getNodePermission(path) {
        let node = this.getNodeAtPath(path)
        return node.data[u.PERMISSION_KEY]
    }

    setDontDelete(path, dontDelete) {
        this.ensureNodeAtPath(path)
        let node = this.getNodeAtPath(path)
        if (dontDelete) {node.data['dontDelete'] = dontDelete}
        else {delete node.data['dontDelete']}
        
    }
    getDontDelete(path) {return this.getNodeProperty(path, 'dontDelete')}
    resetDontDelete() {Object.keys(this.i).forEach((path) => {this.setDontDelete(path, false)})}

    // Nukes everything below this, sets ref as spillover
    setSpillover(path, ref) {
        let node = this.getNodeAtPath(path)
        node.type(NT_SPILLOVER)
        this.setNodeProperty(path, 'spillover', ref)

        // TODO: kill above
    }
    
    isSpillover(path) {
        let node = this.getNodeAtPath(path)
        if (node.type() === NT_SPILLOVER) {
            return this.getNodeProperty(path, 'spillover')
        }
    }



    getNodePermission(path) {
        if (!path) {
            return 0
        }   
        path = u.packKeys(path)
        let node = this.getNodeAtPath(path)
        if (!node) {return null}
        let writtenPermission = node.permission()
        if (writtenPermission) {return writtenPermission}
        else {
            let parentPath = u.getParentPath(path)
            return (this.getNodePermission(parentPath))
        }
    }

    getMetaNodes() {
        let metaNodes = []
        Object.keys(this.i).forEach((path) => {
            if (this.i[path].isMeta() && (path !== u.INDEX_KEY)) {metaNodes.push(path)}
        })
        return metaNodes
    }

    getTerminalNodes() {
        let terminal = []
        Object.keys(this.i).forEach((path) => {
            if (this.i[path].isDefault() && (path !== u.INDEX_KEY)) {terminal.push(path)}
        })
        return terminal
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

    getOversizeNodes() {
        let oversize = []
        Object.keys(this.i).forEach((path) => {
            if (this.i[path].isOversize()) {
                oversize.push(path)
            }
        })
        return oversize
    }

    // Used for generic instantiation of all subNodes
    getAllVerticalPointers() {
        let vps = []
        Object.keys(this.i).forEach((path) => {
            let node = this.i[path]
            let pointer = node.getVerticalPointer()
            if (pointer) {vps.push(pointer)}
            let childrenPointers = node.getAllVerticalPointers()
            if (childrenPointers.length) {vps = vps.concat(childrenPointers)}
        })
        vps = u.dedupe(vps)
        return vps
    }

    setLateralExt(path, latExIDs) {
        this.i[path].type(u.NT_LATERAL_POINTER)
        this.i[path].data[LATERAL_POINTER_ARRAY_KEY] = latExIDs
        this.i[path].size(0)
        this.updateMetaNodes()
    }

    // AUDIT?
    getLateralPointers(path) {
        if ((this.i[path]) && (this.i[path].type() === u.NT_LATERAL_POINTER)) {
            return this.i[path].data[LATERAL_POINTER_ARRAY_KEY]
        }
    }

    getAllLateralPointers() {
        let allLateralPointers = []
        Object.keys(this.i).forEach((path) => {
            let lateralAtPath = this.getLateralPointers(path)
            if (lateralAtPath) {allLateralPointers = allLateralPointers.concat(lateralAtPath)}
        })
        return allLateralPointers
    }

    // Updates children and spillover pointers, recomputes, will handle downstream nodes needing deletion
    setVerticalPointer(pointer, paths) {
        paths.forEach((path) => {

            // Set the node to pointer type and set its pointer
            let node = this.i[path]
            node = node || new IndexNode(path)
            node.type(u.NT_VERTICAL_POINTER)
            node.data[POINTER_KEY] = node[POINTER_KEY] || {}
            node.data[POINTER_KEY] = pointer
            node.size(0)
            
            // Add child to parent, add spillover. DO WE WANT SPILLOVER? TEST WITH LOTS OF LAT KEYS
            let arrPath = u.stringPathToArrPath(path)
            arrPath.pop()
            let parentPath = u.arrayPathToStringPath(arrPath)
            let parentNode = this.i[u.INDEX_KEY]
            if (arrPath.length) {
                parentNode = this.i[parentPath]
            }
            parentNode.data[SPILLOVER_KEY] = node[SPILLOVER_KEY] || []
            if (!parentNode.data[SPILLOVER_KEY].includes(pointer)) {
                parentNode.data[SPILLOVER_KEY].push(pointer)
            }
            // parentNode.data[CHILDREN_KEY] = node[CHILDREN_KEY] || {}
            // parentNode.data[CHILDREN_KEY][path] = pointer
            
            this.updateMetaNodes()
            
            // THIS IS WRONG: CHILDREN GOES ON PARENT, POINTER ON CHILD
        })

    }

    // REMOVE VERTICAL POINTER? DELETING THINGS BACKTRACKING UPSTREAM?

    isLoaded() {return this.loaded}
    isOversize() {return this.i[u.INDEX_KEY].size() > u.MAX_NODE_SIZE}
    
    hasOversizeKeys() {
        if (this.getOversizeNodes().length) {return true}
    }

    getSize() {return this.i[u.INDEX_KEY].size()}
    
    parent(parent) {return this.i[u.INDEX_KEY].parent(parent)}
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

    get(key) {return this.data[key]}
    set(key, value) {this.data[key] = value}


    type(type) {return this.univGetSet(TYPE_KEY, type)}
    // pointer(pointer) {return this.univGetSet(POINTER_KEY, pointer)}
    s3Ref(s3Ref) {return this.univGetSet(S3_REF_KEY, s3Ref)}
    parent(parent) {return this.univGetSet('PARENT', parent)}
    permission(permission) {return this.univGetSet(PERMISSION_KEY, permission)}
    

    univGetSet(writableKey, value) {
        if (value) {this.data[writableKey] = value} 
        else {return this.data[writableKey]}
    }

    size(size) {
        if (size !== undefined) {
            if (this.isMeta()) {this.metadata.groupSize = size}
            else {this.data[SIZE_KEY] = size}
        } else {
            if (this.isDefault()) {return this.data[SIZE_KEY]} 
            else if (this.isMeta()) {return this.metadata.groupSize} 
            else {return 0}
        }
    }

    write(complete) {
        let ret = u.copy(this.data)
        if (complete) {
        
            // We don't store "default", but here we specify
            if (this.isDefault()) {
                ret[TYPE_KEY] = u.NT_DEFAULT
            }
        } 
        return ret
    }


    isOversize() {
        let isMeta = this.isMeta()
        let isOver = this.size() > (u.HARD_LIMIT_NODE_SIZE + u.INDEX_MARGIN)
        if (!isMeta && isOver) {return true}
    }
    getPath() {return this.metadata.path}

    getLateralPointers() {
        if (this.type() === u.NT_LATERAL_POINTER) {return this.data[LATERAL_POINTER_ARRAY_KEY]}
    }
    getVerticalPointer() {if (this.type() === u.NT_VERTICAL_POINTER) {return this.data[POINTER_KEY]}}

    // SUN AM NOTE TO SELF: CHANGE FORMAT IF WE KEEP NO CHILDREN_KEY
    getAllVerticalPointers() {
        let vps = []
        let pointer = this.getVerticalPointer()
        if (pointer) {vps.push(pointer)}

        // let childIDs = this.getChildIDs()
        // if (childIDs.length) {vps = vps.concat(childIDs)}

        // spillover?
        return vps
    }

    isDefault() {return (this.data[TYPE_KEY] === u.NT_DEFAULT) || (this.data[TYPE_KEY] === undefined)}
    isMeta() {return this.data[TYPE_KEY] === u.NT_META}
    
    // isVertical() {if (this.data[TYPE_KEY] === u.NT_VERTICAL_POINTER) {return this.data[POINTER_KEY]}}
    // isLateral() {if (this.data[TYPE_KEY] === u.NT_LATERAL_POINTER) {return this.data[LATERAL_POINTER_ARRAY_KEY]}}
}

module.exports = NodeIndex