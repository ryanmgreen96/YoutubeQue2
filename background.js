const APP_URL = 'https://ryanmgreen96.github.io/YoutubeQue2/' // GitHub Pages URL for your repo
const SAVED_LINKS_KEY = 'savedVideoLinks'
const QUEUE_MODE_KEY = 'ytQueueClickMode'
const LIBRARY_PAGE_ID = 'library'
const LIBRARY_TAB_ID = 'default'

async function getQueueMode(){
  const res = await chrome.storage.local.get({[QUEUE_MODE_KEY]: false})
  return !!res[QUEUE_MODE_KEY]
}

async function setQueueMode(enabled){
  await chrome.storage.local.set({[QUEUE_MODE_KEY]: !!enabled})
  await updateQueueModeBadge(!!enabled)
}

async function updateQueueModeBadge(enabled){
  if(enabled){
    await chrome.action.setBadgeText({text: 'Q'})
    await chrome.action.setBadgeBackgroundColor({color: '#ffcc00'})
    await chrome.action.setTitle({title: 'Click-to-queue mode: ON'})
  }else{
    await chrome.action.setBadgeText({text: ''})
    await chrome.action.setTitle({title: 'Save current page for later'})
  }
}

chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.create({
    id:'queue-video',
    title:'Add to queue',
    contexts:['page','link','image','video']
  })
  getQueueMode().then(updateQueueModeBadge)
})

chrome.runtime.onStartup.addListener(()=>{
  getQueueMode().then(updateQueueModeBadge)
})

function extractUrlFromInfo(info, tab){
  // Prefer link (e.g., right-clicking title), then src, then page URL
  return info.linkUrl || info.srcUrl || info.pageUrl || (tab && tab.url) || null
}

chrome.contextMenus.onClicked.addListener((info, tab)=>{
  if(info.menuItemId !== 'queue-video') return
  console.debug('contextMenus.onClicked', {info, tab})
  let targetUrl = extractUrlFromInfo(info, tab)

  const tryResolveFromHover = async ()=>{
    try{
      const res = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: ()=>{
          try{
            const hovered = document.querySelectorAll(':hover')
            const el = hovered[hovered.length-1]
            if(!el) return {href:'', text:''}

            // prefer finding a nested anchor or element that contains a youtube watch link
            const walker = el.querySelectorAll ? Array.from(el.querySelectorAll('a[href], [href], img[src], [data-video-id]')) : []
            // include the element itself as first candidate
            if(el.matches && (el.matches('a[href]') || el.hasAttribute && (el.hasAttribute('href')||el.hasAttribute('data-video-id')))) walker.unshift(el)

            for(const cand of walker){
              const href = cand.href || cand.getAttribute && (cand.getAttribute('href')||cand.getAttribute('data-href')) || cand.src || ''
              if(!href) continue
              const full = href ? new URL(href, location.href).href : ''
              if(/youtube\.com\/watch|\?v=/.test(full) || cand.getAttribute('data-video-id')){
                const vid = cand.getAttribute && (cand.getAttribute('data-video-id')||'')
                const text = (cand.getAttribute && (cand.getAttribute('aria-label')||cand.getAttribute('title')) ) || cand.alt || cand.textContent || ''
                return {href: vid? `https://www.youtube.com/watch?v=${vid}`:full, text: text.trim()}
              }
            }

            // fallback to closest anchor
            const a = el.closest('a') || el.closest('[href]') || el
            const href = a && (a.href || a.getAttribute && (a.getAttribute('href')||a.getAttribute('data-video-id')) || a.src) || ''
            const full = href ? (href.includes('data-video-id') ? href : new URL(href, location.href).href) : ''
            const text = (a && (a.getAttribute && (a.getAttribute('aria-label')||a.getAttribute('title')))) || a.alt || (a && a.textContent) || ''
            return {href: full, text: text.trim()}
          }catch(e){ return {href:'', text:''} }
        }
      })
      return res?.[0]?.result || {href:'', text:''}
    }catch(e){ return {href:'', text:''} }
  }

  ;(async ()=>{
    let resolvedTitle = ''
    let publishedAtFromTab = ''

    // if we only have the page url (or nothing), try to resolve a hovered link under cursor
    if(!targetUrl || targetUrl === (tab && tab.url)){
      const found = await tryResolveFromHover()
      console.debug('tryResolveFromHover result', found)
      if(found && found.href) targetUrl = found.href
      if(found && found.text) {
        resolvedTitle = found.text
        publishedAtFromTab = await inspectTabPublishedAt(tab)
        openQueueTabFor(targetUrl || tab.url, resolvedTitle, publishedAtFromTab)
        return
      }
    }

    // if we got here and still don't have link text, fallback to page title then fetch title
    try{
      const results = await chrome.scripting.executeScript({ target: {tabId: tab.id}, func: ()=>document.title })
      const pageTitle = results?.[0]?.result || ''
      resolvedTitle = pageTitle
      publishedAtFromTab = await inspectTabPublishedAt(tab)
      console.debug('using pageTitle fallback', {pageTitle, publishedAtFromTab})
      openQueueTabFor(targetUrl || (tab && tab.url) || null, resolvedTitle, publishedAtFromTab)
    }catch(e){
      publishedAtFromTab = await inspectTabPublishedAt(tab)
      openQueueTabFor(targetUrl || (tab && tab.url) || null, null, publishedAtFromTab)
    }
  })()
})

