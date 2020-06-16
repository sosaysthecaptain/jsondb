const LOGGING_ON = false
const LOG_METRICS = false

// const dynoItemSize = require('dyno-item-size')
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
u.INDEX_MARGIN = 5 * 1024
u.DEFAULT_CACHE_SIZE = 50 * 1024 * 1024
u.MAX_NESTING_DEPTH = 30

u.DEFAULT_SIGNED_LINK_SECONDS = 30

u.PK = 'uid'
u.SK = 'ts'

u.INDEX_KEY = 'META'
u.LARGE_EXT_INDEX = 'LARGE_EXT_INDEX'
u.LARGE_SERIALIZED_PAYLOAD = 'ENC'    
u.ARRAY_PACKAGE_PREFACE = 'META_ARRAY_'
u.PATH_SEPARATOR = '_x_'
u.PACKED_DESIGNATOR = 'XX'

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
u.MAX_PERMISSION = {read: 9, write: 9}
// u.DEFAULT_PERMISSION = 5
// u.DEFAULT_SENSITIVITY = 5
u.DEFAULT_PERMISSION = {read: 0, write: 0}
u.DEFAULT_SENSITIVITY = 0

u.DEFAULT_READ_PERMISSION = 5
u.DEFAULT_WRITE_PERMISSION = 5


u.TEST_TIMEOUT = 10 * 60 * 1000

