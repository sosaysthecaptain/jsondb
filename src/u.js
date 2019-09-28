const LOGGING_ON = false
const LOG_METRICS = false

const dynoItemSize = require('dyno-item-size')
const flatten = require('flat')
const unflatten = require('flat').unflatten
const uuidv4 = require('uuid/v4')


const u = {}

module.exports = u

u.HARD_LIMIT_NODE_SIZE = 395 * 1024
u.MAX_NODE_SIZE = 300 * 1024
u.IDEAL_NODE_SIZE = 200 * 1024
u.MAXIMUM_CACHE_SIZE = 50 * 1024 * 1024
u.DEFAULT_PERMISSION_LEVEL = 0

u.INDEX_PREFIX = 'i'
u.SIZE_PREFIX = 's'
u.LATERAL_PREFIX = 'l'
u.CHILREDN_PREFIX = 'c'
u.PERMISSION_PREFIX = 'p'

u.log = (message, {data}, type) => {
    if (LOGGING_ON) {
        console.log(message)
        console.log(data)
    }
    
    if (data.time && LOG_METRICS) {
        console.log(`time of ${message}: ${data.time}`)
    }
}

let timedOperations = {}
u.startTime = (operation) => {
    if (LOG_METRICS) {
        timedOperations[operation] = Date.now()
    }
}

u.stopTime = (operation) => {
    if (LOG_METRICS) {
        let time = Date.now() - timedOperations[operation]
        delete timedOperations[operation]
        u.log(operation, {time})
    }
}

u.getStringOfSize = (size) => {
    let str = ''
    let strSize = 0
    while(strSize < size) {
        for (let i = 0; i < 100; i++) {
            str += Math.random() + ' '
        }
        strSize = u.getSize(str)
    }
    let lastIndex = str.length - (str.length * ((strSize / size) % 1))
    return str.slice(0, lastIndex)
}

u.copy = (obj) => {
    return JSON.parse(JSON.stringify(obj))
}

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

// Where path is array of props
u.setAttribute = ({obj, path, value}) => {
    let p = path
    try {
        if (p.length === 0) {
            obj = value
        } else if (p.length === 1) {
            obj[p[0]] = value
        } else if (p.length === 2) {
            obj[p[0]][p[1]] = value
        } else if (p.length === 3) {
            obj[p[0]][p[1]][p[2]] = value
        } else if (p.length === 4) {
            obj[p[0]][p[1]][p[2]][p[3]] = value
        } else if (p.length === 5) {
            obj[p[0]][p[1]][p[2]][p[3]][p[4]] = value
        } else if (p.length === 6) {
            obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]] = value
        } else if (p.length === 7) {
            obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]][p[6]] = value
        } else if (p.length === 8) {
            obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]][p[6]][p[7]] = value
        } else if (p.length === 9) {
            obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]][p[6]][p[7]][p[8]] = value
        } else if (p.length === 10) {
            obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]][p[6]][p[7]][p[8]][p[9]] = value
        } else if (p.length === 11) {
            obj[p[0]][p[1]][p[2]][p[3]][p[4]][p[5]][p[6]][p[7]][p[8]][p[9]][p[10]] = value
        }
    } catch(err) {
        return false
    }
    return value
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

// dynoItemSize ckokes on null, etc
u.getSize = (obj) => {
    try {
        return dynoItemSize(obj)
    } catch(err) {
        return 0
    }
}

u.isValueTerminal = (value) => {
    return (typeof value) !== 'object'
}

// True in all cases except undefined
u.pathExists = (path, obj) => {
    if (!path.length) {
        return false
    }
    let topmost = u.copy(obj)
        
    let _path = u.copy(path)
    for (let i = 0; i < path.length; i++) {
        let nextKey = _path.shift()
        if (topmost[nextKey] !== undefined) {
            topmost = topmost[nextKey]
        } else {
            return false
        }
    }
    return true
}

// Iterates through path until we find the first one that exists, then return the one before that
u.findLowestLevelDNE = (path, obj) => {
    for (let i = 0; i < path.length; i++) {
        // let pathToHere = JSON.parse(JSON.stringify(path)).slice(0, i+1)
        let pathToHere = path.slice(0, i+1)
        if (!u.pathExists(pathToHere, obj)) {
            return pathToHere
        }
    }
}

u.listAllSubkeys = (dotSeparatedPath, obj) => {
    let flattened = flatten(obj)
    let subkeys = []
    Object.keys(flattened).forEach((key) => {
        if (key.includes(dotSeparatedPath)) {
            subkeys.push(key)
        }
    })
    return subkeys
}

u.getKeysByDepth = (obj, deepestFirst) => {
    let flattened = flatten(obj)
    let sortable = []
    Object.keys(flattened).forEach((key) => {
        sortable.push([key, key.split('.').length])
    })
    sortable.sort((a, b) => {
        return (a[1] > b[1])
    })
    if (deepestFirst) {
        sortable.reverse()
    }
    let sorted = []
    sortable.forEach((a) => {
        if (u.isKeyValid(a[0])) {
            sorted.push(a[0])
        }
    })
    return sorted
}

