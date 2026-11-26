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

const titleFilterToggleFunction = appSource.match(/function createTitleFilterToggle\(pageId\)\{[\s\S]*?\n\}/)
const renderTabBarFunction = appSource.match(/function renderTabBar\(pageId\)\{[\s\S]*?\n\}\n\nfunction render\(\)/)
assert.ok(titleFilterToggleFunction)
assert.ok(renderTabBarFunction)

test('Music tab title-filter info controls appear only in reorder mode', () => {
  class FakeElement {
    constructor(tagName){
      this.tagName = tagName
      this.children = []
      this.listeners = {}
      this.style = {}
      this.attributes = {}
    }
    appendChild(child){ this.children.push(child); return child }
    addEventListener(type, handler){ this.listeners[type] = handler }
    setAttribute(name, value){ this.attributes[name] = value }
  }
  const sections = new FakeElement('sections')
  let renderCount = 0
  const tabContext = vm.createContext({
    document: {createElement:(tagName)=>new FakeElement(tagName)},
    sections,
    isMusicPage:(pageId)=>pageId==='music',
    isJournalPage:()=>false,
    normalizePageId:(pageId)=>pageId,
    getPageTabs:()=>[{id:'default',title:'Songs'}],
    getActiveTabId:()=> 'default',
    getPageTitle:()=> 'Music',
    attachLongPress:()=>({consume:()=>false}),
    musicTabReorderMode:false,
    titleFilterOverlayPageId:null,
    musicQueueMode:false,
    isMusicFavoriteModeEnabled:()=>false,
    getMusicQueueItems:()=>[],
    render:()=>{renderCount += 1},
    toggleMusicFavoriteMode:()=>{},
    toggleMusicQueueMode:()=>{},
    clearMusicQueue:()=>{},
    openCreateForm:()=>{},
    addTabToPage:()=>{},
    setActiveTab:()=>{},
    moveTabInPage:()=>{}
  })
  vm.runInContext(titleFilterToggleFunction[0], tabContext)
  vm.runInContext(renderTabBarFunction[0].replace(/\n\nfunction render\(\)$/, ''), tabContext)

  tabContext.renderTabBar('music')
  const normalTabWrap = sections.children[0].children[0]
  assert.equal(normalTabWrap.children.length, 1)

  sections.children = []
  tabContext.musicTabReorderMode = true
  tabContext.renderTabBar('music')
  const reorderTabWrap = sections.children[0].children[0]
  const infoButton = reorderTabWrap.children[1]
  assert.equal(infoButton.textContent, 'i')
  assert.equal(infoButton.title, 'Manage hidden title phrases')

  infoButton.listeners.click({stopPropagation:()=>{}})
  assert.equal(tabContext.titleFilterOverlayPageId, 'music')
  assert.equal(renderCount, 1)
})

const ensureMusicYouTubePlayerFunction = appSource.match(/async function ensureMusicYouTubePlayer\(videoId\)\{[\s\S]*?\n\}/)
const warmMusicYouTubePlayerFunction = appSource.match(/function warmMusicYouTubePlayer\(\)\{[\s\S]*?\n\}/)
assert.ok(ensureMusicYouTubePlayerFunction)
assert.ok(warmMusicYouTubePlayerFunction)

