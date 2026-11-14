const LIBRARY_ITEMS_KEY = 'ytLibraryItems_v1'
const saveCurrentButton = document.getElementById('save-current')
const searchInput = document.getElementById('search')
const libraryList = document.getElementById('library-list')
const statusElement = document.getElementById('status')

let savedLinks = []

function setStatus(message, isError=false){
  statusElement.textContent = message
  statusElement.classList.toggle('error', isError)
}

function getDomain(url){
  try{
    return new URL(url).hostname.replace(/^www\./, '')
  }catch(e){
    return url || ''
  }
}

function renderLibrary(){
  const query = searchInput.value.trim().toLowerCase()
  const filtered = savedLinks.filter((item)=>{
    const title = typeof item.title === 'string' ? item.title : ''
    return !query || `${title} ${item.url}`.toLowerCase().includes(query)
  })

  libraryList.replaceChildren()
  if(!filtered.length){
    const empty = document.createElement('p')
    empty.className = 'empty-state'
    empty.textContent = savedLinks.length ? 'No matching saved pages.' : 'Your library is empty. Save a page to get started.'
    libraryList.appendChild(empty)
    return
  }

  filtered.forEach((item)=>{
    const row = document.createElement('div')
    row.className = 'library-row'

    const link = document.createElement('a')
    link.className = 'library-item'
    link.href = item.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.title = item.url

    const title = document.createElement('span')
    title.className = 'item-title'
    title.textContent = item.title || getDomain(item.url)

    const domain = document.createElement('span')
    domain.className = 'item-domain'
    domain.textContent = getDomain(item.url)
    link.append(title, domain)

    const removeButton = document.createElement('button')
    removeButton.className = 'remove-item'
    removeButton.type = 'button'
    removeButton.textContent = '×'
    removeButton.title = 'Remove from Library'
    removeButton.setAttribute('aria-label', `Remove ${item.title || item.url}`)
    removeButton.addEventListener('click', ()=>removeSavedItem(item.id))

    row.append(link, removeButton)
    libraryList.appendChild(row)
  })
}

async function loadLibrary(){
  const result = await chrome.storage.local.get({[LIBRARY_ITEMS_KEY]: []})
  savedLinks = Array.isArray(result[LIBRARY_ITEMS_KEY])
    ? result[LIBRARY_ITEMS_KEY].filter((item)=>item && typeof item.url === 'string')
    : []
  renderLibrary()
}

async function saveCurrentPage(){
  const [tab] = await chrome.tabs.query({active:true, currentWindow:true})
  if(!tab || typeof tab.url !== 'string'){
    throw new Error('Could not read the current tab')
  }

  let url
  try{
    url = new URL(tab.url)
  }catch(e){
    throw new Error('This page does not have a valid URL to save')
  }
  if(url.protocol !== 'http:' && url.protocol !== 'https:'){
    throw new Error('Only HTTP and HTTPS pages can be saved')
  }

  const result = await saveLibraryItem(url.href, tab.title || url.hostname)
  await loadLibrary()
  setStatus(result.alreadySaved ? 'This page is already in your Library.' : 'Saved to your Library.')
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

async function saveLibraryItem(url, title){
  const item = {
    id: Date.now().toString(36)+Math.random().toString(36).slice(2,8),
    url,
    title: title.trim() || getDomain(url) || url,
    created: new Date().toISOString(),
    publishedAt: ''
  }
  const result = await chrome.storage.local.get({[LIBRARY_ITEMS_KEY]: []})
  const updated = upsertSavedLibraryItem(result[LIBRARY_ITEMS_KEY], item)
  await chrome.storage.local.set({[LIBRARY_ITEMS_KEY]: updated.items})
  return {item, alreadySaved: updated.alreadySaved}
}

async function removeSavedItem(id){
  const next = savedLinks.filter((item)=>item.id !== id)
  await chrome.storage.local.set({[LIBRARY_ITEMS_KEY]: next})
  savedLinks = next
  renderLibrary()
  setStatus('Removed from your Library.')
}

saveCurrentButton.addEventListener('click', async ()=>{
  saveCurrentButton.disabled = true
  setStatus('Saving page…')
  try{
    await saveCurrentPage()
  }catch(error){
    setStatus(error && error.message ? error.message : 'Could not save this page.', true)
  }finally{
    saveCurrentButton.disabled = false
  }
})

searchInput.addEventListener('input', renderLibrary)

chrome.storage.onChanged.addListener((changes, area)=>{
  if(area === 'local' && changes[LIBRARY_ITEMS_KEY]){
    savedLinks = Array.isArray(changes[LIBRARY_ITEMS_KEY].newValue)
      ? changes[LIBRARY_ITEMS_KEY].newValue.filter((item)=>item && typeof item.url === 'string')
      : []
    renderLibrary()
  }
})

loadLibrary().catch((error)=>{
  setStatus(error && error.message ? error.message : 'Could not load your Library.', true)
})