u.DYNAMO_RESERVED_WORDS = ["ABORT","ABSOLUTE","ACTION","ADD","AFTER","AGENT","AGGREGATE","ALL","ALLOCATE","ALTER","ANALYZE","AND","ANY","ARCHIVE","ARE","ARRAY","AS","ASC","ASCII","ASENSITIVE","ASSERTION","ASYMMETRIC","AT","ATOMIC","ATTACH","ATTRIBUTE","AUTH","AUTHORIZATION","AUTHORIZE","AUTO","AVG","BACK","BACKUP","BASE","BATCH","BEFORE","BEGIN","BETWEEN","BIGINT","BINARY","BIT","BLOB","BLOCK","BOOLEAN","BOTH","BREADTH","BUCKET","BULK","BY","BYTE","CALL","CALLED","CALLING","CAPACITY","CASCADE","CASCADED","CASE","CAST","CATALOG","CHAR","CHARACTER","CHECK","CLASS","CLOB","CLOSE","CLUSTER","CLUSTERED","CLUSTERING","CLUSTERS","COALESCE","COLLATE","COLLATION","COLLECTION","COLUMN","COLUMNS","COMBINE","COMMENT","COMMIT","COMPACT","COMPILE","COMPRESS","CONDITION","CONFLICT","CONNECT","CONNECTION","CONSISTENCY","CONSISTENT","CONSTRAINT","CONSTRAINTS","CONSTRUCTOR","CONSUMED","CONTINUE","CONVERT","COPY","CORRESPONDING","COUNT","COUNTER","CREATE","CROSS","CUBE","CURRENT","CURSOR","CYCLE","DATA","DATABASE","DATE","DATETIME","DAY","DEALLOCATE","DEC","DECIMAL","DECLARE","DEFAULT","DEFERRABLE","DEFERRED","DEFINE","DEFINED","DEFINITION","DELETE","DELIMITED","DEPTH","DEREF","DESC","DESCRIBE","DESCRIPTOR","DETACH","DETERMINISTIC","DIAGNOSTICS","DIRECTORIES","DISABLE","DISCONNECT","DISTINCT","DISTRIBUTE","DO","DOMAIN","DOUBLE","DROP","DUMP","DURATION","DYNAMIC","EACH","ELEMENT","ELSE","ELSEIF","EMPTY","ENABLE","END","EQUAL","EQUALS","ERROR","ESCAPE","ESCAPED","EVAL","EVALUATE","EXCEEDED","EXCEPT","EXCEPTION","EXCEPTIONS","EXCLUSIVE","EXEC","EXECUTE","EXISTS","EXIT","EXPLAIN","EXPLODE","EXPORT","EXPRESSION","EXTENDED","EXTERNAL","EXTRACT","FAIL","FALSE","FAMILY","FETCH","FIELDS","FILE","FILTER","FILTERING","FINAL","FINISH","FIRST","FIXED","FLATTERN","FLOAT","FOR","FORCE","FOREIGN","FORMAT","FORWARD","FOUND","FREE","FROM","FULL","FUNCTION","FUNCTIONS","GENERAL","GENERATE","GET","GLOB","GLOBAL","GO","GOTO","GRANT","GREATER","GROUP","GROUPING","HANDLER","HASH","HAVE","HAVING","HEAP","HIDDEN","HOLD","HOUR","IDENTIFIED","IDENTITY","IF","IGNORE","IMMEDIATE","IMPORT","IN","INCLUDING","INCLUSIVE","INCREMENT","INCREMENTAL","INDEX","INDEXED","INDEXES","INDICATOR","INFINITE","INITIALLY","INLINE","INNER","INNTER","INOUT","INPUT","INSENSITIVE","INSERT","INSTEAD","INT","INTEGER","INTERSECT","INTERVAL","INTO","INVALIDATE","IS","ISOLATION","ITEM","ITEMS","ITERATE","JOIN","KEY","KEYS","LAG","LANGUAGE","LARGE","LAST","LATERAL","LEAD","LEADING","LEAVE","LEFT","LENGTH","LESS","LEVEL","LIKE","LIMIT","LIMITED","LINES","LIST","LOAD","LOCAL","LOCALTIME","LOCALTIMESTAMP","LOCATION","LOCATOR","LOCK","LOCKS","LOG","LOGED","LONG","LOOP","LOWER","MAP","MATCH","MATERIALIZED","MAX","MAXLEN","MEMBER","MERGE","METHOD","METRICS","MIN","MINUS","MINUTE","MISSING","MOD","MODE","MODIFIES","MODIFY","MODULE","MONTH","MULTI","MULTISET","NAME","NAMES","NATIONAL","NATURAL","NCHAR","NCLOB","NEW","NEXT","NO","NONE","NOT","NULL","NULLIF","NUMBER","NUMERIC","OBJECT","OF","OFFLINE","OFFSET","OLD","ON","ONLINE","ONLY","OPAQUE","OPEN","OPERATOR","OPTION","OR","ORDER","ORDINALITY","OTHER","OTHERS","OUT","OUTER","OUTPUT","OVER","OVERLAPS","OVERRIDE","CREATOR","PAD","PARALLEL","PARAMETER","PARAMETERS","PARTIAL","PARTITION","PARTITIONED","PARTITIONS","PATH","PERCENT","PERCENTILE","PERMISSION","PERMISSIONS","PIPE","PIPELINED","PLAN","POOL","POSITION","PRECISION","PREPARE","PRESERVE","PRIMARY","PRIOR","PRIVATE","PRIVILEGES","PROCEDURE","PROCESSED","PROJECT","PROJECTION","PROPERTY","PROVISIONING","PUBLIC","PUT","QUERY","QUIT","QUORUM","RAISE","RANDOM","RANGE","RANK","RAW","READ","READS","REAL","REBUILD","RECORD","RECURSIVE","REDUCE","REF","REFERENCE","REFERENCES","REFERENCING","REGEXP","REGION","REINDEX","RELATIVE","RELEASE","REMAINDER","RENAME","REPEAT","REPLACE","REQUEST","RESET","RESIGNAL","RESOURCE","RESPONSE","RESTORE","RESTRICT","RESULT","RETURN","RETURNING","RETURNS","REVERSE","REVOKE","RIGHT","ROLE","ROLES","ROLLBACK","ROLLUP","ROUTINE","ROW","ROWS","RULE","RULES","SAMPLE","SATISFIES","SAVE","SAVEPOINT","SCAN","SCHEMA","SCOPE","SCROLL","SEARCH","SECOND","SECTION","SEGMENT","SEGMENTS","SELECT","SELF","SEMI","SENSITIVE","SEPARATE","SEQUENCE","SERIALIZABLE","SESSION","SET","SETS","SHARD","SHARE","SHARED","SHORT","SHOW","SIGNAL","SIMILAR","SIZE","SKEWED","SMALLINT","SNAPSHOT","SOME","SOURCE","SPACE","SPACES","SPARSE","SPECIFIC","SPECIFICTYPE","SPLIT","SQL","SQLCODE","SQLERROR","SQLEXCEPTION","SQLSTATE","SQLWARNING","START","STATE","STATIC","STATUS","STORAGE","STORE","STORED","STREAM","STRING","STRUCT","STYLE","SUB","SUBMULTISET","SUBPARTITION","SUBSTRING","SUBTYPE","SUM","SUPER","SYMMETRIC","SYNONYM","SYSTEM","TABLE","TABLESAMPLE","TEMP","TEMPORARY","TERMINATED","TEXT","THAN","THEN","THROUGHPUT","TIME","TIMESTAMP","TIMEZONE","TINYINT","TO","TOKEN","TOTAL","TOUCH","TRAILING","TRANSACTION","TRANSFORM","TRANSLATE","TRANSLATION","TREAT","TRIGGER","TRIM","TRUE","TRUNCATE","TTL","TUPLE","TYPE","UNDER","UNDO","UNION","UNIQUE","UNIT","UNKNOWN","UNLOGGED","UNNEST","UNPROCESSED","UNSIGNED","UNTIL","UPDATE","UPPER","URL","USAGE","USE","USER","USERS","USING","UUID","VACUUM","VALUE","VALUED","VALUES","VARCHAR","VARIABLE","VARIANCE","VARINT","VARYING","VIEW","VIEWS","VIRTUAL","VOID","WAIT","WHEN","WHENEVER","WHERE","WHILE","WINDOW","WITH","WITHIN","WITHOUT","WORK","WRAPPED","WRITE","YEAR","ZONE"]