u.isKeyValid = (key) => {
    if (key.length > 1) {
        return true
    }
}

u.validateKeys = (attributes) => {
    Object.keys(attributes).forEach((path) => {
        let parts = path.split('.')
        parts.forEach((part) => {
            if (part.length === 1) {
                throw new Error(`Disallowed key: ${path} -- single letter keys are reserved for system use`)
            }
        })
    })
}

u.stripMeta = (key) => {
    if (key.slice(-2, -1) === '.') {
        key = key.slice(0, -2)
    }
    return key
}

u.stringPathToArrPath = (path) => {
    if (typeof path === 'object') {
        return path
    }
    if (path === '') {
        return []
    } else {
        return path.split('.')
    }
}

u.arrayPathToStringPath = (path) => {
    if (typeof path === 'string') {
        return path
    }
    return path.join('.')
}

u.getPathDepth = (path) => {
    let arrPath = u.stringPathToArrPath(path)
    return arrPath.length
}

u.getKeysByOrder = (obj) => {
    let keys = u.getKeysByDepth(obj, true)
    let sortedByOrder = {}
    keys.forEach((path) => {
        path = u.stripMeta(path)
        let depth = u.getPathDepth(path)

        if (!sortedByOrder[depth]) {
            sortedByOrder[depth] = []
        }
        sortedByOrder[depth].push(path)
    })
    return sortedByOrder
}

u.buildExhaustiveTree = (obj) => {

}

u.getAncestors = (key, parentObj) => {

}

u.getChildren = (attributePath, parentObj) => {
    let childKeys = []
    if (attributePath === '') {
        return Object.keys(parentObj)
    }

    Object.keys(parentObj).forEach((key) => {
        if (key.includes(attributePath) && (key !== attributePath)) {
            childKeys.push(key)
        }
    })
    return childKeys
}

// Requires flattened, sums all '.s' nodes inside
u.getSizeOfNodeAtPathOLD = (attributePath, index) => {
    let nodePaths = u.getChildren(attributePath, index)
    let size = 0
    nodePaths.forEach((path) => {
        if (path.slice(-1) === 's') {
            size += index[path]
        }
    })
    return size
}

u.getSizeOfNodeAtPath = (attributePath, index) => {
    let nodePaths = u.getChildren(attributePath, index)
    let size = 0
    nodePaths.forEach((path) => {
        if (index[path].s) {
            size += index[path][u.SIZE_PREFIX]
        }
    })
    return size
}



u.generateNewID = (withTimestamp) => {
    let id = u.uuid()
    if (withTimestamp) {
        id += '-' + Date.now()
    } 
    return id
}


// Returns array of keys
u.sortObj = (obj, fn, reverse) => {
    let sortable = []
    Object.keys(obj).forEach((key) => {
        sortable.push([key, obj[key]])
    })
    sortable.sort(fn)
    if (reverse) {
        sortable.reverse()
    }
    // let sorted = {}
    let sorted = []
    sortable.forEach((a) => {
        let key = a[0]
        let value = a[1]
        sorted.push(key)
        // let value = obj[a[0]]
        // sorted[key] = value
    })
    return sorted
}



// // Recursively walks object, 
// u.deepTransformKeys = ({obj, shouldTransformKVPair, getNewKey, getNewValue}) => {
//     getNewKey = getNewKey || ((key) => key)
//     getNewValue = getNewValue || ((value) => value)
            
//     if (obj && typeof obj === 'object') {
//         let allKeys = Object.keys(obj)
//         for(let i = 0; i < allKeys.length; i++) {
//             let parent = obj
//             let key = allKeys[i]
//             let value = obj[key]
//             let newKey, newValue

//             // If not a single-letter key, this is data that needs to go in d, with attendent other metadata
//             if (key.length > 1) {
//                 obj['d'] = value
//                 delete obj[key]

//             } 
            
//             // If this a single-letter key, it's metadata, and we don't touch it. 
//             else {
//                 newKey = key
//                 newValue = value
//                 u.deepTransformKeys({obj: obj[newKey], shouldTransformKVPair, getNewKey, getNewValue})
//             }

//             // If the property we just changed was an object, apply this function recursively to it
//             if (typeof obj[newKey] === 'object') {
//                 u.deepTransformKeys({obj: obj[newKey], shouldTransformKVPair, getNewKey, getNewValue})
//             }


//             // If appropriate, replace obj[key] with new key-value pair
//             if (shouldTransformKVPair(key, value, parent)) {
//                 let newKey = getNewKey(key)
//                 let newValue = getNewValue(value)
//                 obj[newKey] = newValue
//                 delete obj[key]
//             }

//             // If the property we just changed was an object, apply this function recursively to it
//             if (typeof obj[newKey] === 'object') {
//                 u.deepTransformKeys({obj: obj[newKey], shouldTransformKVPair, getNewKey, getNewValue})
//             }
//         }
//     }
//     return obj
// }
