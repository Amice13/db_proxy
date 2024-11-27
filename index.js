// HELPERS

// Helper for UUID generations
const generateUUID = () => {
  let
    d = new Date().getTime(),
    d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now() * 1000)) || 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    let r = Math.random() * 16
    if (d > 0) {
      r = (d + r) % 16 | 0
      d = Math.floor(d / 16)
    } else {
      r = (d2 + r) % 16 | 0
      d2 = Math.floor(d2 / 16)
    }
    return (c == 'x' ? r : (r & 0x7 | 0x8)).toString(16)
  })
}

// DABASE MOCKUP

const db = {
  table1: {},
  table2: {}
}

// Database definiton

const availableKeys = Object.keys(db)

// Fake API functions 

const getById = async (entity, id) => {
  // console.log(`Entity "${entity}" with id "${id}" is returned`)
  return db[entity][id]
}

const deleteById = async (entity, id) => {
  delete db[entity][id]
  // console.log(`Delete id "${id}" from "${entity}"`)
  return true
}

const updateById = async (entity, id, body) => {
  Object.assign(db[entity][id], body)
  // console.log(`"${entity}" with id "${id}" is updated with ${JSON.stringify(body)}`)
  return db[entity][id]
}

const insert = async (entity, body) => {
  const id = generateUUID()
  body.id = id
  db[entity][id] = body
  // console.log(`${JSON.stringify(body)} is inserted to "${entity}"`)
  return id
}

const upsertOne = async (entity, id, body) => {
  db[entity][id] = body
  db[entity][id].id = id
  // console.log(`${JSON.stringify(body)} with id ${id} is inserted to "${entity}"`)
  return body
}

const count = async (entity) => {
  // console.log(`Number of entitied "${entity}" is returned`)
  return Object.keys(db[entity]).length
}


const find = async (entity, body) => {
  // console.log(`Entity ${entity} is searched with the request ${JSON.stringify(body)}`)
}

const deleteAll = async (entity) => {
  db[entity] = {}
  // console.log(`All records from "${entity}" were deleted`)
  return true
}

const getSchema = async (entity) => {
  // console.log(`Schema of "${entity}" is returned`)
  return { id: entity }
} 

// Functions which are not implenented

const getMany = async (entity, request) => {
  console.log('get many', entity, body)
}

const updateMany = async (entity, request) => {
  console.log('update many', entity, body)
}

// RECORD HANDLER

const recordFunctions = ['assign']

const recordHandler = {
  assign (entity, id, body) {
    return updateById(entity, id, body).then((record) => {
      Object.defineProperty(record, '$_entity', { value: entity, enumerable: false })
      return new Proxy(record, recordHandler)
    })
  },
  get (target, prop) {
    const entity = target.$_entity
    if (recordFunctions.includes(prop)) return (...args) => {
      return this[prop](entity, target.id, ...args)
    }
    return target[prop]
  },
  set (target, prop, value) {
    const entity = target.$_entity
    this.assign(entity, target.id, { [prop]: value })
    target[prop] = value
    return target
  }
}

// CONSTRUCTOR OF SEARCH QUERIES

const searchFunctions = ['slice', 'filter', 'should', 'sort', 'reverse', 'find', 'match']

// We expect to get the object like this

const queryObject = {
  match: [{ field: 'value' }],
  offset: 0,
  limit: 0,
  sort: [{ field: 'order'}],
  filter: { field: 'value', field2: { $gt: 4 } },
  should: [{ field: 'value' }, { field: { $gt: 2 }}]
}

// SEARCH HANDLER