/* NODE & INDEXING UTILITIES */

// Use for reporting permission issues
u.report = (msg) => {
    console.log(msg)
}

u.flatten = (obj) => {
    return flatten(obj, {safe: true})
}

u.unflatten = (obj) => {
    return unflatten(obj)
}


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

// These are designed to be run only once, and to handle quirks of storage in dynamo
EMPTY_STRING_REPLACEMENT = 'XX_ES'
u.packValue = (value) => {
    if (value === '') {
        value = EMPTY_STRING_REPLACEMENT
    }

    return value
}

u.unpackValue = (value) => {
    if (value === EMPTY_STRING_REPLACEMENT) {
        value = ''
    }

    return value
}

u.packAttributes = (attributes) => {
    let attributeKeys = Object.keys(attributes)
    for (let i = 0; i < attributeKeys.length; i++) {
        let key = attributeKeys[i]
        let value = attributes[key]
        let packedKey = key
        let packedValue = u.packValue(value)
        delete attributes[key]
        attributes[packedKey] = packedValue
    }
    return attributes
}

u.unpackAttributes = (attributes) => {
    let attributeKeys = Object.keys(attributes)
    for (let i = 0; i < attributeKeys.length; i++) {
        let key = attributeKeys[i]
        let value = attributes[key]
        let unpackedKey = key
        let unpackedValue = u.unpackValue(value)
        delete attributes[key]
        attributes[unpackedKey] = unpackedValue
    }
    return attributes
}

u.HUMAN_READABLE = u.HUMAN_READABLE || true

u.stringContainsReservedWord = (string) => {
    upper = string.toUpperCase()
    for (let i = 0; i < u.DYNAMO_RESERVED_WORDS.length; i++) {
        let word = u.DYNAMO_RESERVED_WORDS[i]
        if (upper === word) {
            return true
        }
    }
}

u.isHumanReadableEncoded = (string) => {
    for (let i = 0; i < string.length; i+=2) {
        let shouldBeI = string[i+1]
        if (shouldBeI) {
            if (shouldBeI !== 'I') {return false}
        }
    }
    return true
}

u.encodeString = (string) => {
    if (!u.HUMAN_READABLE) {
        return base64url.encode(string)
    }
    if (u.stringContainsReservedWord(string)) {
        let encoded = ''
        for (let i = 0; i < string.length; i++) {
            encoded += string[i]
            encoded += 'I'
        }
        return encoded
    } else {
        return string
    }
}

