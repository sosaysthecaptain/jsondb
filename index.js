let jsondb = module.exports
jsondb.DBObject = require('./src/DBObject')
jsondb.DBObjectHandler = require('./src/DBObjectHandler')
jsondb.ScanQuery = require('./src/ScanQuery')

jsondb.DynamoClient = require('./src/DynamoClient')
jsondb.S3Client = require('./src/S3Client')