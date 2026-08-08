const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '..', 'contentScript.js'), 'utf8')
const match = source.match(/function mergeSavedLinksPreserveExistingPosition[\s\S]*?\n\n  function syncAppStateFromExtension/)

if(!match){
  throw new Error('Could not locate mergeSavedLinksPreserveExistingPosition in contentScript.js')
}

const script = `${match[0]}\nmodule.exports = mergeSavedLinksPreserveExistingPosition`
const context = { module: { exports: null }, console, Date, Map, Set }
vm.runInNewContext(script, context)
const mergeSavedLinksPreserveExistingPosition = context.module.exports

test('keeps existing saved links in their original order when the same link is saved again', () => {
  const existing = [
    { id: 'a-1', url: 'https://example.com/a', title: 'A' },
    { id: 'b-1', url: 'https://example.com/b', title: 'B' },
    { id: 'c-1', url: 'https://example.com/c', title: 'C' }
  ]

  const incoming = [
    { id: 'b-2', url: 'https://example.com/b', title: 'B updated' }
  ]

  const merged = mergeSavedLinksPreserveExistingPosition(incoming, existing)

  assert.deepStrictEqual(
    merged.map((item) => item.url),
    ['https://example.com/a', 'https://example.com/b', 'https://example.com/c']
  )
  assert.strictEqual(merged[1].id, 'b-1')
})

test('adds new links at the top while keeping earlier saved links in place', () => {
  const existing = [
    { id: 'a-1', url: 'https://example.com/a', title: 'A' },
    { id: 'b-1', url: 'https://example.com/b', title: 'B' }
  ]

  const incoming = [
    { id: 'c-2', url: 'https://example.com/c', title: 'C' },
    { id: 'b-3', url: 'https://example.com/b', title: 'B updated' }
  ]

  const merged = mergeSavedLinksPreserveExistingPosition(incoming, existing)

  assert.deepStrictEqual(
    merged.map((item) => item.url),
    ['https://example.com/a', 'https://example.com/b', 'https://example.com/c']
  )
  assert.strictEqual(merged[2].id, 'b-1')
})