function extractVideoUrlFromTab(tabUrl){
  try{
    const u = new URL(tabUrl)
    const host = u.hostname.replace(/^www\./, '')

    if(host === 'youtube.com' || host.endsWith('.youtube.com')){
      if(u.pathname === '/watch' && u.searchParams.has('v')){
        return `https://www.youtube.com/watch?v=${u.searchParams.get('v')}`
      }
      if(u.pathname.startsWith('/shorts/')){
        const id = u.pathname.split('/').filter(Boolean)[1]
        if(id) return `https://www.youtube.com/watch?v=${id}`
      }
      return null
    }

    if(host === 'youtu.be'){
      const id = u.pathname.split('/').filter(Boolean)[0]
      if(id) return `https://www.youtube.com/watch?v=${id}`
    }
  }catch(e){
    return null
  }
  return null
}

function extractSavedLinkFromTab(tab){
  const fallbackUrl = (tab && typeof tab.url === 'string') ? tab.url : ''
  if(!fallbackUrl) return null

  const videoUrl = extractVideoUrlFromTab(fallbackUrl)
  const rawTitle = ((tab && tab.title) || '').trim()

  if(videoUrl){
    return {
      url: videoUrl,
      title: rawTitle.replace(/\s*-\s*YouTube\s*$/i, '').trim() || 'YouTube video'
    }
  }

  try{
    const pageUrl = new URL(fallbackUrl)
    return {
      url: pageUrl.href,
      title: rawTitle || pageUrl.hostname.replace(/^www\./, '') || pageUrl.href
    }
  }catch(e){
    return rawTitle || fallbackUrl ? {url: fallbackUrl, title: rawTitle || fallbackUrl} : null
  }
}

function parseIsoDurationToSeconds(raw){
  const value = safeText(raw)
  if(!value) return 0
  const match = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if(!match) return 0
  const days = Number(match[1] || 0)
  const hours = Number(match[2] || 0)
  const minutes = Number(match[3] || 0)
  const seconds = Number(match[4] || 0)
  if(!Number.isFinite(days + hours + minutes + seconds)) return 0
  return (days * 86400) + (hours * 3600) + (minutes * 60) + seconds
}

async function fetchVideoDurationSeconds(url){
  try{
    const res = await fetch(url)
    const txt = await res.text()
    let doc
    try{ doc = new DOMParser().parseFromString(txt, 'text/html') }catch(e){ doc = null }
    if(!doc) return 0

    const metaCandidates = [
      doc.querySelector('meta[itemprop="duration"]')?.getAttribute('content'),
      doc.querySelector('meta[property="og:video:duration"]')?.getAttribute('content')
    ].filter(Boolean)

    for(const candidate of metaCandidates){
      const numeric = Number(candidate)
      if(Number.isFinite(numeric) && numeric > 0) return Math.round(numeric)
      const parsed = parseIsoDurationToSeconds(candidate)
      if(parsed > 0) return parsed
    }

    const jsonLdBlocks = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map(node=>node.textContent || '')
    for(const block of jsonLdBlocks){
      try{
        const data = JSON.parse(block)
        const entries = Array.isArray(data) ? data : [data]
        for(const entry of entries){
          const parsed = parseIsoDurationToSeconds(entry && entry.duration)
          if(parsed > 0) return parsed
        }
      }catch(e){ }
    }
  }catch(e){ }

  return 0
}

async function extractSavedLinkFromTabWithDuration(tab){
  const fallbackUrl = (tab && typeof tab.url === 'string') ? tab.url : ''
  if(!fallbackUrl) return null

  const videoUrl = extractVideoUrlFromTab(fallbackUrl)
  const rawTitle = ((tab && tab.title) || '').trim()

  if(videoUrl){
    const durationSeconds = await fetchVideoDurationSeconds(videoUrl)
    return {
      url: videoUrl,
      title: rawTitle.replace(/\s*-\s*YouTube\s*$/i, '').trim() || 'YouTube video',
      durationSeconds
    }
  }

  try{
    const pageUrl = new URL(fallbackUrl)
    return {
      url: pageUrl.href,
      title: rawTitle || pageUrl.hostname.replace(/^www\./, '') || pageUrl.href
    }
  }catch(e){
    return rawTitle || fallbackUrl ? {url: fallbackUrl, title: rawTitle || fallbackUrl} : null
  }
}

function isArchiveOrgUrl(rawUrl){
  if(!rawUrl) return false
  try{
    const host = new URL(rawUrl).hostname.replace(/^www\./, '')
    return host === 'archive.org' || host.endsWith('.archive.org')
  }catch(e){
    return false
  }
}

function cleanArchiveTitle(rawTitle){
  const base = ((rawTitle || '').trim() || '')
  if(!base) return ''
  return base
    .replace(/\s*:\s*Free Download, Borrow, and Streaming\s*:\s*Internet Archive\s*$/i, '')
    .replace(/\s*:\s*Internet Archive\s*$/i, '')
    .replace(/\s*-\s*Internet Archive\s*$/i, '')
    .trim()
}

function fallbackTitleFromUrl(rawUrl){
  try{
    const parsed = new URL(rawUrl)
    const part = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname
    return decodeURIComponent(part).replace(/[-_]+/g, ' ').trim() || parsed.hostname
  }catch(e){
    return rawUrl || 'Archive item'
  }
}

function closeTabAfterSave(tabId){
  if(typeof tabId !== 'number') return
  chrome.tabs.remove(tabId, ()=>{ void chrome.runtime.lastError })
}

