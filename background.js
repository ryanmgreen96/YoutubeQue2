const APP_URL = 'https://ryanmgreen0-svg.github.io/youtubeQue2/' // GitHub Pages URL for your repo

chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.create({
    id:'queue-video',
    title:'Add to queue',
    contexts:['page','link','image','video']
  })
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
    // if we only have the page url (or nothing), try to resolve a hovered link under cursor
    if(!targetUrl || targetUrl === (tab && tab.url)){
      const found = await tryResolveFromHover()
      console.debug('tryResolveFromHover result', found)
      if(found && found.href) targetUrl = found.href
      if(found && found.text) {
        openQueueTabFor(targetUrl || tab.url, found.text); return
      }
    }

    // if we got here and still don't have link text, fallback to page title then fetch title
    try{
      const results = await chrome.scripting.executeScript({ target: {tabId: tab.id}, func: ()=>document.title })
      const pageTitle = results?.[0]?.result || ''
      console.debug('using pageTitle fallback', pageTitle)
      openQueueTabFor(targetUrl || (tab && tab.url) || null, pageTitle)
    }catch(e){ openQueueTabFor(targetUrl || (tab && tab.url) || null, null) }
  })()
})

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8) }
async function fetchPageTitle(url){
  try{
    const res = await fetch(url)
    const txt = await res.text()
    // try to parse og:title/twitter:title or fallback to <title>
    let doc
    try{ doc = new DOMParser().parseFromString(txt, 'text/html') }catch(e){ doc = null }
    if(doc){
      const og = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
      const tw = doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')
      const t = doc.querySelector('title')?.textContent
      return (og||tw||t||'').trim()
    }
    // fallback: regex for title
    const m = txt.match(/<title[^>]*>([^<]+)<\/title>/i)
    return m ? m[1].trim() : ''
  }catch(e){ return '' }
}

function openQueueTabFor(href, title){
  // fetch the page title when possible to ensure queued item title matches the target
  (async ()=>{
    try{
      const fetched = await fetchPageTitle(href)
      const finalTitle = fetched || title || ''
      console.debug('openQueueTabFor', {href, title, fetched, finalTitle})
      const u = new URL(href)
      let vid = u.searchParams.get('v')
      if(!vid){ const parts = u.pathname.split('/').filter(Boolean); vid = parts.pop() }
      const item = { id: uid(), url: href, title: finalTitle, videoId: vid, favorite:false, created: new Date().toISOString() }
      chrome.storage.local.get({queuedItems:[]}, (res)=>{
        const arr = res.queuedItems || []
        arr.unshift(item)
        chrome.storage.local.set({queuedItems: arr})
      })
    }catch(e){
      const item = { id: uid(), url: href||APP_URL, title: title||'', videoId: null, favorite:false, created: new Date().toISOString() }
      console.debug('openQueueTabFor fallback item', item)
      chrome.storage.local.get({queuedItems:[]}, (res)=>{
        const arr = res.queuedItems || []
        arr.unshift(item)
        chrome.storage.local.set({queuedItems: arr})
      })
    }
  })()
}
