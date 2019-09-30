# Updated scheme:
```javascript

let parentIndexMemCache = {
    'key1.subkey1.actualData': node0,
    'key1.subkey2.moreRealStuff': node0,
    'key1.subkey1.third': node1
}

let node0 = {
    
    // Index has two types of node: data and meta
    i: {
        'key1': {
            ext: node1
        },
        'key1.subkey1.actualData': {t: 'data', s: 434, p: 0}
        'key1.subkey1.moreRealStuff': 'actualdata'
    }
}

let node1 = {
    'key1.subkey1': {ext: null},
    'key1.subkey1.third': {t: 'data', s: 343242, p: 0}
}

```
- no such thing as children, just extensions for further children at a given level
- individual giant things still handled the same way as always


At this point, scenarios:
- add something that fits: simple
- add something that doesn't fit: use ext
- replace or delete something: first kill children (in )

- add key1.subkeys that spill over
- add single giant subkey
- add something really deeply nested

Logic for a given insertion: 
```coffee
set = (attributes) -> 
    for attribute in attributes
        if directParentExtended()
            thatNode.set()
        else 
            if displacesSomething()
                children = findAllChildren()
                deleteChildren(children)
            if fits()
                add(attribute)
            else
                parentNode.extend(attribute)

# top level only
get = (attribute) ->
    if @isTopLevel
        path = @index_cache(attribute)
        return @cacheGet path
    else
        return readFromDynamo attribute


```
- if it fits, add it
- if it's large, add reference
- if it doesn't fit, create a new node at the appropriate reference


Index crawling logic uses processIndex function, recursive, beginning with the first:
- if present, add with ID
- if present but large, add specified ID
- if ext found, call self on it

# TODO
- update index: terminal stores size, permission, and largeExt
- update index: generate non-terminal, storing ext