async function buildArchiveLibraryItem(tab){
  const url = tab && typeof tab.url === 'string' ? tab.url : ''
  if(!url) return null

  const tabTitle = cleanArchiveTitle(tab && tab.title)
  const fetchedTitle = tabTitle ? '' : cleanArchiveTitle(await fetchPageTitle(url))
  const title = tabTitle || fetchedTitle || fallbackTitleFromUrl(url)

  return {
    id: uid(),
    url,
    title,
    created: new Date().toISOString(),
    publishedAt: '',
    pageId: LIBRARY_PAGE_ID,
    tabId: LIBRARY_TAB_ID,
    favorite: false,
    videoId: null
  }
}

chrome.action.onClicked.addListener((tab)=>{
  if(isArchiveOrgUrl(tab && tab.url)){
    ;(async ()=>{
      const archiveItem = await buildArchiveLibraryItem(tab)
      if(!archiveItem) return

      chrome.storage.local.get({queuedItems:[]}, (res)=>{
        const current = Array.isArray(res.queuedItems) ? res.queuedItems : []
        const deduped = current.filter((item)=>item && item.url !== archiveItem.url)
        deduped.unshift(archiveItem)
        chrome.storage.local.set({queuedItems: deduped}, ()=>{
          closeTabAfterSave(tab && tab.id)
        })
      })
    })()
    return
  }

  ;(async ()=>{
    const itemData = await extractSavedLinkFromTabWithDuration(tab)
    if(!itemData) return

    const item = {
      id: uid(),
      url: itemData.url,
      title: itemData.title,
      created: new Date().toISOString(),
      publishedAt: '',
      durationSeconds: Number(itemData.durationSeconds) || 0
    }

    chrome.storage.local.get({[SAVED_LINKS_KEY]:[]}, (res)=>{
      const current = res[SAVED_LINKS_KEY] || []
      const deduped = current.filter((link)=>link.url !== item.url)
      deduped.unshift(item)
      chrome.storage.local.set({[SAVED_LINKS_KEY]: deduped}, ()=>{
        closeTabAfterSave(tab && tab.id)
      })
    })
  })()
})

chrome.commands.onCommand.addListener((command)=>{
  if(command !== 'toggle-queue-mode') return
  getQueueMode().then((enabled)=>setQueueMode(!enabled))
})

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8) }
function safeText(value){ return (typeof value === 'string' ? value : '').trim() }

function parseYouTubeRelativeDate(text){
  const raw = safeText(text).toLowerCase()
  if(!raw) return ''
  const match = raw.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/)
  if(!match) return ''

  const value = Number(match[1])
  if(!Number.isFinite(value) || value <= 0) return ''

  const unit = match[2]
  const multipliers = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000
  }

  const offset = multipliers[unit]
  if(!offset) return ''
  return new Date(Date.now() - (value * offset)).toISOString()
}

function normalizeCandidateDate(value){
  if(typeof value !== 'string') return ''
  const trimmed = safeText(value).replace(/\u2022/g, ' ').replace(/\s+/g, ' ')
  if(!trimmed) return ''
  if(isPlaceholderDate(trimmed)) return ''
  const parsed = Date.parse(trimmed)
  if(!Number.isNaN(parsed)){
    const date = new Date(parsed)
    if(!Number.isNaN(date.getTime())){
      const iso = date.toISOString()
      return isReasonablePublishDate(iso) ? iso : ''
    }
  }
  const absolute = parseYouTubeAbsoluteDateText(trimmed)
  if(absolute) return absolute
  const relative = parseYouTubeRelativeDate(trimmed)
  if(relative) return relative
  return ''
}

function isPlaceholderDate(value){
  if(typeof value !== 'string') return false
  const trimmed = safeText(value)
  if(!trimmed) return false
  const placeholders = [/^2000-01-01(?:[T\s].*)?$/i, /^2001-01-01(?:[T\s].*)?$/i, /^january 1, 2000$/i, /^jan 1, 2000$/i, /^1 january 2000$/i, /^01\s+jan\s+2000$/i, /^january 1, 2001$/i, /^jan 1, 2001$/i, /^1 january 2001$/i, /^01\s+jan\s+2001$/i]
  return placeholders.some((pattern)=>pattern.test(trimmed))
}

function isReasonablePublishDate(value){
  if(typeof value !== 'string') return false
  const trimmed = safeText(value)
  if(!trimmed || isPlaceholderDate(trimmed)) return false
  const parsed = Date.parse(trimmed)
  if(Number.isNaN(parsed)) return false
  const date = new Date(parsed)
  const year = date.getUTCFullYear()
  const nowYear = new Date().getUTCFullYear()
  return Number.isInteger(year) && year >= 2005 && year <= nowYear + 1
}

function parseYouTubeAbsoluteDateText(text){
  const raw = safeText(text).replace(/\u2022/g, ' ')
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
    const candidate = normalizeCandidateDate(match[0])
    if(candidate && !isPlaceholderDate(candidate) && !isPlaceholderDate(match[0])) return candidate
  }

  const directParsed = normalizeCandidateDate(normalized)
  if(directParsed && !isPlaceholderDate(directParsed) && !isPlaceholderDate(normalized)) return directParsed

  return ''
}

function parseBalancedJsonFrom(html, start){
  if(start < 0) return null

  if(start < 0) return null

  let depth = 0
  let inString = false
  let quote = ''
  let escaped = false

  for(let pos = start; pos < html.length; pos += 1){
    const ch = html[pos]
    if(inString){
      if(escaped){
        escaped = false
        continue
      }
      if(ch === '\\'){
        escaped = true
        continue
      }
      if(ch === quote){
        inString = false
        quote = ''
      }
      continue
    }

    if(ch === '"' || ch === '\''){
      inString = true
      quote = ch
      continue
    }

    if(ch === '{') depth += 1
    if(ch === '}'){
      depth -= 1
      if(depth === 0){
        const jsonText = html.slice(start, pos + 1)
        try{ return JSON.parse(jsonText) }catch(e){ return null }
      }
    }
  }

  return null
}

