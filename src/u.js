const LOGGING_ON = false
const LOG_METRICS = false

const dynoItemSize = require('dyno-item-size')
const flatten = require('flat')
const unflatten = require('flat').unflatten
const uuidv4 = require('uuid/v4')
const base64url = require('base64url')
const _ = require('lodash')


const u = {}

module.exports = u

u.HARD_LIMIT_NODE_SIZE = 395 * 1024
u.MAX_NODE_SIZE = 300 * 1024
u.IDEAL_NODE_SIZE = 200 * 1024
u.MAXIMUM_CACHE_SIZE = 50 * 1024 * 1024
u.DEFAULT_PERMISSION_LEVEL = 0
u.MAX_NESTING_DEPTH = 30

u.INDEX_PREFIX = 'META'
u.PERMISSION_PREFIX = 'P'
u.SIZE_PREFIX = 'S'
u.GROUP_SIZE_PREFIX = 'SG'
u.EXT_PREFIX = 'EXT'                // denotes meta node and specifies pointer to further children
u.EXT_CHILDREN_PREFIX = 'CHILDREN'

u.NODE_TYPE_KEY = 'META_TYPE'
u.TYPE_LATERAL_SPLIT = 'LAT_SPLIT'
u.TYPE_COLLECTION = 'COL'
u.TYPE_FILE_LINK = 'FILE_LINK'
u.TYPE_FILE_BUFFER = 'FILE_BUF'
u.TYPE_REFERENCE ='REF'


u.LARGE_EXT_PREFIX = 'META_LARGE_EXT'    // NEXT UP: kill this, replace with above
u.LARGE_EXT_INDEX = 'LARGE_EXT_INDEX'

u.LARGE_SERIALIZED_PAYLOAD = 'ENC'    
u.PATH_SEPARATOR = '__'


u.NT_DEFAULT = 'DEFAULT'                    // default terminal node (get node)
u.NT_META = 'META'                          // meta node (get children)
u.NT_VERTICAL_POINTER = 'VP'                // specific vertical pointer ()
u.NT_VERTICAL_NONSPECIFIC = 'VP_NONSPEC'    // possible vertical pointer
u.NT_LAT_POINTER = 'LP'                     // large, laterally-extended node
u.NT_COLLECTION = 'COLLECT'                 // collection
u.NT_FILE_LINK = 'FILE_LINK'                // file, link
u.NT_FILE_BUFFER = 'FILE_BUF'               // file, buffer
u.NT_REF = 'REF'                            // reference to another DBObject


/* NODE & INDEXING UTILITIES */

u.getNodeData = (path, index) => {
    let indexNode = index[path]
    let data = {
        type: u.NT_DEFAULT,
        size: indexNode[u.SIZE_PREFIX],
        permission: u.DEFAULT_PERMISSION_LEVEL,                 // TODO
        content: null,
        pointer: null,
        s3Link: null,

    }
    
    // Data not stored here
    if (!indexNode) {
        return undefined
    }
    
    // Lateral pointer
    if (!indexNode[u.NOTE_TYPE_KEY] === u.NT_META) {
        data.type = u.NT_META
        data.size = indexNode[u.GROUP_SIZE_PREFIX]
    }
    
    // Vertical pointer
}

u.isMetaPath = (path, index) => {
    if ((index[path][u.EXT_PREFIX] !== undefined) && (path !== u.INDEX_PREFIX)) {
        return true
    }
}

u.isTerminalPath = (index) => {
    if (index[key][u.SIZE_PREFIX]  && (key !== u.INDEX_PREFIX)) {
        return true
    }
}

u.getMetaIndexPaths = (index) => {
    let metaPaths = []
    Object.keys(index).forEach((key) => {
        if (u.isMetaPath(key, index)) {
            metaPaths.push(key)
        }
    })
    return metaPaths
}

u.getTerminalIndexPaths = (index) => {
    let terminalPaths = []
    Object.keys(index).forEach((key) => {
        if (u.isTerminalPath(key, index)) {
            terminalPaths.push(key)
        }
    })
    return terminalPaths
}

// Excludes intermediate
u.getChildren = (attributePath, parentObj) => {
    let childKeys = []
    if (attributePath === '') {
        return Object.keys(parentObj)
    }

    Object.keys(parentObj).forEach((key) => {
        if (key.startsWith(attributePath) && (key !== attributePath)) {
            if (!parentObj[key][u.GROUP_SIZE_PREFIX]) {
                childKeys.push(key)
            }
        }
    })
    return childKeys
}

