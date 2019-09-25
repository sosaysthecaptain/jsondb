let LOGGING_ON = false
let LOG_METRICS = false

let dynoItemSize = require('dyno-item-size')

let u = {}

module.exports = u

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
    timedOperations[operation] = Date.now()
}

u.stopTime = (operation) => {
    let time = Date.now() - timedOperations[operation]
    delete timedOperations[operation]
    u.log(operation, {time})
}

u.getStringOfSize = (size) => {
    str = ''
    for (let i = 0; i < (size/10); i++) {
        str += 'abcdefghij'
    }
    return str
}

u.copy = (obj) => {
    return JSON.parse(JSON.stringify(obj))
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
        console.log(pathToHere)
        if (!u.pathExists(pathToHere, obj)) {
            debugger
            return pathToHere
        }
    }
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
