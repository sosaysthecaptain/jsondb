/*
Testing entry point, create a config.js to enter AWS credentials
*/

let jsondb = require('./index')
let ScanQuery = require('./src/ScanQuery')
let DynamoClient = require('./src/DynamoClient')
let config = require('./config')

// let myDBObjectHandler = new jsondb.DBObjectHandler({
//     awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
//     awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
//     awsRegion: config.AWS_REGION,
//     tableName: 'object_dev_v2'
// })




let dynamoClientTestAsyncWrapper = (async () => {
    let dynamo_client = new DynamoClient({
        awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        awsRegion: config.AWS_REGION
    })
    
    let testGet = async () => {
        try {
            let data = await dynamo_client.get({
                tableName: 'jsondb_test',
                key: {
                    id: 'id_from_tester'
                },
                // attributes: ['key1']
            })
            console.log(data)
        } catch(err) {
            console.error('Something bad')
            console.error(err)
        }
    }

    // let testUpdate = async () => {

    //     let original_attributes = {
    //         key1: {
    //             subkey1: "please don't change me",
    //             subkey2: 'but do change me'
    //         },
    //         key2: ['asdsad', 'dfdfdsfsdfd', 42, 34]
    //     }

    //     let new_attributes = {
            
    //     }
      
    //     let data = await dynamo_client.update({
    //         tableName: 'jsondb_test',
    //         key: {
    //             id: 'nested_object'
    //         },
    //         attributes: original_attributes,
    //         doNotOverwrite: false
    //     })
    //     console.log(data)
    // }

    let testUpdate = async () => {

        let original_attributes = {
            key1: {
                subkey1: "please don't change me",
                subkey2: 'but do change me'
            },
            key2: ['asdsad', 'dfdfdsfsdfd', 42, 34]
        }

        let new_attributes = {
            'key1.subkey2': 'changed automatically a second time'
        }
      
        let data = await dynamo_client.update({
            tableName: 'jsondb_test',
            key: {
                id: 'nested_object'
            },
            // attributes: original_attributes,
            attributes: new_attributes,
            doNotOverwrite: false
        })
        console.log(data)
    }



    // CALL TEST FUNCTIONS HERE
    try {
        // await testGet()
        await testUpdate()



    } catch(err) {
        console.error(err)
    }    

})()
    