function pullInitialDataObject(html){
  const markers = [
    'var ytInitialData = ',
    'window["ytInitialData"] = ',
    'ytInitialData = '
  ]

  for(const marker of markers){
    const index = html.indexOf(marker)
    if(index < 0) continue
    const start = html.indexOf('{', index)
    const parsed = parseBalancedJsonFrom(html, start)
    if(parsed) return parsed
  }

  return null
}

function collectPlaylistRenderers(node, output){
  if(!node || typeof node !== 'object') return
  if(Array.isArray(node)){
    node.forEach(item=>collectPlaylistRenderers(item, output))
    return
  }

  if(node.playlistVideoRenderer) output.push(node.playlistVideoRenderer)
  Object.keys(node).forEach((key)=>collectPlaylistRenderers(node[key], output))
}

function rendererTitle(renderer){
  const runs = renderer?.title?.runs
  if(Array.isArray(runs) && runs.length){
    return runs.map(run=>run?.text || '').join('').trim()
  }
  return safeText(renderer?.title?.simpleText)
}

function rendererRelativeDate(renderer){
  const published = safeText(renderer?.publishedTimeText?.simpleText)
  if(published) return published

  const infoRuns = Array.isArray(renderer?.videoInfo?.runs) ? renderer.videoInfo.runs : []
  const candidate = infoRuns.map(run=>safeText(run?.text)).find(text=>/\bago\b/i.test(text))
  return candidate || ''
}

function extractPlaylistItemsFromAnchors(html, listId){
  let doc
  try{ doc = new DOMParser().parseFromString(html, 'text/html') }catch(e){ doc = null }
  if(!doc) return []

  const anchors = Array.from(doc.querySelectorAll('a[href*="watch?v="]'))
  const seen = new Set()
  const result = []

  anchors.forEach((anchor, index)=>{
    const rawHref = anchor.getAttribute('href') || ''
    if(!rawHref) return

    let url
    try{ url = new URL(rawHref, 'https://www.youtube.com') }catch(e){ return }
    if(url.pathname !== '/watch') return

    const videoId = safeText(url.searchParams.get('v'))
    const hrefListId = safeText(url.searchParams.get('list'))
    if(!videoId || !hrefListId) return
    if(listId && hrefListId !== listId) return
    if(seen.has(videoId)) return
    seen.add(videoId)

    const idx = Number(url.searchParams.get('index'))
    const orderIndex = Number.isFinite(idx) ? idx : (index + 1)
    const title = safeText(anchor.getAttribute('title')) || safeText(anchor.textContent) || `YouTube video ${videoId}`
    result.push({videoId, title, publishedAt: '', orderIndex, url: `https://www.youtube.com/watch?v=${videoId}&list=${encodeURIComponent(hrefListId)}`})
  })

  return result
}

