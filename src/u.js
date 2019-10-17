const LOGGING_ON = false
const LOG_METRICS = false

// const dynoItemSize = require('dyno-item-size')
// const flatten = require('flat')
// const unflatten = require('flat').unflatten
const uuidv4 = require('uuid/v4')
const base64url = require('base64url')
const _ = require('lodash')


const u = {}

module.exports = u

u.HARD_LIMIT_NODE_SIZE = 395 * 1024
u.MAX_NODE_SIZE = 300 * 1024
u.IDEAL_NODE_SIZE = 200 * 1024
u.INDEX_MARGIN = 5 * 1024
u.DEFAULT_CACHE_SIZE = 50 * 1024 * 1024
u.DEFAULT_sensitivity_LEVEL = 0
u.MAX_NESTING_DEPTH = 30

u.PK = 'uid'
u.SK = 'ts'

u.INDEX_KEY = 'META'
u.LARGE_EXT_INDEX = 'LARGE_EXT_INDEX'
u.LARGE_SERIALIZED_PAYLOAD = 'ENC'    
u.ARRAY_PACKAGE_PREFACE = 'META_ARRAY_'
u.PATH_SEPARATOR = '__'

u.NT_DEFAULT = 'D'                          // default terminal node (get node)
u.NT_META = 'M'                             // meta node (get children)
u.NT_VERTICAL_POINTER = 'VP'                // specific vertical pointer ()
u.NT_LATERAL_POINTER = 'LP'                 // large, laterally-extended node
u.NT_COLLECTION = 'COL'                     // collection
u.NT_S3REF = 'S3'                           // s3 file
u.NT_REF = 'REF'                            // reference to another DBObject

u.MEMBERS = 'MEMBERS'
u.CREATOR = 'CREATOR'
u.CREATED_DATE = 'C_TS'
u.MAX_PERMISSION = 9
u.DEFAULT_PERMISSION = 5


u.TEST_TIMEOUT = 10 * 60 * 1000


/* NODE & INDEXING UTILITIES */


// Excludes intermediate
u.getChildren = (attributePath, parentObj) => {
    let childKeys = []
    if (attributePath === '') {
        return Object.keys(parentObj)
    }

    Object.keys(parentObj).forEach((key) => {
        if (key.startsWith(attributePath) && (key !== attributePath)) {
            childKeys.push(key)
        }
    })
    return childKeys
}

// For instance, {key: {subkey: 'sdfsdfs'}} => ['key', 'key.subkey']
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


/* SMALLER UTILITIES */

u.log = (message, data) => {
    if (LOGGING_ON) {
        console.log(message)
        if (data) {
            console.log(data)
        }
    }
}

u.dbg = () => {if (u.flag) {debugger}}

u.error = (msg, err) => {
    console.log(msg)
    console.log(err)
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
    let key = {}
    key[u.PK] = id.split('-')[0]
    key[u.SK] = Number(id.split('-')[1] || 0)
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

// This is a mess but better than most of the alternatives
u.getSize = (obj) => {
    try {
        // Strings/buffers -> length
        if (obj.length) {
            return obj.length
        }

        // Numbers -> stringified length
        if (typeof obj === 'number') {
            return JSON.stringify(obj).length
        }

        // Objects -> stringified length of each
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
        let forbidden = [u.INDEX_KEY, u.PATH_SEPARATOR, 'array', 'index', 'file']
        let arrPath = u.stringPathToArrPath(path)
        arrPath.forEach((part) => {
            forbidden.forEach((forbiddenString) => {
                if (part.toLowerCase().includes(forbiddenString))
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

u.getParentPath = (path) => {
    let arrPath = u.stringPathToArrPath(path)
    arrPath.pop()
    if (arrPath.length) {
        return u.arrayPathToStringPath(arrPath)
    }
}

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

// JS arrays don't play nicely with flatten or dynamo, so we package them into strings
u.processAttributes = (attributes) => {
    packageArray = (arr) => {
        if (arr instanceof Array) {
            return u.ARRAY_PACKAGE_PREFACE + JSON.stringify(arr)} else {return arr}
    }
    Object.keys(attributes).forEach((key) => {
        let value = attributes[key]
        if ((value instanceof Array)) {
            attributes[key] = packageArray(value)
        }
    })
    return attributes
}

u.processReturn = (attributes) => {
    unpackageArray = (package) => {
        package = package.slice(u.ARRAY_PACKAGE_PREFACE.length)
        return JSON.parse(package)
    }

    Object.keys(attributes).forEach((key) => {
        let value = attributes[key]
        if ((typeof value === 'string') && (value.startsWith(u.ARRAY_PACKAGE_PREFACE))) {
            attributes[key] = unpackageArray(value)
        }
    })
    return attributes
}

/* TEST UTILS */

u.getVerifiableString = (length, multiplier) => {
    multiplier = multiplier || 1
    let str = ''
    let i = 0
    while(str.length < length) {
        str += String(i * multiplier) + ' '
        i++
    }
    return str.trim()
}

u.verifyString = (str, multiplier) => {
    multiplier = multiplier || 1
    let split = str.split(' ')
    let index = 0
    split.forEach((num) => {
        num = Number(num)
        if (num !== index * multiplier) {
            return false
        }
        index++
    })
    if (index !== split.length) {
        return false
    }
    return true
}