u.decodeString = (string) => {
    if (!u.HUMAN_READABLE) {
        return base64url.decode(string)
    }
    if (u.isHumanReadableEncoded(string)) {
        let decoded = ''
        for (let i = 0; i < string.length; i+=2) {
            decoded += string[i]
        }
        return decoded
    } else {
        return string
    }
}

u.packKey = (key) => {
    if (key.slice(0, 2) === u.PACKED_DESIGNATOR) {
        return key
    }

    let components = key.split('.')
    let encodedComponents = []
    components.forEach(component => {
        let encodedComponent = u.encodeString(component)
        // let encodedComponent = base64url.encode(component)
        encodedComponents.push(u.PACKED_DESIGNATOR + encodedComponent)
    })
    return encodedComponents.join(u.PATH_SEPARATOR)
}

u.unpackKey = (key) => {
    if (key.slice(0, 2) !== u.PACKED_DESIGNATOR) {
        return key
    }

    let components = key.split(u.PATH_SEPARATOR)
    let decodedComponents = []
    components.forEach(component => {
        component = component.slice(2)
        // decodedComponent = base64url.decode(component)
        decodedComponent = u.decodeString(component)
        decodedComponents.push(decodedComponent)
    })
    return decodedComponents.join('.')
}

u.packKeys = (obj) => {
    if ((obj === true) || (obj === undefined)) {return obj}
    if (typeof obj === 'string') {
        return u.packKey(obj)
    }
    if (obj instanceof Array) {
        let newArr = []
        obj.forEach((path) => {
            path = u.packKey(path)
            newArr.push(path)
        })
        return newArr
    }
    
    Object.keys(obj).forEach((path) => {
        let value = obj[path]
        delete obj[path]
        path = u.packKey(path)
        obj[path] = value
    })
    return obj
}

u.unpackKeys = (obj) => {
    if (typeof obj === 'string') {
        return (u.unpackKey(obj))
    }
    if (obj instanceof Array) {
        let newArr = []
        obj.forEach((path) => {
            newArr.push(u.unpackKey(path))
        })
        return newArr
    }

    Object.keys(obj).forEach((path) => {
        let value = obj[path]
        delete obj[path]
        path = u.unpackKey(path)
        obj[path] = value
    })
    return obj
}

u.cleanup = (data, partitionKey, sortKey) => {
    partitionKey = partitionKey || u.PK
    sortKey = sortKey || u.SK
    
    delete data[partitionKey]
    delete data[sortKey]
    delete data[u.INDEX_KEY]
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
        let size = JSON.stringify(obj).length
        
        // let size = 0
        // Object.keys(obj).forEach((key) => {
        //     let value = obj[key]
        //     if (value.length) {
        //         size += value.length
        //     } else {
        //         size += JSON.stringify(obj).length
        //     }
        // })
        return size
    } catch(err) {
        return 0
    }
}

u.validateKeys = (attributes) => {
    Object.keys(attributes).forEach((path) => {
        let forbidden = [u.INDEX_KEY, u.PATH_SEPARATOR]
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
    // packageArray = (arr) => {
    //     if (arr instanceof Array) {
    //         return u.ARRAY_PACKAGE_PREFACE + JSON.stringify(arr)} else {return arr}
    // }
    // Object.keys(attributes).forEach((key) => {
    //     let value = attributes[key]
    //     if ((value instanceof Array)) {
    //         attributes[key] = packageArray(value)
    //     }
    // })
    return attributes
}

u.processReturn = (attributes) => {
    // unpackageArray = (package) => {
    //     package = package.slice(u.ARRAY_PACKAGE_PREFACE.length)
    //     return JSON.parse(package)
    // }

    // Object.keys(attributes).forEach((key) => {
    //     let value = attributes[key]
    //     if ((typeof value === 'string') && (value.startsWith(u.ARRAY_PACKAGE_PREFACE))) {
    //         attributes[key] = unpackageArray(value)
    //     }
    // })
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