async function extractPlaylistItems(playlistUrl){
  const response = await fetch(playlistUrl, {credentials: 'include'})
  const html = await response.text()
  const initialData = pullInitialDataObject(html)

  const listId = (()=>{
    try{ return new URL(playlistUrl).searchParams.get('list') || '' }catch(e){ return '' }
  })()

  const renderers = []
  if(initialData) collectPlaylistRenderers(initialData, renderers)

  const fromRenderers = []
  if(renderers.length){
    const seen = new Set()
    renderers.forEach((renderer, index)=>{
      const videoId = safeText(renderer?.videoId)
      if(!videoId || seen.has(videoId)) return
      seen.add(videoId)

      const idx = Number(renderer?.index?.simpleText)
      const orderIndex = Number.isFinite(idx) ? idx : (index + 1)
      const title = rendererTitle(renderer) || `YouTube video ${videoId}`
      const relative = rendererRelativeDate(renderer)
      const publishedAt = parseYouTubeRelativeDate(relative)
      const baseUrl = `https://www.youtube.com/watch?v=${videoId}`
      const url = listId ? `${baseUrl}&list=${encodeURIComponent(listId)}` : baseUrl

      fromRenderers.push({videoId, title, publishedAt, orderIndex, url})
    })
  }

  const fromAnchors = extractPlaylistItemsFromAnchors(html, listId)
  const source = fromRenderers.length ? fromRenderers : fromAnchors
  if(!source.length) return []

  const seen = new Set()
  const raw = []

  source.forEach((item)=>{
    if(!item || !item.videoId || seen.has(item.videoId)) return
    seen.add(item.videoId)
    raw.push(item)
  })

  const withPublished = raw.filter(item=>!!item.publishedAt).length
  const shouldSortByPublished = withPublished >= 2

  if(shouldSortByPublished){
    raw.sort((a, b)=>new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
  }else{
    raw.sort((a, b)=>a.orderIndex - b.orderIndex)
  }

  return raw
}

function waitForTabComplete(tabId, timeoutMs = 30000){
  return new Promise((resolve, reject)=>{
    let settled = false

    const cleanup = ()=>{
      settled = true
      clearTimeout(timeoutHandle)
      chrome.tabs.onUpdated.removeListener(handleUpdated)
      chrome.tabs.onRemoved.removeListener(handleRemoved)
    }

    const handleUpdated = (updatedTabId, info)=>{
      if(updatedTabId !== tabId) return
      if(info.status !== 'complete') return
      cleanup()
      resolve()
    }

    const handleRemoved = (removedTabId)=>{
      if(removedTabId !== tabId) return
      cleanup()
      reject(new Error('Playlist tab closed before it finished loading'))
    }

    const timeoutHandle = setTimeout(()=>{
      if(settled) return
      cleanup()
      reject(new Error('Timed out waiting for playlist tab to load'))
    }, timeoutMs)

    chrome.tabs.onUpdated.addListener(handleUpdated)
    chrome.tabs.onRemoved.addListener(handleRemoved)
  })
}

function closeTabIfPresent(tabId){
  return new Promise((resolve)=>{
    chrome.tabs.remove(tabId, ()=>resolve())
  })
}

async function extractPlaylistItemsViaTab(playlistUrl){
  const createdTab = await chrome.tabs.create({url: playlistUrl, active: false})
  const tabId = createdTab && createdTab.id
  if(typeof tabId !== 'number') return []

  try{
    await waitForTabComplete(tabId)
    const results = await chrome.scripting.executeScript({
      target: {tabId},
      args: [playlistUrl],
      func: async (expectedPlaylistUrl)=>{
        const sleep = (ms)=>new Promise((resolve)=>setTimeout(resolve, ms))
        const cleanHost = location.hostname.replace(/^www\./, '')
        if(!(cleanHost === 'youtube.com' || cleanHost.endsWith('.youtube.com'))) return []

        const expectedListId = (()=>{
          try{ return new URL(expectedPlaylistUrl).searchParams.get('list') || '' }catch(e){ return '' }
        })()

        const currentListId = (()=>{
          try{ return new URL(location.href).searchParams.get('list') || '' }catch(e){ return '' }
        })()

        const listId = expectedListId || currentListId
        if(!listId) return []

        const scrollContainers = async ()=>{
          const containers = [
            ...Array.from(document.querySelectorAll('ytd-playlist-panel-renderer #contents, ytd-playlist-panel-renderer #items')),
            ...Array.from(document.querySelectorAll('ytd-playlist-video-list-renderer #contents'))
          ]

          for(const container of containers){
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

          if(location.pathname === '/playlist'){
            let stagnant = 0
            let prevHeight = -1
            for(let step = 0; step < 24; step += 1){
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

        const collect = ()=>{
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
            if(!videoId || !hrefListId || hrefListId !== listId) return
            if(seen.has(videoId)) return
            seen.add(videoId)

            const closestRow = anchor.closest('ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer, ytd-playlist-video-list-renderer ytd-playlist-video-renderer')
            const rowIndexText = closestRow && closestRow.querySelector ? ((closestRow.querySelector('#index') || {}).textContent || '') : ''
            const parsedIndex = Number((rowIndexText || '').replace(/[^\d]/g, ''))
            const indexParam = Number(url.searchParams.get('index'))
            const orderIndex = Number.isFinite(parsedIndex) && parsedIndex > 0
              ? parsedIndex
              : (Number.isFinite(indexParam) && indexParam > 0 ? indexParam : (index + 1))

            const title =
              (anchor.getAttribute('title') || '').trim() ||
              (anchor.getAttribute('aria-label') || '').trim() ||
              (closestRow && closestRow.querySelector ? (((closestRow.querySelector('#video-title') || {}).textContent) || '').trim() : '') ||
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

        for(let attempt = 0; attempt < 8; attempt += 1){
          await scrollContainers()
          const items = collect()
          if(items.length) return items
          await sleep(500)
        }

        return []
      }
    })
    return Array.isArray(results) && results[0] && Array.isArray(results[0].result) ? results[0].result : []
  }catch(e){
    return []
  }finally{
    await closeTabIfPresent(tabId)
  }
}

async function resolvePlaylistItemsForRandom(playlistUrl){
  const directItems = await extractPlaylistItems(playlistUrl)
  if(directItems.length) return directItems
  return extractPlaylistItemsViaTab(playlistUrl)
}

function queueManyItems(itemsToQueue){
  if(!Array.isArray(itemsToQueue) || !itemsToQueue.length) return
  chrome.storage.local.get({queuedItems:[]}, (res)=>{
    const existing = Array.isArray(res.queuedItems) ? res.queuedItems : []
    const existingUrls = new Set(existing.map(item=>item && item.url).filter(Boolean))
    const unique = []

    itemsToQueue.forEach((item)=>{
      if(!item || !item.url || existingUrls.has(item.url)) return
      existingUrls.add(item.url)
      unique.push(item)
    })

    if(!unique.length) return
    chrome.storage.local.set({queuedItems: unique.concat(existing)})
  })
}
function extractHtmlMetaContent(text, patterns){
  const raw = safeText(text)
  if(!raw) return ''
  for(const pattern of patterns){
    const match = raw.match(pattern)
    if(match && match[1]) return safeText(match[1]).trim()
  }
  return ''
}

async function fetchPageTitle(url){
  try{
    const res = await fetch(url)
    const txt = await res.text()
    const metaTitle = extractHtmlMetaContent(txt, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i
    ])
    const titleMatch = txt.match(/<title[^>]*>([^<]+)<\/title>/i)
    return (metaTitle || (titleMatch && titleMatch[1]) || '').trim()
  }catch(e){ return '' }
}

function parseYouTubeFeedPublishedAt(text){
  const raw = safeText(text)
  if(!raw) return ''
  const match = raw.match(/<published>([^<]+)<\/published>/i)
  if(!match || !match[1]) return ''
  const parsed = Date.parse(match[1])
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString()
}

async function fetchYouTubePlayerData(videoId){
  try{
    const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=AIzaSyAO_FJ2SlqU', {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20250330.00.00'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20250330.00.00'
          }
        },
        videoId
      })
    })
    if(!response.ok) return null
    return await response.json()
  }catch(e){
    return null
  }
}

