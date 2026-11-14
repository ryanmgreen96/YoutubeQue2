const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')
const start = appSource.indexOf('function moveItemToTopWithinPageTab')
const end = appSource.indexOf('function promoteMusicItemToTop', start)
assert.notEqual(start, -1)
assert.notEqual(end, -1)

const context = vm.createContext({
  normalizePageId: (pageId)=>pageId || 'home',
  normalizeTabId: (tabId)=>tabId || 'default'
})
vm.runInContext(appSource.slice(start, end), context)

test('moving a music item promotes it within its tab only', () => {
  const items = [
    {id:'other-tab-first', pageId:'music', tabId:'practice'},
    {id:'target-first', pageId:'music', tabId:'favorites'},
    {id:'other-page', pageId:'home', tabId:'default'},
    {id:'target-second', pageId:'music', tabId:'favorites'}
  ]

  const moved = context.moveItemToTopWithinPageTab(items, 'target-second', 'music', 'favorites')

  assert.deepEqual(Array.from(moved, (item)=>item.id), [
    'other-tab-first',
    'target-second',
    'target-first',
    'other-page'
  ])
  assert.deepEqual(items.map((item)=>item.id), [
    'other-tab-first',
    'target-first',
    'other-page',
    'target-second'
  ])
})

test('moving an unknown item leaves the list unchanged', () => {
  const items = [{id:'existing', pageId:'music', tabId:'default'}]

  const moved = context.moveItemToTopWithinPageTab(items, 'missing', 'music', 'default')

  assert.deepEqual(Array.from(moved, (item)=>item.id), ['existing'])
  assert.notEqual(moved, items)
})
