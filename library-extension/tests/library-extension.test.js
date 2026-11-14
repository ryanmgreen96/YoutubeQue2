const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8')
const start = backgroundSource.indexOf('function upsertSavedLibraryItem')
const end = backgroundSource.indexOf('async function saveLibraryItem', start)
assert.notEqual(start, -1)
assert.notEqual(end, -1)

const context = vm.createContext({})
vm.runInContext(backgroundSource.slice(start, end), context)

test('upsertSavedLibraryItem adds new pages to the front of the Library', () => {
  const existing = [{id:'old', url:'https://example.com/old'}]
  const added = {id:'new', url:'https://example.com/new'}
  const result = context.upsertSavedLibraryItem(existing, added)

  assert.equal(result.alreadySaved, false)
  assert.equal(result.items[0].url, added.url)
  assert.equal(result.items[1].url, existing[0].url)
  assert.equal(existing.length, 1)
})

test('upsertSavedLibraryItem updates duplicates without changing their identity or order', () => {
  const existing = [
    {id:'saved-id', url:'https://example.com/page', title:'Old title'},
    {id:'other', url:'https://example.com/other'}
  ]
  const result = context.upsertSavedLibraryItem(existing, {
    id:'new-id',
    url:'https://example.com/page',
    title:'Updated title'
  })

  assert.equal(result.alreadySaved, true)
  assert.equal(result.items[0].id, 'saved-id')
  assert.equal(result.items[0].title, 'Updated title')
  assert.equal(result.items[1].id, 'other')
})