function normalizeDateCandidate(value){
  if(typeof value === 'string'){
    const trimmed = safeText(value).replace(/\\u0026/g, '&')
    if(!trimmed) return ''
    if(isPlaceholderDate(trimmed)) return ''
    const direct = Date.parse(trimmed)
    if(!Number.isNaN(direct)){
      const iso = new Date(direct).toISOString()
      return isPlaceholderDate(iso) ? '' : iso
    }
    const absolute = parseYouTubeAbsoluteDateText(trimmed)
    if(absolute) return absolute
    const relative = parseYouTubeRelativeDate(trimmed)
    if(relative) return relative
    return ''
  }
  if(value && typeof value === 'object'){
    if(typeof value.simpleText === 'string') return normalizeDateCandidate(value.simpleText)
    if(Array.isArray(value.runs)){
      const joined = value.runs.map((run)=>safeText(run && run.text)).filter(Boolean).join(' ')
      if(joined) return normalizeDateCandidate(joined)
    }
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
    const lowerKey = safeText(key).toLowerCase()
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

function extractDateFromYoutubeHtml(text){
  const raw = safeText(text)
  if(!raw) return ''

  const markers = ['ytInitialPlayerResponse', 'ytInitialData', 'microformat', 'playerMicroformatRenderer']
  for(const marker of markers){
    const idx = raw.indexOf(marker)
    if(idx < 0) continue
    const braceIndex = raw.indexOf('{', idx)
    if(braceIndex < 0) continue
    let depth = 0
    let inString = false
    let escaped = false
    for(let i = braceIndex; i < raw.length; i += 1){
      const char = raw[i]
      if(inString){
        if(escaped){ escaped = false }
        else if(char === '\\'){ escaped = true }
        else if(char === '"'){ inString = false }
        continue
      }
      if(char === '"'){ inString = true; continue }
      if(char === '{'){ depth += 1; continue }
      if(char === '}'){ depth -= 1; if(depth === 0){
        const candidate = raw.slice(braceIndex, i + 1)
        try{
          const parsed = JSON.parse(candidate)
          const found = findPublishDateInValue(parsed)
          if(found) return found
        }catch(e){ }
        break
      } }
    }
  }

  const rawDatePatterns = [
    /"publishDate"\s*:\s*"([^"]+)"/i,
    /\"publishDate\"\s*:\s*\"([^\"]+)\"/i,
    /"uploadDate"\s*:\s*"([^"]+)"/i,
    /\"uploadDate\"\s*:\s*\"([^\"]+)\"/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /\"datePublished\"\s*:\s*\"([^\"]+)\"/i,
    /itemprop="datePublished"\s+content="([^"]+)"/i
  ]
  for(const pattern of rawDatePatterns){
    const match = raw.match(pattern)
    if(!match || !match[1]) continue
    const normalized = normalizeDateCandidate(match[1])
    if(normalized) return normalized
  }

  return ''
}

