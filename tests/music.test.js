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
  const queue = [
    {videoId:'first', startSeconds:17},
    {url:'https://youtu.be/second', startSeconds:31},
    {videoId:'third'}
  ]
  const embedUrl = new URL(context.getMusicQueueEmbedUrl(queue))

  assert.equal(embedUrl.pathname, '/embed/first')
  assert.equal(embedUrl.searchParams.get('playlist'), 'second,third')
  assert.equal(embedUrl.searchParams.get('autoplay'), '1')
  assert.equal(embedUrl.searchParams.get('start'), '17')

  const currentUrl = new URL(context.getMusicQueueEmbedUrl(queue, 1))
  assert.equal(currentUrl.pathname, '/embed/second')
  assert.equal(currentUrl.searchParams.get('playlist'), 'third')
  assert.equal(currentUrl.searchParams.get('start'), '31')
})

const startQueueFunction = appSource.match(/function startMusicQueue\(startIndex=0\)\{[\s\S]*?\n\}/)
const continueQueueFunction = appSource.match(/function continueMusicQueue\(\)\{[\s\S]*?\n\}/)
const playerStateFunction = appSource.match(/function handleMusicQueuePlayerStateChange\(event\)\{[\s\S]*?\n\}/)
const playerErrorFunction = appSource.match(/function handleMusicQueuePlayerError\(event\)\{[\s\S]*?\n\}/)
assert.ok(startQueueFunction)
assert.ok(continueQueueFunction)
assert.ok(playerStateFunction)
assert.ok(playerErrorFunction)
const queuePlayerCalls = []
const queuePlayer = {
  loadPlaylist:(...args)=>queuePlayerCalls.push(['loadPlaylist', ...args]),
  setShuffle:(shuffle)=>queuePlayerCalls.push(['setShuffle', shuffle]),
  getPlaylistIndex:()=>1,
  playVideoAt:(index)=>queuePlayerCalls.push(['playVideoAt', index]),
  seekTo:(...args)=>queuePlayerCalls.push(['seekTo', ...args])
}
const playbackQueue = [
  {id:'one', videoId:'video-one'},
  {id:'two', videoId:'video-two', startSeconds:31},
  {id:'three', videoId:'video-three'}
]
context.getMusicQueueItems = ()=>playbackQueue
context.musicYouTubePlayer = queuePlayer
context.musicYouTubePlayerReady = true
context.musicQueuePlaybackItems = []
context.musicQueuePlaybackIndex = -1
context.musicQueueCurrentItemId = null
context.musicQueueAwaitingStartIndex = false
context.musicQueueUsingIframeFallback = false
context.musicQueuePlayBtn = {disabled:false, textContent:''}
context.musicPlayerTitleEl = {textContent:''}
context.musicQueueStatusEl = {textContent:''}
context.renderMusicQueuePreview = ()=>{}
context.console = {error:()=>{}}
vm.runInContext(startQueueFunction[0], context)
vm.runInContext(continueQueueFunction[0], context)
vm.runInContext(playerStateFunction[0], context)
vm.runInContext(playerErrorFunction[0], context)

test('continuing queue starts at the current item without shuffling its order', () => {
  queuePlayerCalls.length = 0
  context.musicQueueCurrentItemId = 'two'
  context.continueMusicQueue()

  assert.deepEqual(queuePlayerCalls, [
    ['setShuffle', false],
    ['loadPlaylist', ['video-one', 'video-two', 'video-three'], 1, 31]
  ])
  assert.equal(context.musicQueueCurrentItemId, 'two')
})

test('starting from first loads playlist index zero after disabling shuffle', () => {
  queuePlayerCalls.length = 0
  context.startMusicQueue(0)

  assert.deepEqual(queuePlayerCalls, [
    ['setShuffle', false],
    ['loadPlaylist', ['video-one', 'video-two', 'video-three'], 0, 0]
  ])
  assert.equal(context.musicQueueCurrentItemId, 'one')
})

test('player starting at the wrong index is corrected to the requested first item', () => {
  queuePlayerCalls.length = 0
  context.musicQueuePlaybackItems = playbackQueue
  context.musicQueuePlaybackIndex = 0
  context.musicQueueAwaitingStartIndex = true
  context.musicQueueUsingIframeFallback = false
  context.window = {YT:{PlayerState:{PLAYING:1, ENDED:0}}}
  context.handleMusicQueuePlayerStateChange({data:1})

  assert.deepEqual(queuePlayerCalls, [['playVideoAt', 0]])
  assert.equal(context.musicQueuePlaybackIndex, 0)
})

test('queue player errors stop instead of silently skipping the failed item', () => {
  context.musicQueuePlaybackItems = playbackQueue
  context.musicQueuePlaybackIndex = 0
  context.musicQueueAwaitingStartIndex = true
  context.musicQueueUsingIframeFallback = false
  context.musicQueueStatusEl.textContent = ''
  queuePlayerCalls.length = 0
  context.handleMusicQueuePlayerError({data:101})

  assert.equal(context.musicQueuePlaybackIndex, -1)
  assert.match(context.musicQueueStatusEl.textContent, /queue item 1.*preserve order/)
  assert.equal(queuePlayerCalls.some(([method])=>method==='playVideoAt'), false)
})