// Sums sizes of terminal nodes. Only terminal nodes have sizes
u.getSizeOfNodeAtPath = (attributePath, index) => {
    let nodePaths = u.getChildren(attributePath, index)
    let size = 0
    nodePaths.forEach((path) => {
        if (index[path][u.SIZE_PREFIX]) {
            size += index[path][u.SIZE_PREFIX]
        }
    })
    return size
}

u.getIntermediatePaths = (obj) => {
    let usesSeparator = false
    let intermediateKeys = []
    let keys = Object.keys(obj)
    keys.forEach((key) => {
        if (key.includes(u.PATH_SEPARATOR)) {
            usesSeparator = true
        }
        let arrPath = u.stringPathToArrPath(key)
        while(arrPath.length) {
            arrPath.pop()
            if (arrPath.length) {
                let parentPath = u.arrayPathToStringPath(arrPath, usesSeparator)
                if (!intermediateKeys.includes(parentPath)) {
                    intermediateKeys.push(parentPath)
                }
            }
        }
    })
    return intermediateKeys
}

u.getVerticalPointers = (index, idsOnly) => {
    let pointers = {}
    let metaPaths = u.getMetaIndexPaths(index)
    metaPaths.forEach((path) => {
        let node = index[path]
        if (node[u.EXT_PREFIX]) {
            pointers[path] = node[u.EXT_PREFIX]
        }
        if (node[u.EXT_CHILDREN_PREFIX]) {
            children = node[u.EXT_CHILDREN_PREFIX]
            pointers = _.assign({}, pointers, children)
        }
    })
    if (!idsOnly) {
        return pointers
    }
    let ids = Object.values(pointers)
    ids = u.dedupe(ids)
    return ids
}

u.getLateralPointers = (index, idsOnly) => {
    let paths = Object.keys(index)
    let pointers = {}
    let ids = []
    paths.forEach((path) => {
        let arrPath = u.stringPathToArrPath(path)
        let finalKey = arrPath.pop()
        if (finalKey = u.LARGE_EXT_PREFIX) {
            if (index[path][u.LARGE_EXT_PREFIX]) {
                pointerArray = index[path][u.LARGE_EXT_PREFIX]
                pointers[path] = pointerArray
                ids = ids.concat(pointerArray)

            }
        }
    })

    if (idsOnly) {
        ids = u.dedupe(ids)
        return ids
    }
    return pointers
}

