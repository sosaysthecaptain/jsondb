let u = {}

module.exports = u

u.getStringOfSize = (size) => {
    str = ''
    for (let i = 0; i < (size/10); i++) {
        str += 'abcdefghij'
    }
    return str
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
