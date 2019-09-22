/*
Testing entry point, create a config.js to enter AWS credentials
*/

let jsondb = require('./index')
let ScanQuery = require('./src/ScanQuery')
let DynamoClient = require('./src/DynamoClient')
let config = require('./config')

let myDBObjectHandler = new jsondb.DBObjectHandler({
    awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    awsRegion: config.AWS_REGION,
    tableName: 'object_dev_v2'
})

let dynamo_client = new DynamoClient({
    awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    awsRegion: config.AWS_REGION
})



let async_wrapper = (async () => {

    // Testing update
    try {
        let data = await dynamo_client.update({
            tableName: 'jsondb_test',
            key: {
                id: 'id_from_tester'
            },
            attributes: {
                key1: 'this is being added',
                key2: 'through DynamoClient.update'
            },
        })
        console.log(data)
    } catch(err) {
        console.error('Something bad')
        console.error(err)
    }
})()
    

        

// let res = await dynamo_client.update({
//     tableName: 'object_dev_v2',
//     key: 'demo_object_1',
//     params: {
//         key_1: "I'm going in the db"
//     }
// })

