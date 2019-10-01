/*
Testing entry point, create a config.js to enter AWS credentials
*/

let jsondb = require('./index')
let ScanQuery = require('./src/ScanQuery')
let DynamoClient = require('./src/DynamoClient')
let config = require('./config')
let u = require('./src/u')

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
                    id: 'series_1'
                },
                // attributes: ['key1']
            })
            console.log(data)
        } catch(err) {
            console.error('Something bad')
            console.error(err)
        }
    }
    
    let testGetRange = async () => {
        try {
            let data = await dynamo_client.getRange({
                tableName: 'jsondb_test_2',
                uid: 'series_1',
                skStart: 0,
                skEnd: 200,
                ascending: false
                
                // attributes: ['key1']
            })
            console.log(data)
        } catch(err) {
            console.error('Something bad')
            console.error(err)
        }
    }
    
    let testGetPagewise = async () => {
        try {
            let data = await dynamo_client.getPagewise({
                tableName: 'jsondb_test_2',
                uid: 'series_1',
                exclusiveFirstSk: 124,
                limit: 2,
                ascending: true
            })
            console.log(data)
        } catch(err) {
            console.error('Something bad')
            console.error(err)
        }
    }

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
            tableName: 'jsondb_test_3',
            key: {
                uid: 'tues_850',
                ts: 0
            },
            // attributes: original_attributes,
            attributes: new_attributes,
            doNotOverwrite: false
        })
        console.log(data)
    }

    let testUpdateOrdered = async () => {
        let data = await dynamo_client.update({
            tableName: 'jsondb_test_ordered',
            key: {
                id: 'series_1',
                timestamp: Date.now()
                // timestamp: 0
            },
            // attributes: original_attributes,
            attributes: {
                message: 'ordered object payload'
            },
            doNotOverwrite: false
        })
        console.log(data)
    }

    let testDelete = async () => {
        // First, create something
        await dynamo_client.update({
            tableName: 'jsondb_test',
            key: {
                id: 'come_delete_me'
            },
            attributes: {
                key1: 'stuff about to be deleted'
            }
        })

        // Then delete it
        await dynamo_client.delete({
            tableName: 'jsondb_test',
            key: {
                id: 'come_delete_me'
            }
        })
    }

    let testBatchGet = async () => {
        let data = await dynamo_client.batchGet({
            tableName: 'jsondb_test',
            keys: [
                {id: 'demo_object'},
                {id: 'nested_object'}
            ],
        })

        console.log(data)
    }
    
    let testScan = async () => {

        let query = new ScanQuery('jsondb_test')
        query.addParam({
            param: 'key1',
            value: 'this is being added', 
            message: '='
        })


        let data = await dynamo_client.scan(query)

        console.log(data)
    }



    // CALL TEST FUNCTIONS HERE
    try {
        // await testGet()
        // await testGetRange()
        // await testGetPagewise()
        // await testUpdate()
        // await testUpdateOrdered()
        // await testDelete()
        // await testBatchGet()
        // await testScan()
    } catch(err) {
        console.error(err)
    }    

})()
    


let dbObjectTestAsyncWrapper = (async () => {
    let dynamoClient = new DynamoClient({
        awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        awsRegion: config.AWS_REGION
    })

    // let myDBObjectHandler = new jsondb.DBObjectHandler({
    //     awsAccessKeyId: config.AWS_ACCESS_KEY_ID,
    //     awsSecretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    //     awsRegion: config.AWS_REGION,
    //     tableName: 'object_dev_v2'
    // })
    let dbobject = new jsondb.DBObject({
        id: 'aBcDeFG',
        dynamoClient: dynamoClient,
        tableName: 'jsondb_test_3',
        permissionLevel: null,
        isTopLevel: true,
        isNew: true,
        size: 0
    })
    
    let ind = {"s":637,"p":0,"key1":{"subkey1":{"d":true,"p":0,"s":50},"subkey2":{"d":true,"p":0,"s":50},"subkey3":{"subsubkey3":{"s":0,"p":0,"d":true},"subsubkey2":{"s":6,"p":0,"d":true},"subsubkey1":{"s":0,"p":0,"d":true}}},"key3":{"subkey3":{"p":0,"d":true,"s":50},"subkey2":{"s":50,"p":0,"d":true},"subkey1":{"s":50,"p":0,"d":true}},"key2":{"subkey3":{"s":50,"d":true,"p":0},"subkey1":{"p":0,"s":50,"d":true},"subkey2":{"d":true,"p":0,"s":50}},"k":{"uid":"aBcDeFG","ts":0}}
    

    // CALL TEST FUNCTIONS HERE
    try {
        let demoObj1 = {
            key1: {
                subkey1: 'this is key1.subkey1',
                subkey2: 'this is key1.subkey2',
                subkey3: {
                    subsubkey1: 8882,
                    subsubkey2: 'asd',
                    subsubkey3: null,
                },
            },
            key2: {
                subkey1: 'this is key2.subkey1',
                subkey2: 'this is key2.subkey2',
                subkey3: 'this is key2.subkey3',
            },
            key3: {
                subkey1: 'this is key3.subkey1',
                subkey2: 'this is key3.subkey2',
                subkey3: 'this is key3.subkey3',
            }
        }

        let requiresRestructuring = {
            'one.two.three' : 'and four'
        }

        getDemo2 = () => {
            return {
                one: {
                    sub1: u.getStringOfSize(100),
                    sub2: u.getStringOfSize(60),
                    sub3: u.getStringOfSize(1000),
                    sub4: u.getStringOfSize(830)
                },
                two: {
                    second_sub: u.getStringOfSize(200)
                }, 
                three: {
                    third_sub: {
                        third_sub_sub: u.getStringOfSize(2000)
                    }
                }
            }
        }

        getTooBig1 = () => {
            return {
                one: {
                    sub1: u.getStringOfSize(100000),
                    sub2: u.getStringOfSize(100000),
                    sub3: u.getStringOfSize(100000),
                    sub4: u.getStringOfSize(100000)
                },
                two: {
                    second_sub: u.getStringOfSize(50000)
                }, 
                three: {
                    third_sub: {
                        third_sub_sub: u.getStringOfSize(500),
                        fourth_sub_sub: u.getStringOfSize(100),
                        fifth_sub_sub: u.getStringOfSize(1800)
                    }
                },
                four: u.getStringOfSize(600000)
            }
        }
        
        getTooBig2 = () => {
            
        }

        // Fri 530, objective 1: build out up to three
        // await dbobject.create(demoObj1)
        // await dbobject.create(getTooBig1())
        debugger
        let data = await dbobject.get('one.sub1')
        
        // Fri 530, objective 2: add 'otherone' as a key to 'two', instead of replacing two
        // let res1 = await dbobject.set({'one.two.otherone': 'did I stomp on three?'})
        debugger
        
        


    } catch(err) {
        console.error(err)
    }    

})()