async function fetchPagePublishedAt(url){
  try{
    let requestUrl = url
    let videoId = ''
    try{
      const parsed = new URL(url)
      const host = parsed.hostname.replace(/^www\./, '')
      if((host === 'youtube.com' || host.endsWith('.youtube.com')) && parsed.pathname === '/watch'){
        videoId = safeText(parsed.searchParams.get('v'))
        if(videoId) requestUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
      }
      if(host === 'youtu.be'){
        videoId = safeText(parsed.pathname.split('/').filter(Boolean)[0])
        if(videoId) requestUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
      }
    }catch(e){ }

    if(videoId){
      try{
        const playerData = await fetchYouTubePlayerData(videoId)
        const youtubePlayerPublishedAt = extractPublishDateFromYouTubePayload(playerData)
        if(youtubePlayerPublishedAt) return youtubePlayerPublishedAt
      }catch(e){ }

      const watchCandidates = [
        `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&pbj=1`,
        `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
      ]
      for(const candidateUrl of watchCandidates){
        try{
          const watchRes = await fetch(candidateUrl, {credentials: 'omit', headers: {'Accept': 'application/json,text/html,*/*'}})
          if(!watchRes.ok) continue
          const watchText = await watchRes.text()
          try{
            const parsed = JSON.parse(watchText)
            const found = findPublishDateInValue(parsed)
            if(found) return found
          }catch(e){ }
          const htmlPublishedAt = extractDateFromYoutubeHtml(watchText)
          if(htmlPublishedAt) return htmlPublishedAt
        }catch(e){ }
      }

      try{
        const feedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?video_id=${encodeURIComponent(videoId)}`, {credentials: 'omit'})
        if(feedRes.ok){
          const feedText = await feedRes.text()
          const feedPublishedAt = parseYouTubeFeedPublishedAt(feedText)
          if(feedPublishedAt) return feedPublishedAt
        }
      }catch(e){ }
    }

    const res = await fetch(requestUrl, {credentials: 'include'})
    const txt = await res.text()

    const metaCandidates = [
      extractHtmlMetaContent(txt, [
        /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']article:published_time["'][^>]+content=["']([^"']+)["']/i
      ]),
      extractHtmlMetaContent(txt, [
        /<meta[^>]+property=["']og:published_time["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']og:published_time["'][^>]+content=["']([^"']+)["']/i
      ]),
      extractHtmlMetaContent(txt, [
        /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i
      ]),
      extractHtmlMetaContent(txt, [
        /<meta[^>]+property=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']datePublished["'][^>]+content=["']([^"']+)["']/i
      ])
    ].filter(Boolean)

    for(const candidate of metaCandidates){
      const parsed = Date.parse(candidate)
      if(!Number.isNaN(parsed)) return new Date(parsed).toISOString()
    }

    const jsonLdBlocks = Array.from(txt.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)).map((match)=>match[1] || '')
    for(const block of jsonLdBlocks){
      try{
        const data = JSON.parse(block)
        const entries = Array.isArray(data) ? data : [data]
        for(const entry of entries){
          const candidate = entry && (entry.uploadDate || entry.datePublished || entry.dateCreated)
          const parsed = candidate ? Date.parse(candidate) : NaN
          if(!Number.isNaN(parsed)) return new Date(parsed).toISOString()
        }
      }catch(e){ }
    }

    const rawDatePatterns = [
      /"publishDate"\s*:\s*"([^"]+)"/i,
      /\\"publishDate\\"\s*:\s*\\"([^\\"]+)\\"/i,
      /"uploadDate"\s*:\s*"([^"]+)"/i,
      /\\"uploadDate\\"\s*:\s*\\"([^\\"]+)\\"/i,
      /"datePublished"\s*:\s*"([^"]+)"/i,
      /\\"datePublished\\"\s*:\s*\\"([^\\"]+)\\"/i,
      /itemprop="datePublished"\s+content="([^"]+)"/i
    ]
    for(const pattern of rawDatePatterns){
      const match = txt.match(pattern)
      if(!match || !match[1]) continue
      const parsed = Date.parse(match[1])
      if(!Number.isNaN(parsed)) return new Date(parsed).toISOString()
    }

    const rawTextDatePatterns = [
      /"dateText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"\s*\}/i,
      /\\"dateText\\"\s*:\s*\{\s*\\"simpleText\\"\s*:\s*\\"([^\\"]+)\\"\s*\}/i,
      /"publishedTimeText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"\s*\}/i,
      /\\"publishedTimeText\\"\s*:\s*\{\s*\\"simpleText\\"\s*:\s*\\"([^\\"]+)\\"\s*\}/i
    ]
    for(const pattern of rawTextDatePatterns){
      const match = txt.match(pattern)
      if(!match || !match[1]) continue
      const dateText = (match[1] || '').replace(/\\u0026/g, '&')
      const absolute = parseYouTubeAbsoluteDateText(dateText)
      if(absolute) return absolute
      const parsed = Date.parse(dateText)
      if(!Number.isNaN(parsed)) return new Date(parsed).toISOString()
      const relative = parseYouTubeRelativeDate(dateText)
      if(relative) return relative
    }
  }catch(e){ }
  return ''
}

function openQueueTabFor(href, title, publishedAtFromPage = ''){
  // fetch the page title when possible to ensure queued item title matches the target
  (async ()=>{
    try{
      const [fetched, pagePublishedAt] = await Promise.all([
        fetchPageTitle(href),
        (publishedAtFromPage && isReasonablePublishDate(publishedAtFromPage))
          ? Promise.resolve(publishedAtFromPage)
          : fetchPagePublishedAt(href)
      ])
      const finalTitle = fetched || title || ''
      const resolvedPublishedAt = isReasonablePublishDate(pagePublishedAt) ? pagePublishedAt : ''
      console.debug('openQueueTabFor', {href, title, fetched, publishedAt: resolvedPublishedAt, finalTitle})
      const u = new URL(href)
      let vid = u.searchParams.get('v')
      if(!vid){ const parts = u.pathname.split('/').filter(Boolean); vid = parts.pop() }
      const item = { id: uid(), url: href, title: finalTitle, videoId: vid, favorite:false, created: new Date().toISOString(), publishedAt: resolvedPublishedAt }
      chrome.storage.local.get({queuedItems:[]}, (res)=>{
        const arr = res.queuedItems || []
        arr.unshift(item)
        chrome.storage.local.set({queuedItems: arr})
      })
    }catch(e){
      const item = { id: uid(), url: href||APP_URL, title: title||'', videoId: null, favorite:false, created: new Date().toISOString(), publishedAt: publishedAtFromPage || '' }
      console.debug('openQueueTabFor fallback item', item)
      chrome.storage.local.get({queuedItems:[]}, (res)=>{
        const arr = res.queuedItems || []
        arr.unshift(item)
        chrome.storage.local.set({queuedItems: arr})
      })
    }
  })()
}

async function queuePlaylistFor(playlistUrl){
  try{
    const videos = await extractPlaylistItems(playlistUrl)
    if(!videos.length) return {ok:false, count:0}

    const baseMs = Date.now() - (videos.length * 1000)
    const payload = videos.map((video, index)=>(
      {
        id: uid(),
        url: video.url,
        title: video.title,
        videoId: video.videoId,
        favorite: false,
        created: new Date(baseMs + (index * 1000)).toISOString(),
        publishedAt: video.publishedAt || ''
      }
    ))

    queueManyItems(payload)
    return {ok:true, count: payload.length}
  }catch(e){
    return {ok:false, count:0}
  }
}