u.updateIndex = (index) => {

    // Add any intermediate paths that don't exist yet. For those that do exist, erase their
    // size, as we'll recalculate it
    let intermediatePaths = u.getIntermediatePaths(index)
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

/* SMALLER UTILITIES */

u.log = (message, data) => {
    if (LOGGING_ON) {
        console.log(message)
        if (data) {
            console.log(data)
        }
    }
}

let timedOperations = {}
u.startTime = (operation) => {
    if (LOG_METRICS) {
        u.log('beginning ' + operation)
        timedOperations[operation] = Date.now()
    }
}

u.stopTime = (operation, data) => {
    if (LOG_METRICS) {
        let time = Date.now() - timedOperations[operation]
        u.log(`completed ${operation} in ${time} ms`, data)
        u.log(' ')
        delete timedOperations[operation]
    }
}

u.copy = (obj) => {
    return JSON.parse(JSON.stringify(obj))
}

// No hyphens, since we split the id on hyphen
u.uuid = () => {
    let uuid = uuidv4()
    uuid = u.replace(uuid, '-', '0')
    return uuid
}

u.replace = (string, toReplace, toReplaceWith) => {
    while(string.includes(toReplace)) {
        string = string.replace(toReplace, toReplaceWith)
    }
    return string
}

u.encode = (obj) => {
    return base64url.encode(JSON.stringify(obj))
}

u.decode = (base64) => {
    let stringified = base64url.decode(base64)
    return JSON.parse(stringified)
}

u.keyFromID = (id) => {
    let key = {
        uid: id.split('-')[0],
        ts: id.split('-')[1] || 0
    }
    return key
}

u.packKeys = (obj) => {
    if (typeof obj === 'string') {
        return (u.replace(obj, '.', u.PATH_SEPARATOR))
    }
    if (obj instanceof Array) {
        let newArr = []
        obj.forEach((path) => {
            newArr.push(u.replace(path, '.', u.PATH_SEPARATOR))
        })
        return newArr
    }
    
    Object.keys(obj).forEach((path) => {
        let value = obj[path]
        delete obj[path]
        path = u.replace(path, '.', u.PATH_SEPARATOR)
        obj[path] = value
    })
    return obj
}

u.unpackKeys = (obj) => {
    if (typeof obj === 'string') {
        return (u.replace(obj, u.PATH_SEPARATOR, '.'))
    }
    if (obj instanceof Array) {
        let newArr = []
        obj.forEach((path) => {
            newArr.push(u.replace(path, u.PATH_SEPARATOR, '.'))
        })
        return newArr
    }

    Object.keys(obj).forEach((path) => {
        let value = obj[path]
        delete obj[path]
        path = u.replace(path, u.PATH_SEPARATOR, '.')
        obj[path] = value
    })
    return obj
}

u.getAttribute = (obj, p) => {
    try{
        if (p.length === 0) {
            return obj
        } else if (p.length === 1) {
            return obj[p[0]]
        } else if (p.length === 2) {
            return obj[p[0]][p[1]]
        } else if (p.length === 3) {
            return obj[p[0]][p[1]][p[2]]
        } else if (p.length === 4) {
            return obj[p[0]][p[1]][p[2]][p[3]]
        } else if (p.length === 5) {
            return obj[p[0]][p[1]][p[2]][p[3]][p[4]]
        } else if (p.length === 6) {
            return obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]]
        } else if (p.length === 7) {
            return obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]][p[6]]
        } else if (p.length === 8) {
            return obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]][p[6]][p[7]]
        } else if (p.length === 9) {
            return obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]][p[6]][p[7]][p[8]]
        } else if (p.length === 10) {
            return obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]][p[6]][p[7]][p[8]][p[9]]
        } else if (p.length === 11) {
            return obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]][p[6]][p[7]][p[8]][p[9]][p[10]]
        }
    } catch (err) {
        return undefined
    }
}

u.getSize = (obj) => {
    try {
        if (obj.length) {
            return obj.length
        }
        let size = 0
        Object.keys(obj).forEach((key) => {
            let value = obj[key]
            if (value.length) {
                size += value.length
            } else {
                size += JSON.stringify(obj).length
            }
        })
        return size
    } catch(err) {
        return 0
    }
}

u.validateKeys = (attributes) => {
    Object.keys(attributes).forEach((path) => {
        let forbidden = [u.INDEX_PREFIX, u.PATH_SEPARATOR]
        let arrPath = u.stringPathToArrPath(path)
        arrPath.forEach((part) => {
            forbidden.forEach((forbiddenString) => {
                if (part.includes(forbiddenString))
                throw new Error(`Disallowed key: ${path} -- keys may not contain ${forbiddenString}`)
            })
        })
    })
}

u.stringPathToArrPath = (path) => {
    if (typeof path === 'object') {
        return path
    }
    if (path === '') {
        return []
    } else if (path.includes(u.PATH_SEPARATOR)) {
        return path.split(u.PATH_SEPARATOR)
    } else {
        return path.split('.')
    }
}

u.arrayPathToStringPath = (path, usePathSeparator) => {
    if (typeof path === 'string') {
        return path
    }
    if (!usePathSeparator) {
        return path.join('.')
    } else {
        return path.join(u.PATH_SEPARATOR)
    }
}

// u.getPathDepth = (path) => {
//     let arrPath = u.stringPathToArrPath(path)
//     return arrPath.length
// }

// u.getKeysByOrder = (obj) => {
//     let keys = u.getKeysByDepth(obj, true)
//     let sortedByOrder = {}
//     keys.forEach((path) => {
//         path = u.stripMeta(path)
//         let depth = u.getPathDepth(path)

//         if (!sortedByOrder[depth]) {
//             sortedByOrder[depth] = []
//         }
//         sortedByOrder[depth].push(path)
//     })
//     return sortedByOrder
// }



u.generateNewID = (withTimestamp) => {
    let id = u.uuid()
    if (withTimestamp) {
        id += '-' + Date.now()
    } 
    return id
}

u.dedupe = (arr) => {
    let unique = {}
    arr.forEach((entry) => {
        if (!unique[entry]) {
            unique[entry] = true
        }
    })
    return Object.keys(unique)
}
