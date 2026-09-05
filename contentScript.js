(function(){
  const APP_KEY = 'ytQueueItems_v1'
  const SAVED_LINKS_APP_KEY = 'ytSavedVideos_v1'
  const SAVED_LINKS_EXT_KEY = 'savedVideoLinks'
  const QUEUE_MODE_KEY = 'ytQueueClickMode'
  const host = location.hostname.replace(/^www\./, '')

  function isYouTubeHost(){
    return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be'
  }

  function isAppHost(){
    return host === 'ryanmgreen96.github.io' || host === 'localhost'
  }

  async function getQueueMode(){
    const res = await chrome.storage.local.get({[QUEUE_MODE_KEY]: false})
    return !!res[QUEUE_MODE_KEY]
  }

  function videoUrlFromHref(href){
    try{
      const url = new URL(href, location.href)
      const cleanHost = url.hostname.replace(/^www\./, '')
      if(cleanHost === 'youtu.be'){
        const id = url.pathname.split('/').filter(Boolean)[0]
        return id ? `https://www.youtube.com/watch?v=${id}` : ''
      }
      if(cleanHost === 'youtube.com' || cleanHost.endsWith('.youtube.com')){
        if(url.pathname === '/watch' && url.searchParams.has('v')) return `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`
        if(url.pathname.startsWith('/shorts/')){
          const id = url.pathname.split('/').filter(Boolean)[1]
          return id ? `https://www.youtube.com/watch?v=${id}` : ''
        }
      }
    }catch(e){ }
    return ''
  }

  function isPlaceholderDate(value){
    if(typeof value !== 'string') return false
    const trimmed = value.trim()
    if(!trimmed) return false
    const placeholders = [/^2000-01-01(?:[T\s].*)?$/i, /^2001-01-01(?:[T\s].*)?$/i, /^january 1, 2000$/i, /^jan 1, 2000$/i, /^1 january 2000$/i, /^01\s+jan\s+2000$/i, /^january 1, 2001$/i, /^jan 1, 2001$/i, /^1 january 2001$/i, /^01\s+jan\s+2001$/i]
    return placeholders.some((pattern)=>pattern.test(trimmed))
  }

  function isReasonablePublishDate(value){
    if(typeof value !== 'string') return false
    const trimmed = value.trim()
    if(!trimmed || isPlaceholderDate(trimmed)) return false
    const parsed = Date.parse(trimmed)
    if(Number.isNaN(parsed)) return false
    const year = new Date(parsed).getUTCFullYear()
    const nowYear = new Date().getUTCFullYear()
    return Number.isInteger(year) && year >= 2005 && year <= nowYear + 1
  }

  function parseYouTubeAbsoluteDateText(text){
    const raw = (text || '').trim().replace(/\u2022/g, ' ')
    if(!raw) return ''
    const normalized = raw
      .replace(/^(streamed\s+live\s+on|streamed\s+on|premiered|published\s+on|uploaded\s+on)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    const patterns = [
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*|\s+)\d{4}\b/i,
      /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i,
      /\b\d{4}-\d{2}-\d{2}\b/
    ]
    for(const pattern of patterns){
      const match = normalized.match(pattern)
      if(!match || !match[0]) continue
      const parsed = Date.parse(match[0])
      if(!Number.isNaN(parsed)){
        const iso = new Date(parsed).toISOString()
        return isReasonablePublishDate(iso) ? iso : ''
      }
    }
    return ''
  }

  function parseYouTubeRelativeDate(text){
    const raw = (text || '').trim().toLowerCase()
    if(!raw) return ''
    const match = raw.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/)
    if(!match) return ''
    const value = Number(match[1])
    if(!Number.isFinite(value) || value <= 0) return ''
    const multipliers = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    }
    const offset = multipliers[match[2]]
    if(!offset) return ''
    const iso = new Date(Date.now() - (value * offset)).toISOString()
    return isReasonablePublishDate(iso) ? iso : ''
  }

  function normalizeDateCandidate(value){
    if(typeof value !== 'string') return ''
    const trimmed = value.trim().replace(/\\u0026/g, '&')
    if(!trimmed || isPlaceholderDate(trimmed)) return ''
    const parsed = Date.parse(trimmed)
    if(!Number.isNaN(parsed)){
      const iso = new Date(parsed).toISOString()
      return isReasonablePublishDate(iso) ? iso : ''
    }
    const absolute = parseYouTubeAbsoluteDateText(trimmed)
    if(absolute) return absolute
    const relative = parseYouTubeRelativeDate(trimmed)
    if(relative) return relative
    return ''
  }

  function findPublishDateInValue(value, seen = new WeakSet()){
    if(!value || typeof value !== 'object') return normalizeDateCandidate(value)
    if(seen.has(value)) return ''
    seen.add(value)

    if(Array.isArray(value)){
      for(const item of value){
        const found = findPublishDateInValue(item, seen)
        if(found) return found
      }
      return ''
    }

    const candidateKeys = ['publishDate', 'uploadDate', 'datePublished', 'dateCreated', 'publishedAt', 'publicationDate', 'releaseDate', 'dateText', 'publishedTimeText']
    for(const [key, childValue] of Object.entries(value)){
      const lowerKey = String(key).toLowerCase()
      if(candidateKeys.includes(lowerKey) || lowerKey.includes('publish') || lowerKey.includes('date') || lowerKey.includes('upload')){
        const direct = normalizeDateCandidate(childValue)
        if(direct) return direct
      }
    }

    for(const [key, childValue] of Object.entries(value)){
      const nested = findPublishDateInValue(childValue, seen)
      if(nested) return nested
    }

    return ''
  }

  function extractPublishDateFromYouTubePayload(payload){
    if(!payload || typeof payload !== 'object') return ''

    const directCandidates = [
      payload && payload.microformat && payload.microformat.playerMicroformatRenderer && payload.microformat.playerMicroformatRenderer.publishDate,
      payload && payload.microformat && payload.microformat.playerMicroformatRenderer && payload.microformat.playerMicroformatRenderer.uploadDate,
      payload && payload.microformat && payload.microformat.microformatDataRenderer && payload.microformat.microformatDataRenderer.publishDate,
      payload && payload.videoDetails && payload.videoDetails.publishDate,
      payload && payload.videoDetails && payload.videoDetails.uploadDate,
      payload && payload.microformat && payload.microformat.publishDate,
      payload && payload.microformat && payload.microformat.uploadDate
    ].filter(Boolean)

    for(const candidate of directCandidates){
      const normalized = normalizeDateCandidate(candidate)
      if(normalized) return normalized
    }

    return findPublishDateInValue(payload)
  }

  function extractPublishDateFromCurrentPage(){
    const selectors = [
      'meta[itemprop="datePublished"]',
      'meta[property="article:published_time"]',
      'meta[property="og:video:release_date"]',
      'meta[name="datePublished"]',
      'meta[name="publish_date"]'
    ]

    for(const selector of selectors){
      const node = document.querySelector(selector)
      const content = node && node.getAttribute && node.getAttribute('content')
      if(content){
        const normalized = normalizeDateCandidate(content)
        if(normalized) return normalized
      }
    }

    const initialPayload = window.ytInitialPlayerResponse || window.ytInitialData || null
    const fromPayload = extractPublishDateFromYouTubePayload(initialPayload)
    if(fromPayload) return fromPayload

    const html = document.documentElement.innerHTML || ''
    const rawPatterns = [
      /"publishDate"\s*:\s*"([^"]+)"/i,
      /"uploadDate"\s*:\s*"([^"]+)"/i,
      /"datePublished"\s*:\s*"([^"]+)"/i,
      /itemprop="datePublished"\s+content="([^"]+)"/i
    ]
    for(const pattern of rawPatterns){
      const match = html.match(pattern)
      if(match && match[1]){
        const normalized = normalizeDateCandidate(match[1])
        if(normalized) return normalized
      }
    }

    return ''
  }

  function playlistUrlFromHref(href){
    try{
      const url = new URL(href, location.href)
      const cleanHost = url.hostname.replace(/^www\./, '')
      if(!(cleanHost === 'youtube.com' || cleanHost.endsWith('.youtube.com'))) return ''
      const listId = url.searchParams.get('list')
      if(!listId) return ''

      // Any YouTube URL carrying a list id can be canonicalized to /playlist for bulk queueing.
      return `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`
    }catch(e){ }
    return ''
  }

  function playlistUrlFromCurrentPage(){
    try{
      const url = new URL(location.href)
      const cleanHost = url.hostname.replace(/^www\./, '')
      if(!(cleanHost === 'youtube.com' || cleanHost.endsWith('.youtube.com'))) return ''
      const listId = url.searchParams.get('list')
      if(!listId) return ''
      return `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`
    }catch(e){ }
    return ''
  }

  function shouldQueuePlaylistFromTarget(target, hrefSource, videoUrl, playlistUrl){
    if(!playlistUrl) return false
    if(!target || !target.closest) return !videoUrl

    if(!videoUrl) return true

    const hrefLooksLikeExplicitPlaylist = /\/playlist(\?|$)/.test(hrefSource || '') && /[?&]list=/.test(hrefSource || '')
    if(hrefLooksLikeExplicitPlaylist) return true

    const inPlaylistRow = !!target.closest(
      'ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer, ytd-playlist-video-list-renderer ytd-playlist-panel-video-renderer'
    )
    const rowVideoLink = !!target.closest(
      'ytd-playlist-panel-video-renderer a#video-title, ytd-playlist-panel-video-renderer a#thumbnail, ytd-playlist-video-renderer a#video-title, ytd-playlist-video-renderer a#thumbnail'
    )
    if(inPlaylistRow && rowVideoLink) return false

    const inPlaylistTitleArea = !!target.closest(
      'ytd-playlist-sidebar-primary-info-renderer, ytd-playlist-header-renderer, ytd-playlist-panel-renderer #title, ytd-playlist-panel-renderer h1, ytd-playlist-renderer'
    )
    if(inPlaylistTitleArea) return true

    const ownLabel = (target.getAttribute && (target.getAttribute('aria-label') || target.getAttribute('title'))) || ''
    if(/playlist/i.test(ownLabel)) return true

    return false
  }

  function listIdFromPlaylistUrl(playlistUrl){
    try{ return new URL(playlistUrl).searchParams.get('list') || '' }catch(e){ return '' }
  }

  function sleep(ms){ return new Promise((resolve)=>setTimeout(resolve, ms)) }

  async function tryLoadMorePlaylistItems(listId){
    const containers = [
      ...Array.from(document.querySelectorAll('ytd-playlist-panel-renderer #contents, ytd-playlist-panel-renderer #items')),
      ...Array.from(document.querySelectorAll('ytd-playlist-video-list-renderer #contents'))
    ]

    for(const container of containers){
      if(!container) continue
      let stagnant = 0
      let prevHeight = -1
      for(let step = 0; step < 24; step += 1){
        container.scrollTop = container.scrollHeight
        await sleep(120)
        const nextHeight = container.scrollHeight
        if(nextHeight <= prevHeight) stagnant += 1
        else stagnant = 0
        prevHeight = nextHeight
        if(stagnant >= 4) break
      }
    }

    if(listId && location.pathname === '/playlist'){
      let stagnant = 0
      let prevHeight = -1
      for(let step = 0; step < 20; step += 1){
        window.scrollTo(0, document.documentElement.scrollHeight)
        await sleep(150)
        const nextHeight = document.documentElement.scrollHeight
        if(nextHeight <= prevHeight) stagnant += 1
        else stagnant = 0
        prevHeight = nextHeight
        if(stagnant >= 4) break
      }
    }
  }

  async function collectPlaylistItemsFromDom(listId){
    const containers = [
      ...Array.from(document.querySelectorAll('ytd-playlist-panel-renderer #contents, ytd-playlist-panel-renderer #items')),
      ...Array.from(document.querySelectorAll('ytd-playlist-video-list-renderer #contents'))
    ]

    for(const container of containers){
      if(!container) continue
      let stagnant = 0
      let prevHeight = -1
      for(let step = 0; step < 24; step += 1){
        container.scrollTop = container.scrollHeight
        await sleep(120)
        const nextHeight = container.scrollHeight
        if(nextHeight <= prevHeight) stagnant += 1
        else stagnant = 0
        prevHeight = nextHeight
        if(stagnant >= 4) break
      }
    }

    if(listId && location.pathname === '/playlist'){
      let stagnant = 0
      let prevHeight = -1
      for(let step = 0; step < 20; step += 1){
        window.scrollTo(0, document.documentElement.scrollHeight)
        await sleep(150)
        const nextHeight = document.documentElement.scrollHeight
        if(nextHeight <= prevHeight) stagnant += 1
        else stagnant = 0
        prevHeight = nextHeight
        if(stagnant >= 4) break
      }
    }

    const anchors = Array.from(document.querySelectorAll('a[href*="watch?v="][href*="list="]'))
    const seen = new Set()
    const items = []

    anchors.forEach((anchor, index)=>{
      const href = anchor.getAttribute('href') || ''
      if(!href) return

      let url
      try{ url = new URL(href, location.href) }catch(e){ return }
      if(url.pathname !== '/watch') return

      const videoId = url.searchParams.get('v') || ''
      const hrefListId = url.searchParams.get('list') || ''
      if(!videoId || !hrefListId) return
      if(listId && hrefListId !== listId) return
      if(seen.has(videoId)) return
      seen.add(videoId)

      const closestRow = anchor.closest('ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer, ytd-playlist-video-list-renderer ytd-playlist-video-renderer')
      const rowIndexText = closestRow && closestRow.querySelector && closestRow.querySelector('#index') ? (closestRow.querySelector('#index').textContent || '') : ''
      const parsedIndex = Number((rowIndexText || '').replace(/[^\d]/g, ''))
      const indexParam = Number(url.searchParams.get('index'))
      const orderIndex = Number.isFinite(parsedIndex) && parsedIndex > 0
        ? parsedIndex
        : (Number.isFinite(indexParam) && indexParam > 0 ? indexParam : (index + 1))

      const title =
        (anchor.getAttribute('title') || '').trim() ||
        (anchor.getAttribute('aria-label') || '').trim() ||
        (closestRow && closestRow.querySelector && closestRow.querySelector('#video-title') ? (closestRow.querySelector('#video-title').textContent || '').trim() : '') ||
        (anchor.textContent || '').trim() ||
        `YouTube video ${videoId}`

      items.push({
        videoId,
        title,
        orderIndex,
        url: `https://www.youtube.com/watch?v=${videoId}&list=${encodeURIComponent(hrefListId)}`
      })
    })

    items.sort((a, b)=>a.orderIndex - b.orderIndex)
    return items
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse)=>{
    if(!message || message.type !== 'collect-playlist-items-from-page') return

    const playlistUrl = typeof message.url === 'string' ? message.url : ''
    const listId = listIdFromPlaylistUrl(playlistUrl) || listIdFromPlaylistUrl(location.href)

    collectPlaylistItemsFromDom(listId)
      .then((items)=>sendResponse({ok:true, items}))
      .catch(()=>sendResponse({ok:false, items:[]}))

    return true
  })

  function queueTitleFromElement(el){
    const label = (el && (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title')))) || ''
    if(label.trim() && !isGenericQueueTitle(label)) return label.trim()
    const titleNode = el && el.closest && el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer')?.querySelector('#video-title, a#video-title, [title]')
    const text = (titleNode && (titleNode.getAttribute && (titleNode.getAttribute('aria-label') || titleNode.getAttribute('title')) || titleNode.textContent)) || el?.textContent || ''
    return isGenericQueueTitle(text) ? '' : text.trim()
  }

  function isGenericQueueTitle(value){
    const title = (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim()
    return !title || /^(youtube|youtube music)(?:\s*-\s*youtube)?$/i.test(title) || /^title(?:\s*\(\d+\))?$/i.test(title) || /^youtube video\s+\S+$/i.test(title)
  }

  function renderQueueModeBanner(enabled){
    const existing = document.getElementById('yt-queue-mode-banner')
    if(!enabled){
      if(existing) existing.remove()
      return
    }
    if(existing) return

    const banner = document.createElement('div')
    banner.id = 'yt-queue-mode-banner'
    banner.textContent = 'Queue mode on: right-click videos or playlists to queue'
    banner.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:#ffcc00;color:#000;padding:8px 10px;border-radius:999px;font:600 12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial;box-shadow:0 8px 24px rgba(0,0,0,0.25)'
    document.documentElement.appendChild(banner)
  }
  let queueModeEnabled = false

  function findVideoLinkElement(start){
    if(!start || !start.closest) return null
    return start.closest('a[href], [href], ytd-thumbnail, ytd-playlist-thumbnail, #video-title, ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-playlist-header-renderer, ytd-playlist-sidebar-primary-info-renderer, ytd-playlist-panel-renderer')
  }

  function hrefFromTarget(target){
    if(!target) return ''
    const own = target.getAttribute && (target.getAttribute('href') || target.getAttribute('data-href'))
    if(own) return own
    if(target.href) return target.href

    const nested = target.querySelector && target.querySelector('a[href], [href], #thumbnail, #video-title')
    if(!nested) return ''
    return (nested.getAttribute && (nested.getAttribute('href') || nested.getAttribute('data-href'))) || nested.href || ''
  }

  function getSavedLinkIdentity(value){
    const raw = (value || '').trim()
    if(!raw) return ''

    try{
      const parsed = new URL(raw)
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
      const pathname = parsed.pathname || ''
      if(host === 'youtu.be'){
        const shortId = pathname.replace(/^\/+/, '').split('/')[0]
        if(shortId) return `youtube:${shortId}`
      }
      if(host === 'youtube.com' || host.endsWith('.youtube.com')){
        if(pathname === '/watch' || pathname.startsWith('/watch/')){
          const videoId = parsed.searchParams.get('v') || ''
          if(videoId) return `youtube:${videoId}`
        }
        if(pathname.startsWith('/shorts/')){
          const parts = pathname.split('/').filter(Boolean)
          if(parts[1]) return `youtube:${parts[1]}`
        }
      }
      return parsed.toString().replace(/\/$/, '') || raw.toLowerCase()
    }catch(e){
      return raw.toLowerCase()
    }
  }

  function mergeSavedLinksPreserveExistingPosition(incoming, existing){
    const cleanedExisting = []
    const existingByUrl = new Map()

    ;(Array.isArray(existing) ? existing : []).forEach((item)=>{
      if(!item || !item.url) return
      const identity = getSavedLinkIdentity(item.url)
      if(!identity || existingByUrl.has(identity)) return
      existingByUrl.set(identity, cleanedExisting.length)
      cleanedExisting.push(item)
    })

    const newItems = []
    const seenNewUrls = new Set()

    ;(Array.isArray(incoming) ? incoming : []).forEach((item)=>{
      if(!item || !item.url) return
      const identity = getSavedLinkIdentity(item.url)
      const existingIndex = existingByUrl.get(identity)

      if(Number.isInteger(existingIndex)){
        const oldItem = cleanedExisting[existingIndex]
        cleanedExisting[existingIndex] = {
          ...item,
          id: oldItem && oldItem.id ? oldItem.id : item.id,
          created: oldItem && oldItem.created ? oldItem.created : item.created,
          orderIndex: oldItem && oldItem.orderIndex !== undefined ? oldItem.orderIndex : item.orderIndex,
          position: oldItem && oldItem.position !== undefined ? oldItem.position : item.position
        }
        return
      }

      if(!identity || seenNewUrls.has(identity)) return
      seenNewUrls.add(identity)
      newItems.push(item)
    })

    const orderedNewItems = newItems.map((item, index)=>({
      ...item,
      orderIndex: index - newItems.length
    }))
    return orderedNewItems.concat(cleanedExisting)
  }

  function syncAppStateFromExtension(res){
    const q = Array.isArray(res && res.queuedItems) ? res.queuedItems : []
    const savedLinks = Array.isArray(res && res[SAVED_LINKS_EXT_KEY]) ? res[SAVED_LINKS_EXT_KEY] : []
    let changed = false

    try{
      if(q.length){
        const existingQueue = JSON.parse(localStorage.getItem(APP_KEY)||'[]')
        const mergedQueue = q.concat(existingQueue)
        localStorage.setItem(APP_KEY, JSON.stringify(mergedQueue))
        changed = true
      }
    }catch(e){
      if(q.length){
        localStorage.setItem(APP_KEY, JSON.stringify(q))
        changed = true
      }
    }

    try{
      if(savedLinks.length){
        const existingSaved = JSON.parse(localStorage.getItem(SAVED_LINKS_APP_KEY)||'[]')
        const mergedSaved = mergeSavedLinksPreserveExistingPosition(savedLinks, existingSaved)
        localStorage.setItem(SAVED_LINKS_APP_KEY, JSON.stringify(mergedSaved))
        changed = true
      }
    }catch(e){
      if(savedLinks.length){
        localStorage.setItem(SAVED_LINKS_APP_KEY, JSON.stringify(savedLinks))
        changed = true
      }
    }

    if(!q.length && !savedLinks.length) return

    chrome.storage.local.set({queuedItems: [], [SAVED_LINKS_EXT_KEY]: []}, ()=>{
      if(changed) location.reload()
    })
  }

  try{
    if(isAppHost()){
    window.addEventListener('message', (event)=>{
      if(event.source !== window) return
      const data = event.data
      if(!data || data.source !== 'ytqueue-app' || !data.requestId || !data.action) return

      const respond = (payload)=>{
        const targetOrigin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'
        window.postMessage({
          source: 'ytqueue-extension',
          requestId: data.requestId,
          ok: !!payload.ok,
          payload: payload.payload || null,
          error: payload.error || ''
        }, targetOrigin)
      }

      if(data.action === 'fetch-playlist-items'){
        chrome.runtime.sendMessage({type:'fetch-playlist-items', url: data.payload && data.payload.playlistUrl}, (response)=>{
          if(chrome.runtime.lastError){
            respond({ok:false, error: chrome.runtime.lastError.message || 'Extension unavailable'})
            return
          }

          respond({
            ok: !!(response && response.ok),
            payload: {items: response && Array.isArray(response.items) ? response.items : []},
            error: response && response.error ? response.error : ''
          })
        })
        return
      }

      if(data.action === 'fetch-video-published-at'){
        chrome.runtime.sendMessage({type:'fetch-video-published-at', url: data.payload && data.payload.url}, (response)=>{
          if(chrome.runtime.lastError){
            respond({ok:false, error: chrome.runtime.lastError.message || 'Extension unavailable'})
            return
          }

          respond({
            ok: !!(response && response.ok),
            payload: {publishedAt: response && typeof response.publishedAt === 'string' ? response.publishedAt : ''},
            error: response && response.error ? response.error : ''
          })
        })
        return
      }

      if(data.action === 'fetch-video-title'){
        chrome.runtime.sendMessage({type:'fetch-video-title', url: data.payload && data.payload.url}, (response)=>{
          if(chrome.runtime.lastError){
            respond({ok:false, error: chrome.runtime.lastError.message || 'Extension unavailable'})
            return
          }

          respond({
            ok: !!(response && response.ok),
            payload: {title: response && typeof response.title === 'string' ? response.title : ''},
            error: response && response.error ? response.error : ''
          })
        })
        return
      }

      if(data.action === 'open-url'){
        chrome.runtime.sendMessage({type:'open-url', url: data.payload && data.payload.url}, (response)=>{
          if(chrome.runtime.lastError){
            respond({ok:false, error: chrome.runtime.lastError.message || 'Extension unavailable'})
            return
          }

          respond({ok: !!(response && response.ok), error: response && response.error ? response.error : ''})
        })
      }
    })

    chrome.storage.local.get(['queuedItems', SAVED_LINKS_EXT_KEY], syncAppStateFromExtension)

    chrome.storage.onChanged.addListener((changes, area)=>{
      if(area !== 'local') return
      if(!changes.queuedItems && !changes[SAVED_LINKS_EXT_KEY]) return

      syncAppStateFromExtension({
        queuedItems: changes.queuedItems ? changes.queuedItems.newValue : [],
        [SAVED_LINKS_EXT_KEY]: changes[SAVED_LINKS_EXT_KEY] ? changes[SAVED_LINKS_EXT_KEY].newValue : []
      })
    })
      return
    }

    if(!isYouTubeHost()) return

    const installQueueClickMode = async ()=>{
      queueModeEnabled = await getQueueMode()
      renderQueueModeBanner(queueModeEnabled)

      const handleQueueClick = async (ev)=>{
        if(!queueModeEnabled) return
        if(ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
        if(ev.type === 'pointerdown' && ev.button !== 2) return
        if(ev.type === 'contextmenu' && ev.button !== 2 && ev.button !== 0) return

        const target = findVideoLinkElement(ev.target)
        if(!target) return

        const hrefSource = hrefFromTarget(target)
        const videoUrl = videoUrlFromHref(hrefSource)
        const playlistUrl = playlistUrlFromHref(hrefSource) || playlistUrlFromCurrentPage()

        const shouldQueuePlaylist = shouldQueuePlaylistFromTarget(target, hrefSource, videoUrl, playlistUrl)

        if(shouldQueuePlaylist){
          ev.preventDefault()
          ev.stopPropagation()
          if(ev.stopImmediatePropagation) ev.stopImmediatePropagation()

          const title = queueTitleFromElement(target)
          const listId = listIdFromPlaylistUrl(playlistUrl)
          const domItems = await collectPlaylistItemsFromDom(listId)

          if(domItems.length){
            chrome.runtime.sendMessage({type:'queue-playlist-items', url: playlistUrl, title, items: domItems})
            return
          }

          chrome.runtime.sendMessage({type:'queue-playlist-url', url: playlistUrl, title})
          return
        }

        if(!videoUrl) return

        ev.preventDefault()
        ev.stopPropagation()
        if(ev.stopImmediatePropagation) ev.stopImmediatePropagation()

        const title = queueTitleFromElement(target)
        const publishedAt = extractPublishDateFromCurrentPage()
        chrome.runtime.sendMessage({type:'queue-video-url', url: videoUrl, title, publishedAt})
      }

      document.addEventListener('contextmenu', (ev)=>{ handleQueueClick(ev) }, true)

      chrome.storage.onChanged.addListener((changes, area)=>{
        if(area !== 'local' || !changes[QUEUE_MODE_KEY]) return
        queueModeEnabled = !!changes[QUEUE_MODE_KEY].newValue
        renderQueueModeBanner(queueModeEnabled)
      })
    }

    installQueueClickMode()
  }catch(e){
    // no chrome APIs available
  }
})()
