let u = {}

u.getStringOfSize = (size) => {
    str = ''
    for (let i = 0; i < (size/10); i++) {
        str += 'abcdefghij'
    }
    return str
}

// Recursively walks object, 
u.deepTransformKeys = (obj, transformValue, valueShouldBeModified) => {
    if (obj && typeof obj === 'object') {
        let allKeys = Object.keys(obj)
        for(let i = 0; i < allKeys.length; i++) {
            let key = allKeys[i]
            let value = obj[key]
            obj[key] = transformValue(key, value, parent)
        if (typeof obj[key] === 'object') {
            u.deepTransformKeys(obj[key], replaceValue, keyShouldBeModified)
        }
    }
    return obj
}

module.exports = u