test('YouTube player initialization starts from a video-specific API-enabled iframe', async () => {
  const playerSetup = {}
  const playerContext = vm.createContext({
    URL,
    setTimeout,
    clearTimeout,
    loadMusicYouTubeApi: async () => {},
    musicYouTubePlayerReady: false,
    musicYouTubePlayerCreatePromise: null,
    musicYouTubePlayer: null,
    musicPlayerFrameEl: {src: ''},
    handleMusicQueuePlayerStateChange: () => {},
    handleMusicQueuePlayerError: () => {},
    window: {
      location: {origin: 'https://queue.example'},
      YT: {
        Player: (target, options) => {
          playerSetup.target = target
          playerSetup.options = options
          Promise.resolve().then(() => options.events.onReady())
          return {ready: true}
        }
      }
    }
  })
  vm.runInContext(ensureMusicYouTubePlayerFunction[0], playerContext)

  await playerContext.ensureMusicYouTubePlayer('video-id')

  const iframeUrl = new URL(playerContext.musicPlayerFrameEl.src)
  assert.equal(playerSetup.target, 'music-player-frame')
  assert.equal(iframeUrl.pathname, '/embed/video-id')
  assert.equal(iframeUrl.searchParams.get('enablejsapi'), '1')
  assert.equal(iframeUrl.searchParams.get('origin'), 'https://queue.example')
  assert.equal(playerSetup.options.playerVars.origin, 'https://queue.example')
})

test('music-page warmup loads the player API without creating an empty player', () => {
  let apiLoadCount = 0
  let playerCreateCount = 0
  const warmContext = vm.createContext({
    musicYouTubePlayerReady: false,
    musicYouTubePlayerCreatePromise: null,
    loadMusicYouTubeApi: () => {
      apiLoadCount += 1
      return Promise.resolve()
    },
    ensureMusicYouTubePlayer: () => {
      playerCreateCount += 1
      return Promise.resolve()
    },
    console: {error: () => {}}
  })
  vm.runInContext(warmMusicYouTubePlayerFunction[0], warmContext)

  warmContext.warmMusicYouTubePlayer()

  assert.equal(apiLoadCount, 1)
  assert.equal(playerCreateCount, 0)
})

const musicZonesFunction = appSource.match(/function getMusicZones\(item\)\{[\s\S]*?\n\}/)
const musicSegmentsFunction = appSource.match(/function getMusicPlaybackSegments\(item\)\{[\s\S]*?\n\}/)
assert.ok(musicZonesFunction)
assert.ok(musicSegmentsFunction)
vm.runInContext(musicZonesFunction[0], context)
vm.runInContext(musicSegmentsFunction[0], context)

test('saved music zones play in order and allow a final open-ended zone', () => {
  const item = {
    startSeconds:12,
    zones:[
      {startSeconds:10,endSeconds:40},
      {startSeconds:60,endSeconds:null}
    ]
  }

  assert.deepEqual(Array.from(context.getMusicPlaybackSegments(item), (zone)=>({...zone})), [
    {startSeconds:10,endSeconds:40},
    {startSeconds:60,endSeconds:null}
  ])
})

const loadCurrentMusicZoneSegmentFunction = appSource.match(/function loadCurrentMusicZoneSegment\(\)\{[\s\S]*?\n\}/)
assert.ok(loadCurrentMusicZoneSegmentFunction)

test('moving to the next saved zone seeks the current video instead of reloading it', () => {
  const playerCalls = []
  const playback = {
    items: [{
      id:'zoned-video',
      videoId:'video',
      title:'Zoned video',
      zones:[
        {startSeconds:0,endSeconds:50},
        {startSeconds:60,endSeconds:90}
      ]
    }],
    itemIndex:0,
    segmentIndex:1,
    isQueue:false,
    transitioning:true
  }
  const zoneContext = vm.createContext({
    musicZonePlayback:playback,
    musicYouTubePlayer:{
      seekTo:(...args)=>playerCalls.push(['seekTo', ...args]),
      playVideo:()=>playerCalls.push(['playVideo']),
      loadVideoById:(...args)=>playerCalls.push(['loadVideoById', ...args])
    },
    getMusicPlaybackSegments:(item)=>item.zones,
    getMusicVideoId:(item)=>item.videoId,
    musicPlayerItemId:null,
    musicQueueCurrentItemId:null,
    musicPlayerTitleEl:{textContent:''},
    musicQueueStatusEl:{textContent:''},
    musicQueuePlaybackIndex:-1,
    renderMusicQueuePreview:()=>{}
  })
  vm.runInContext(loadCurrentMusicZoneSegmentFunction[0], zoneContext)

  zoneContext.loadCurrentMusicZoneSegment()

  assert.deepEqual(playerCalls, [
    ['seekTo', 60, true],
    ['playVideo']
  ])
  assert.equal(playback.transitioning, false)
})

