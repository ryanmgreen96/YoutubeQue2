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

test('moving a queued music item changes its position by one place', () => {
  const queue = ['first', 'second', 'third']

  assert.deepEqual(
    Array.from(context.moveMusicQueueItem(queue, 'third', -1)),
    ['first', 'third', 'second']
  )
  assert.deepEqual(
    Array.from(context.moveMusicQueueItem(queue, 'first', 1)),
    ['second', 'first', 'third']
  )
  assert.deepEqual(queue, ['first', 'second', 'third'])
})

test('moving a queued item at an edge keeps the same order', () => {
  const queue = ['first', 'second']

  assert.deepEqual(Array.from(context.moveMusicQueueItem(queue, 'first', -1)), queue)
  assert.deepEqual(Array.from(context.moveMusicQueueItem(queue, 'second', 1)), queue)
})

test('removing a queued item preserves the order of the remaining items', () => {
  const queue = ['first', 'second', 'third']

  assert.deepEqual(
    Array.from(context.removeMusicQueueItem(queue, 'second')),
    ['first', 'third']
  )
  assert.deepEqual(queue, ['first', 'second', 'third'])
})

const durationFunction = appSource.match(/function formatMusicDuration\(seconds\)\{[\s\S]*?\n\}/)
assert.ok(durationFunction)
vm.runInContext(durationFunction[0], context)

test('music durations use total minutes and two-digit seconds', () => {
  assert.equal(context.formatMusicDuration(83), '1:23')
  assert.equal(context.formatMusicDuration(86), '1:26')
  assert.equal(context.formatMusicDuration(3602), '60:02')
})

const queueEmbedFunction = appSource.match(/function getMusicQueueEmbedUrl\(queueItems\)\{[\s\S]*?\n\}/)
const musicVideoIdFunction = appSource.match(/function getMusicVideoId\(item\)\{[\s\S]*?\n\}/)
assert.ok(queueEmbedFunction)
assert.ok(musicVideoIdFunction)
context.extractVideoId = (url)=>url && url.includes('youtube.com/watch?v=') ? new URL(url).searchParams.get('v') : null
context.URL = URL
context.URLSearchParams = URLSearchParams
context.window = {location:{origin:'https://example.test'}}
vm.runInContext(musicVideoIdFunction[0], context)
vm.runInContext(queueEmbedFunction[0], context)

test('fallback queue embed plays ordered videos without duration metadata', () => {
  const embedUrl = new URL(context.getMusicQueueEmbedUrl([
    {videoId:'first', startSeconds:17},
    {url:'https://youtu.be/second'},
    {videoId:'third'}
  ]))

  assert.equal(embedUrl.pathname, '/embed/first')
  assert.equal(embedUrl.searchParams.get('playlist'), 'second,third')
  assert.equal(embedUrl.searchParams.get('autoplay'), '1')
  assert.equal(embedUrl.searchParams.get('start'), '17')
})