function extractVideoIdFromUrl(url){
  try{
    const u = new URL(url)
    if(u.pathname === '/watch') return safeText(u.searchParams.get('v'))
    if(u.pathname.startsWith('/shorts/')) return safeText(u.pathname.split('/').filter(Boolean)[1])
  }catch(e){ }
  return ''
}

function extractListIdFromUrl(url){
  try{ return safeText(new URL(url).searchParams.get('list')) }catch(e){ return '' }
}

function canonicalPlaylistUrlFromUrl(url){
  try{
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if(!(host === 'youtube.com' || host.endsWith('.youtube.com'))) return ''

    const listId = safeText(parsed.searchParams.get('list'))
    if(!listId) return ''

    return `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`
  }catch(e){ return '' }
}

function normalizePlaylistIncoming(video, fallbackListId, index){
  const fromVideoId = safeText(video && video.videoId)
  const fromUrlVideoId = extractVideoIdFromUrl(video && video.url)
  const videoId = fromVideoId || fromUrlVideoId
  if(!videoId) return null

  const listId = extractListIdFromUrl(video && video.url) || fallbackListId
  const url = listId
    ? `https://www.youtube.com/watch?v=${videoId}&list=${encodeURIComponent(listId)}`
    : `https://www.youtube.com/watch?v=${videoId}`

  return {
    id: uid(),
    url,
    title: safeText(video && video.title) || `YouTube video ${videoId}`,
    videoId,
    favorite: false,
    created: new Date(Date.now() - ((index + 1) * 1000)).toISOString(),
    publishedAt: safeText(video && video.publishedAt)
  }
}

async function inspectTabPublishedAt(tab){
  if(!tab || typeof tab.id !== 'number' || !tab.url) return ''
  try{
    const results = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: ()=>{
        const candidates = [
          window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.microformat && window.ytInitialPlayerResponse.microformat.playerMicroformatRenderer && window.ytInitialPlayerResponse.microformat.playerMicroformatRenderer.publishDate,
          window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.microformat && window.ytInitialPlayerResponse.microformat.playerMicroformatRenderer && window.ytInitialPlayerResponse.microformat.playerMicroformatRenderer.uploadDate,
          window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.videoDetails && window.ytInitialPlayerResponse.videoDetails.publishDate,
          window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.videoDetails && window.ytInitialPlayerResponse.videoDetails.uploadDate,
          window.ytInitialData && window.ytInitialData.microformat && window.ytInitialData.microformat.playerMicroformatRenderer && window.ytInitialData.microformat.playerMicroformatRenderer.publishDate,
          window.ytInitialData && window.ytInitialData.microformat && window.ytInitialData.microformat.playerMicroformatRenderer && window.ytInitialData.microformat.playerMicroformatRenderer.uploadDate
        ].filter(Boolean)
        return candidates[0] ? String(candidates[0]) : ''
      }
    })
    const publishedAt = results && results[0] && typeof results[0].result === 'string' ? results[0].result : ''
    return publishedAt || ''
  }catch(e){
    return ''
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse)=>{
  if(!message || !message.type) return

  if(message.type === 'fetch-playlist-items'){
    const playlistUrl = canonicalPlaylistUrlFromUrl(message.url || '')
    if(!playlistUrl){
      sendResponse({ok:false, items:[], error:'Please enter a valid YouTube playlist URL'})
      return true
    }

    resolvePlaylistItemsForRandom(playlistUrl)
      .then((items)=>sendResponse({ok:true, items}))
      .catch(()=>sendResponse({ok:false, items:[], error:'Could not load playlist items'}))
    return true
  }

  if(message.type === 'open-url'){
    const targetUrl = safeText(message.url)
    if(!targetUrl){
      sendResponse({ok:false, error:'Missing URL'})
      return true
    }

    chrome.tabs.create({url: targetUrl}, ()=>{
      if(chrome.runtime.lastError){
        sendResponse({ok:false, error: chrome.runtime.lastError.message || 'Could not open URL'})
        return
      }
      sendResponse({ok:true})
    })
    return true
  }

  if(message.type === 'fetch-video-published-at'){
    const targetUrl = safeText(message.url)
    if(!targetUrl){
      sendResponse({ok:false, publishedAt:'', error:'Missing URL'})
      return true
    }

    fetchPagePublishedAt(targetUrl)
      .then((publishedAt)=>sendResponse({ok:true, publishedAt: publishedAt || ''}))
      .catch(()=>sendResponse({ok:false, publishedAt:'', error:'Could not fetch publish date'}))
    return true
  }

  if(message.type === 'queue-video-url'){
    const playlistUrl = canonicalPlaylistUrlFromUrl(message.url || '')
    if(playlistUrl){
      queuePlaylistFor(playlistUrl).then(sendResponse)
      return true
    }

    openQueueTabFor(message.url, message.title || '', message.publishedAt || '')
    sendResponse({ok:true})
    return true
  }

  if(message.type === 'queue-playlist-url'){
    queuePlaylistFor(message.url).then(sendResponse)
    return true
  }

  if(message.type === 'queue-playlist-items'){
    const incoming = Array.isArray(message.items) ? message.items : []
    if(!incoming.length){
      sendResponse({ok:false, count:0})
      return true
    }

    const fallbackListId = extractListIdFromUrl(message.url || '')
    const payload = incoming
      .map((video, index)=>normalizePlaylistIncoming(video, fallbackListId, index))
      .filter(Boolean)

    if(!payload.length){
      sendResponse({ok:false, count:0})
      return true
    }

    queueManyItems(payload)
    sendResponse({ok:true, count: payload.length})
    return true
  }
})