const createSearchFunction = (args) => {
  const searchFunctions = {
    match () {
      if (!searchFunctions.$_request.match) searchFunctions.$_request.match = []
      searchFunctions.$_request.match.push({ [sort]: 'asc' })
      return searchFunctions
    },
    slice (min, max) {
      if (typeof max === 'number') searchFunctions.$_request.offset = min
      if (typeof min === 'number') searchFunctions.$_request.limit = max - (min || 0)
      return searchFunctions
    },
    filter (filter) {
      if (!searchFunctions.$_request.filter) searchFunctions.$_request.filter = {}
      if (typeof filter === 'object') {
        Object.assign(searchFunctions.$_request.filter, filter)
        return searchFunctions
      }
    },
    should (filter) {
      if (!searchFunctions.$_request.should) searchFunctions.$_request.should = []
      if (Array.isArray(sort)) {
        for (let s of sort) this.should(s)
        return searchFunctions
      }
      if (typeof filter === 'object') {
        searchFunctions.$_request.should.push(filter)
        return searchFunctions
      }
    },
    sort (sort) {
      if (!searchFunctions.$_request.sort) searchFunctions.$_request.sort = []
      if (typeof sort === 'string') {
        searchFunctions.$_request.sort.push({ [sort]: 'asc' })
        return searchFunctions
      }
      if (Array.isArray(sort)) {
        for (let s of sort) this.sort(s)
        return searchFunctions
      }
      if (typeof sort === 'object') {
        searchFunctions.$_request.sort.push(sort)
        return searchFunctions
      }
    },
    reverse () {
      if (!searchFunctions.$_request.sort) searchFunctions.$_request.sort = []
      if (searchFunctions.$_request.sort.length === 0) {
        searchFunctions.$_request.sort.push({ id: 'desc' })
        return searchFunctions        
      }
      const lastIndex = searchFunctions.$_request.sort.length - 1
      const lastField = Object.keys(searchFunctions.$_request.sort[lastIndex])[0]
      const currentOrder = searchFunctions.$_request.sort[lastIndex][lastField]
      searchFunctions.$_request.sort[lastIndex][lastField] = currentOrder === 'asc' ? 'desc' : 'asc'
      return searchFunctions
    },
    async find () {
      const entity = searchFunctions.$_request.entity
      delete searchFunctions.$_request.entity
      return find(entity, searchFunctions.$_request)
    }
  }  
  if (!searchFunctions.$_request) {
    Object.defineProperty(searchFunctions, '$_request', { value: args, enumerable: false })
  }
  return searchFunctions
}

// COLLECTION HANDLER

const collectionFunctions = ['push', 'schema']

const collectionHandler = {
  schema (entity) {
    return getSchema(entity)
  },
  push (entity, body) {
    return insert(entity, body)
  },
  length (entity) {
    return count(entity)
  },
  get (target, prop) {
    const { entity } = target
    if (prop === 'length') return this.length(entity)
    if (searchFunctions.includes(prop)) {
      return createSearchFunction({ entity })[prop]
    }
    if (collectionFunctions.includes(prop)) return (...args) => {
      return this[prop](entity, ...args)
    }
    return getById(entity, prop).then((record) => {
      Object.defineProperty(record, '$_entity', { value: entity, enumerable: false })
      return new Proxy(record, recordHandler)
    })
  },
  set(target, prop, value) {
    const { entity } = target
    return upsertOne(entity, prop, value).then((record) => {
      Object.defineProperty(record, '$_entity', { value: entity, enumerable: false })
      return new Proxy(record, recordHandler)      
    })
  },
  deleteProperty (target, prop) {
    return deleteById(target.entity, prop)
  }
}

// DATABASE HANDLER

const databaseHandler = {
  get (target, prop) {
    if (prop === 'length') return 3
    if (!availableKeys.includes(prop)) throw Error('This entity does not exist')
    return new Proxy({ entity: prop }, collectionHandler)
  },
  has (_, key) {
    return availableKeys.includes(key)
  },
  set() {
    throw Error('You can\'t change the entity')
  },
  deleteProperty (target, prop) {
    if (!this.has(target, prop)) throw Error('This entity does not exist')
    deleteAll(prop)
  }
}


// TEST

let proxyDB = new Proxy({}, databaseHandler)

const start = async () => {

  // Insert
  const inserted = await proxyDB.table1.push({ cool: 'stuff' })

  // getById
  let record = await proxyDB.table1[inserted]

  // Update by Id
  let updatedRecord = await record.assign({ hello: 'world' })

  // Change a single field
  updatedRecord.meh = 'wah'

  // Count
  let count = await proxyDB.table1.length

  // Delete by id
  delete proxyDB.table1[inserted]

  proxyDB.table1.hello = { cool: 'world' }
  await proxyDB.table1.schema()

  // console.log(proxyDB.table1.slice(0, 9))
  const r = proxyDB.table1.slice(0, 9).sort(['hello', { world: 'desc' }])
  console.log(r.$_request)
}

start()