test('music playback falls back to the saved start when no valid zones exist', () => {
  assert.deepEqual(
    {...context.getMusicPlaybackSegments({startSeconds:12,zones:[{startSeconds:20,endSeconds:10}]})[0]},
    {startSeconds:12,endSeconds:null}
  )
  assert.deepEqual(
    {...context.getMusicPlaybackSegments({startSeconds:0,zones:[]})[0]},
    {startSeconds:0,endSeconds:null}
  )
})

test('full-video queue entries ignore saved starts and zones', () => {
  const item = {
    startSeconds:12,
    zones:[{startSeconds:30,endSeconds:45}],
    queuePlaybackMode:'full'
  }

  assert.deepEqual(
    Array.from(context.getMusicPlaybackSegments(item), (zone)=>({...zone})),
    [{startSeconds:0,endSeconds:null}]
  )
})

const queuePlaybackModeFunction = appSource.match(/function getMusicQueuePlaybackMode\(itemId\)\{[\s\S]*?\n\}/)
assert.ok(queuePlaybackModeFunction)
context.musicQueueFullItemIds = ['full-item']
vm.runInContext(queuePlaybackModeFunction[0], context)

test('music queue entries default to saved playback unless marked full-length', () => {
  assert.equal(context.getMusicQueuePlaybackMode('full-item'), 'full')
  assert.equal(context.getMusicQueuePlaybackMode('saved-item'), 'saved')
})

const queueEmbedFunction = appSource.match(/function getMusicQueueEmbedUrl\(queueItems(?:, startIndex=0)?\)\{[\s\S]*?\n\}/)
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
  assert.equal(embedUrl.searchParams.get('playlist'), 'first,second,third')
  assert.equal(embedUrl.searchParams.get('autoplay'), '1')
  assert.equal(embedUrl.searchParams.get('start'), '17')

  const currentUrl = new URL(context.getMusicQueueEmbedUrl(queue, 1))
  assert.equal(currentUrl.pathname, '/embed/second')
  assert.equal(currentUrl.searchParams.get('playlist'), 'second,third')
  assert.equal(currentUrl.searchParams.get('start'), '31')
})

test('fallback queue embed refuses to silently skip an item without a video ID', () => {
  const queue = [
    {url:'https://example.test/not-a-youtube-video'},
    {videoId:'second'}
  ]

  assert.equal(context.getMusicQueueEmbedUrl(queue), '')
})

test('full-video queue embeds start at zero instead of the saved start', () => {
  const embedUrl = new URL(context.getMusicQueueEmbedUrl([
    {videoId:'video', startSeconds:37, queuePlaybackMode:'full'}
  ]))

  assert.equal(embedUrl.searchParams.get('start'), '0')
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
context.musicPlayerFrameEl = {src:''}
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

test('starting the queue reports an invalid first item instead of playing the second', () => {
  queuePlayerCalls.length = 0
  context.getMusicQueueItems = ()=>[
    {id:'invalid-first', url:'https://example.test/not-a-youtube-video'},
    {id:'valid-second', videoId:'video-two'}
  ]
  context.musicQueueStatusEl.textContent = ''
  context.musicPlayerFrameEl.src = ''
  context.startMusicQueue(0)

  assert.match(context.musicQueueStatusEl.textContent, /queue item 1 has no playable YouTube video ID/i)
  assert.equal(context.musicPlayerFrameEl.src, '')
  assert.equal(queuePlayerCalls.length, 0)
  context.getMusicQueueItems = ()=>playbackQueue
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
