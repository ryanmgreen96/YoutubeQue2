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

    const inPlaylistRow = !!target.closest(
      'ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer, ytd-playlist-video-list-renderer ytd-playlist-panel-video-renderer'
    )
    const rowVideoLink = !!target.closest(
      'ytd-playlist-panel-video-renderer a#video-title, ytd-playlist-panel-video-renderer a#thumbnail, ytd-playlist-video-renderer a#video-title, ytd-playlist-video-renderer a#thumbnail'
    )
    if(inPlaylistRow && rowVideoLink) return false

    const hrefHasList = /[?&]list=/.test(hrefSource || '')
    if(hrefHasList) return true

    const inPlaylistTitleArea = !!target.closest(
      'ytd-playlist-sidebar-primary-info-renderer, ytd-playlist-header-renderer, ytd-playlist-panel-renderer #title, ytd-playlist-panel-renderer h1, ytd-playlist-renderer'
    )
    if(inPlaylistTitleArea) return true

    const ownLabel = (target.getAttribute && (target.getAttribute('aria-label') || target.getAttribute('title'))) || ''
    if(/playlist/i.test(ownLabel)) return true

    const hrefLooksLikePlaylist = /[?&]list=/.test(hrefSource || '') && /\/playlist(\?|$)/.test(hrefSource || '')
    if(hrefLooksLikePlaylist) return true

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

  function collectPlaylistItemsFromDom(listId){
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

  function queueTitleFromElement(el){
    const label = (el && (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title')))) || ''
    if(label.trim()) return label.trim()
    const titleNode = el && el.closest && el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer')?.querySelector('#video-title, a#video-title, [title]')
    const text = (titleNode && (titleNode.getAttribute && (titleNode.getAttribute('aria-label') || titleNode.getAttribute('title')) || titleNode.textContent)) || el?.textContent || ''
    return text.trim()
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

  function mergeUniqueByUrl(incoming, existing){
    const seen = new Set()
    const merged = []

    incoming.concat(existing).forEach((item)=>{
      if(!item || !item.url || seen.has(item.url)) return
      seen.add(item.url)
      merged.push(item)
    })

    return merged
  }

  try{
    if(isAppHost()){
    chrome.storage.local.get(['queuedItems', SAVED_LINKS_EXT_KEY], (res)=>{
      const q = res.queuedItems || []
      const savedLinks = res[SAVED_LINKS_EXT_KEY] || []
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
          const mergedSaved = mergeUniqueByUrl(savedLinks, existingSaved)
          localStorage.setItem(SAVED_LINKS_APP_KEY, JSON.stringify(mergedSaved))
          changed = true
        }
      }catch(e){
        if(savedLinks.length){
          localStorage.setItem(SAVED_LINKS_APP_KEY, JSON.stringify(savedLinks))
          changed = true
        }
      }

      chrome.storage.local.set({queuedItems: [], [SAVED_LINKS_EXT_KEY]: []}, ()=>{
        if(changed) location.reload()
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
          await tryLoadMorePlaylistItems(listId)
          const domItems = collectPlaylistItemsFromDom(listId)

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
        chrome.runtime.sendMessage({type:'queue-video-url', url: videoUrl, title})
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
