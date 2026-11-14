const LIBRARY_ITEMS_KEY = 'ytLibraryItems_v1'

chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.create({
    id:'save-to-library',
    title:'Save to Library',
    contexts:['page','link','image','video']
  })
})

chrome.contextMenus.onClicked.addListener((info, tab)=>{
  if(info.menuItemId !== 'save-to-library') return
  const url = info.linkUrl || info.srcUrl || info.pageUrl || (tab && tab.url) || ''
  const selectionTitle = typeof info.selectionText === 'string' ? info.selectionText.trim() : ''
  const title = url === (tab && tab.url)
    ? (selectionTitle || (tab.title || '').trim())
    : (selectionTitle || fallbackTitleFromUrl(url))

  saveLibraryItem(url, title).catch((error)=>{
    console.error('Could not save item to Library', error)
  })
})

function fallbackTitleFromUrl(rawUrl){
  try{
    const parsed = new URL(rawUrl)
    const part = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname
    return decodeURIComponent(part).replace(/[-_]+/g, ' ').trim() || parsed.hostname
  }catch(e){
    return rawUrl || 'Saved page'
  }
}

function upsertSavedLibraryItem(current, item){
  const links = Array.isArray(current) ? current : []
  const existingIndex = links.findIndex((link)=>link && link.url === item.url)
  const next = links.slice()
  if(existingIndex >= 0){
    next[existingIndex] = {...next[existingIndex], ...item, id: next[existingIndex].id || item.id}
  }else{
    next.unshift(item)
  }
  return {items: next, alreadySaved: existingIndex >= 0}
}

async function saveLibraryItem(url, title, durationSeconds=0){
  let parsedUrl
  try{
    parsedUrl = new URL(typeof url === 'string' ? url.trim() : '')
  }catch(e){
    throw new Error('This page does not have a valid URL to save')
  }
  if(parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:'){
    throw new Error('Only HTTP and HTTPS pages can be saved')
  }

  const item = {
    id: uid(),
    url: parsedUrl.href,
    title: (typeof title === 'string' ? title.trim() : '') || parsedUrl.hostname.replace(/^www\./, '') || parsedUrl.href,
    created: new Date().toISOString(),
    publishedAt: '',
    durationSeconds: Number(durationSeconds) || 0
  }
  const result = await chrome.storage.local.get({[LIBRARY_ITEMS_KEY]: []})
  const updated = upsertSavedLibraryItem(result[LIBRARY_ITEMS_KEY], item)
  await chrome.storage.local.set({[LIBRARY_ITEMS_KEY]: updated.items})
  return {item, alreadySaved: updated.alreadySaved}
}

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8) }
