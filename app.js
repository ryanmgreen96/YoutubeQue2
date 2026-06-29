const APP_KEY = 'ytQueueItems_v1'
const PAGE_KEY = 'ytQueuePages_v1'
const SAVED_LINKS_APP_KEY = 'ytSavedVideos_v1'
const HEADER_LINKS_KEY = 'ytHeaderLinks_v1'
const APP_TITLE = document.getElementById('view-title')
const sections = document.getElementById('sections')
const leftNavEl = document.getElementById('left-nav')
const addPageBtn = document.getElementById('add-page-btn')
const savedLinksEl = document.getElementById('saved-links')
const headerLinksEl = document.getElementById('header-links')
const template = document.getElementById('item-template')

let items = load()
let pages = loadPages()
let savedLinks = loadSavedLinks()
let headerLinks = loadHeaderLinks()
let currentPageId = 'home'
let currentTabId = null
let editMode = false
let selectedItemIds = new Set()

function save(){ localStorage.setItem(APP_KEY, JSON.stringify(items)) }
function load(){ try{ return JSON.parse(localStorage.getItem(APP_KEY)||'[]') }catch(e){return[]}}
function loadPages(){
  try{
    const stored = JSON.parse(localStorage.getItem(PAGE_KEY)||'[]')
    if(!Array.isArray(stored)) return []
    return stored
      .filter(page=>page && page.id && page.title)
      .map(page=>({
        ...page,
        tabs: Array.isArray(page.tabs)
          ? page.tabs.filter(tab=>tab && tab.id && tab.title).map(tab=>({...tab}))
          : []
      }))
  }catch(e){return[]}
}
function savePages(){ localStorage.setItem(PAGE_KEY, JSON.stringify(pages)) }
function loadSavedLinks(){ try{ return JSON.parse(localStorage.getItem(SAVED_LINKS_APP_KEY)||'[]') }catch(e){return[]}}
function saveSavedLinks(){ localStorage.setItem(SAVED_LINKS_APP_KEY, JSON.stringify(savedLinks)) }
function removeSavedLink(id){ savedLinks = savedLinks.filter(link=>link.id!==id); saveSavedLinks(); renderSavedLinks() }

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8) }

function normalizePageId(pageId){ return pageId || 'home' }
function normalizeTabId(tabId){ return tabId || null }
function getPageTitle(pageId){ if(pageId==='home') return 'Home'; const page = pages.find(item=>item.id===pageId); return page ? page.title : 'Home' }
function getPageById(pageId){ return pages.find(page=>page.id===pageId) || null }
function getTabById(page, tabId){ return page && Array.isArray(page.tabs) ? page.tabs.find(tab=>tab.id===tabId) || null : null }
function getCurrentPage(){ return currentPageId==='home' ? null : getPageById(currentPageId) }
function getCurrentTab(){ const page = getCurrentPage(); return page ? getTabById(page, currentTabId) : null }
function addPage(title){
  const pageTitle = (title || '').trim()
  if(!pageTitle) return
  const page = {id: uid(), title: pageTitle, created: new Date().toISOString(), tabs: []}
  pages.push(page)
  savePages()
  setCurrentPage(page.id)
  renderLeftNav()
}
function addTab(pageId, title){
  const page = getPageById(pageId)
  const tabTitle = (title || '').trim()
  if(!page || !tabTitle) return null
  const tab = {id: uid(), title: tabTitle, created: new Date().toISOString()}
  page.tabs = Array.isArray(page.tabs) ? page.tabs : []
  page.tabs.push(tab)
  savePages()
  renderLeftNav()
  return tab
}
function removePage(pageId){
  const page = getPageById(pageId)
  if(!page) return
  const ok = confirm(`Delete page "${page.title}"? Videos on this page will move back to Home.`)
  if(!ok) return
  items = items.map(item=>normalizePageId(item.pageId)===pageId ? {...item, pageId:'home', tabId:null} : item)
  pages = pages.filter(item=>item.id!==pageId)
  if(currentPageId === pageId){
    currentPageId = 'home'
    currentTabId = null
  }
  save()
  savePages()
  renderLeftNav()
  render()
}
function removeTab(pageId, tabId){
  const page = getPageById(pageId)
  const tab = getTabById(page, tabId)
  if(!page || !tab) return
  const ok = confirm(`Delete tab "${tab.title}" from "${page.title}"? Videos in this tab will move to the page main view.`)
  if(!ok) return
  items = items.map(item=>normalizePageId(item.pageId)===pageId && normalizeTabId(item.tabId)===tabId ? {...item, tabId:null} : item)
  page.tabs = page.tabs.filter(item=>item.id!==tabId)
  if(currentPageId === pageId && currentTabId === tabId){
    currentTabId = null
  }
  save()
  savePages()
  renderLeftNav()
  render()
}
function moveSelectedItemsToDestination(pageId, tabId=null){
  const targetPageId = normalizePageId(pageId)
  const targetTabId = normalizeTabId(tabId)
  if(!selectedItemIds.size) return
  items = items.map(item=>selectedItemIds.has(item.id) ? {...item, pageId: targetPageId, tabId: targetTabId} : item)
  selectedItemIds.clear()
  editMode = false
  currentPageId = targetPageId
  currentTabId = targetTabId
  save()
  renderLeftNav()
  render()
}
function moveSelectedItemsToPage(pageId){
  moveSelectedItemsToDestination(pageId, null)
}
function toggleEditMode(){
  editMode = !editMode
  if(!editMode) selectedItemIds.clear()
  render()
}
function selectItem(id){
  if(selectedItemIds.has(id)) selectedItemIds.delete(id)
  else selectedItemIds.add(id)
  render()
}
function setCurrentPage(pageId, tabId=null){
  currentPageId = normalizePageId(pageId)
  currentTabId = normalizeTabId(tabId)
  editMode = false
  selectedItemIds.clear()
  renderLeftNav()
  render()
}

function extractVideoId(url){
  try{
    const u = new URL(url)
    if(u.hostname.includes('youtube')){
      if(u.searchParams.has('v')) return u.searchParams.get('v')
      const parts = u.pathname.split('/')
      return parts.pop() || parts.pop()
    }
    return null
  }catch(e){return null}
}

function makeThumbUrl(vid){ return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` }

function addItem({url,title,videoId,favorite=false,pageId='home',tabId=null,created=new Date().toISOString()}){
  const id = uid()
  const item = {id, url, title, videoId, favorite, pageId: normalizePageId(pageId), tabId: normalizeTabId(tabId), created, publishedAt: ''}
  items.unshift(item)
  save()
  render()
}

function removeItem(id){ items = items.filter(i=>i.id!==id); selectedItemIds.delete(id); save(); render() }

function toggleFav(id){ const it = items.find(i=>i.id===id); if(!it) return; it.favorite=!it.favorite; save(); render() }

function loadHeaderLinks(){ try{ return JSON.parse(localStorage.getItem(HEADER_LINKS_KEY)||'[]') }catch(e){return[]} }
function saveHeaderLinks(){ localStorage.setItem(HEADER_LINKS_KEY, JSON.stringify(headerLinks)) }
function addHeaderLink({title,url}){ const link = {id:uid(), title, url, created: new Date().toISOString()}; headerLinks.push(link); saveHeaderLinks(); renderHeaderLinks(); }
function editHeaderLink(id){ const link = headerLinks.find(l=>l.id===id); if(!link) return; const newTitle = prompt('Edit text label', link.title); if(!newTitle) return; const newUrl = prompt('Edit URL', link.url); if(!newUrl) return; link.title = newTitle; link.url = newUrl; saveHeaderLinks(); renderHeaderLinks(); }
function renderHeaderLinks(){ headerLinksEl.innerHTML = ''; headerLinks.forEach(link=>{
    const span = document.createElement('span')
    span.className = 'header-link'
    span.textContent = link.title
    span.title = link.url
    span.addEventListener('click', ()=>{ window.open(link.url, '_blank') })
    let pressTimer = null
    span.addEventListener('mousedown', (ev)=>{ if(ev.button!==0) return; pressTimer = setTimeout(()=>{ editHeaderLink(link.id) }, 600) })
    span.addEventListener('mouseup', ()=>{ clearTimeout(pressTimer) })
    span.addEventListener('mouseleave', ()=>{ clearTimeout(pressTimer) })
    span.addEventListener('dblclick', (ev)=>{ ev.preventDefault(); editHeaderLink(link.id) })
    headerLinksEl.appendChild(span)
  })
}

function editItem(id){ const it = items.find(i=>i.id===id); if(!it) return; const newUrl = prompt('Edit URL', it.url); if(!newUrl) return; const newTitle = prompt('Edit title', it.title)||it.title; const vid = extractVideoId(newUrl)||it.videoId; it.url=newUrl; it.title=newTitle; it.videoId=vid; save(); render() }

function renderLeftNav(){
  if(!leftNavEl) return
  leftNavEl.innerHTML = ''

  const homeButton = document.createElement('button')
  homeButton.type = 'button'
  homeButton.className = `page-link${currentPageId==='home' ? ' selected' : ''}`
  homeButton.textContent = 'Home'
  homeButton.addEventListener('click', ()=>{
    if(editMode && selectedItemIds.size){ moveSelectedItemsToPage('home'); return }
    setCurrentPage('home')
  })
  leftNavEl.appendChild(homeButton)

  pages.forEach(page=>{
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `page-link${currentPageId===page.id ? ' selected' : ''}`
    button.textContent = page.title
    button.title = page.title
    button.addEventListener('click', ()=>{
      if(editMode && selectedItemIds.size){
        if(Array.isArray(page.tabs) && page.tabs.length){
          promptDestinationForPage(page)
          return
        }
        moveSelectedItemsToDestination(page.id, null)
        return
      }
      setCurrentPage(page.id)
    })
    attachLongPressDelete(button, ()=>removePage(page.id))
    leftNavEl.appendChild(button)
  })
}

function promptDestinationForPage(page){
  const tabs = Array.isArray(page.tabs) ? page.tabs : []
  if(!tabs.length){
    moveSelectedItemsToDestination(page.id, null)
    return
  }

  const options = ['0. Main page']
  tabs.forEach((tab, index)=>{ options.push(`${index + 1}. ${tab.title}`) })
  const response = prompt(`Move selected videos into ${page.title}\n${options.join('\n')}`, '0')
  if(response === null) return

  const choice = Number.parseInt(response, 10)
  if(Number.isNaN(choice)) return
  if(choice === 0){
    moveSelectedItemsToDestination(page.id, null)
    return
  }

  const chosenTab = tabs[choice - 1]
  if(!chosenTab) return
  moveSelectedItemsToDestination(page.id, chosenTab.id)
}

function renderPageHeader(page){
  const header = document.createElement('div')
  header.className = 'page-header'

  const topRow = document.createElement('div')
  topRow.className = 'page-header-row'

  const titleButton = document.createElement('button')
  titleButton.type = 'button'
  titleButton.className = 'page-heading'
  titleButton.textContent = page.title
  titleButton.title = 'Click to return to the main page'
  titleButton.addEventListener('click', ()=>{ setCurrentPage(page.id, null) })
  attachLongPressDelete(titleButton, ()=>removePage(page.id))
  topRow.appendChild(titleButton)

  const addTabButton = document.createElement('button')
  addTabButton.type = 'button'
  addTabButton.className = 'page-tab-add'
  addTabButton.textContent = '+'
  addTabButton.title = 'Add tab'
  addTabButton.addEventListener('click', ()=>{
    const fallbackTitle = `Tab ${page.tabs.length + 1}`
    const tabTitle = prompt(`Tab title for ${page.title}`, fallbackTitle)
    if(tabTitle === null) return
    const tab = addTab(page.id, tabTitle || fallbackTitle)
    if(tab) setCurrentPage(page.id, tab.id)
  })
  topRow.appendChild(addTabButton)

  page.tabs.forEach((tab)=>{
    const tabButton = document.createElement('button')
    tabButton.type = 'button'
    tabButton.className = `page-tab${currentTabId===tab.id ? ' selected' : ''}`
    tabButton.textContent = tab.title
    tabButton.addEventListener('click', ()=>setCurrentPage(page.id, tab.id))
    attachLongPressDelete(tabButton, ()=>removeTab(page.id, tab.id))
    topRow.appendChild(tabButton)
  })

  header.appendChild(topRow)
  return header
}

function attachLongPressDelete(button, onDelete){
  let pressTimer = null
  let suppressNextClick = false
  const clear = ()=>{ if(pressTimer){ clearTimeout(pressTimer); pressTimer = null } }
  button.addEventListener('pointerdown', (ev)=>{
    if(ev.button !== 0) return
    clear()
    pressTimer = setTimeout(()=>{
      pressTimer = null
      suppressNextClick = true
      onDelete()
    }, 650)
  })
  button.addEventListener('pointerup', clear)
  button.addEventListener('pointerleave', clear)
  button.addEventListener('pointercancel', clear)
  button.addEventListener('click', (ev)=>{
    if(!suppressNextClick) return
    suppressNextClick = false
    ev.preventDefault()
    ev.stopImmediatePropagation()
  }, true)
}

function render(){ sections.innerHTML=''
  const list = items.filter(i=>normalizePageId(i.pageId)===currentPageId && normalizeTabId(i.tabId)===currentTabId)
  const groups = {today:[], yesterday:[], earlier:[]}
  const now = new Date();

  APP_TITLE.textContent = getPageTitle(currentPageId)

  if(currentPageId !== 'home'){
    const page = getCurrentPage()
    if(page){
      sections.appendChild(renderPageHeader(page))
    }
    const sortedList = list.slice().sort((a, b)=>{
      const aDate = new Date(a.publishedAt || a.created || 0).getTime()
      const bDate = new Date(b.publishedAt || b.created || 0).getTime()
      return aDate - bDate
    })
    if(sortedList.length){
      renderSection('', sortedList)
    }else{
      sections.innerHTML += '<p style="padding:12px;color:#9fb0d6">No items</p>'
    }
    return
  }

  list.forEach(it=>{
    const d = new Date(it.created)
    const diff = Math.floor((now - d)/(1000*60*60*24))
    if(diff===0) groups.today.push(it)
    else if(diff===1) groups.yesterday.push(it)
    else groups.earlier.push(it)
  })

  if(groups.today.length) renderSection('Today', groups.today)
  if(groups.yesterday.length) renderSection('Yesterday', groups.yesterday)
  if(groups.earlier.length) renderSection('Earlier', groups.earlier)
  if(!groups.today.length && !groups.yesterday.length && !groups.earlier.length){ sections.innerHTML='<p style="padding:12px;color:#9fb0d6">No items</p>' }
}

function renderSavedLinks(){
  if(!savedLinksEl) return
  if(!savedLinks.length){
    savedLinksEl.innerHTML = ''
    return
  }

  const title = document.createElement('div')
  title.className = 'saved-links-title'
  title.textContent = 'Saved videos'

  const list = document.createElement('ul')
  list.className = 'saved-links-list'

  savedLinks.forEach((link)=>{
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.href = link.url
    a.textContent = link.title || link.url
    a.title = link.title || link.url
    a.addEventListener('click', (ev)=>{
      ev.preventDefault()
      window.open(link.url, '_blank', 'noopener,noreferrer')
      removeSavedLink(link.id)
    })
    li.appendChild(a)
    list.appendChild(li)
  })

  savedLinksEl.innerHTML = ''
  savedLinksEl.appendChild(title)
  savedLinksEl.appendChild(list)
}

function renderSection(title, list){
  const s = document.createElement('div'); s.className='section'
  if(title){
    const header = document.createElement('div')
    header.className = 'section-header'
    const h = document.createElement('h2'); h.textContent=title; header.appendChild(h)
    if(title==='Today' && currentPageId==='home'){
      const editButton = document.createElement('button')
      editButton.type = 'button'
      editButton.className = 'edit-mode-btn'
      editButton.textContent = editMode ? `Done${selectedItemIds.size ? ` (${selectedItemIds.size})` : ''}` : 'Edit'
      editButton.addEventListener('click', toggleEditMode)
      header.appendChild(editButton)
    }
    s.appendChild(header)
  }
  const g = document.createElement('div'); g.className='grid'
  list.forEach(it=>{
    const node = template.content.cloneNode(true)
    const el = node.querySelector('.item')
    const img = node.querySelector('.thumb')
    const ttl = node.querySelector('.title')
    const starBtn = node.querySelector('.star')
    const delBtn = node.querySelector('.delete')
    img.src = it.videoId ? makeThumbUrl(it.videoId) : ''
    ttl.textContent = it.title || it.url
    starBtn.textContent = it.favorite ? '★' : '☆'
    el.classList.toggle('is-editing', editMode)
    el.classList.toggle('is-selected', selectedItemIds.has(it.id))
    starBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleFav(it.id) })
    delBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); removeItem(it.id) })
    el.addEventListener('click', ()=>{
      if(editMode){ selectItem(it.id); return }
      if(currentPageId === 'home'){
        removeItem(it.id)
        window.open(it.url, '_blank')
        return
      }
      window.open(it.url, '_blank')
    })

    // long-press to edit
    let pressTimer = null
    el.addEventListener('mousedown', ()=>{ if(editMode) return; pressTimer = setTimeout(()=>{ editItem(it.id) },600) })
    el.addEventListener('mouseup', ()=>{ clearTimeout(pressTimer) })
    el.addEventListener('mouseleave', ()=>{ clearTimeout(pressTimer) })

    g.appendChild(node)
  })
  s.appendChild(g)
  sections.appendChild(s)
}

addPageBtn.addEventListener('click', ()=>{
  const label = prompt('Page title')
  if(!label) return
  addPage(label)
})

// handle url params (extension will open app with params)
function handleParams(){ const p = new URLSearchParams(location.search); if(p.has('videoId')){
  const videoId = p.get('videoId'); const title = p.get('title')? decodeURIComponent(p.get('title')) : '';
  const url = `https://www.youtube.com/watch?v=${videoId}`
  addItem({url,title:title||`YouTube video ${videoId}`,videoId,pageId:'home',tabId:null,created:new Date().toISOString()})
  // remove params from url
  history.replaceState({},document.title,location.pathname)
}}

window.addEventListener('load', ()=>{
  if(!pages.length){
    pages = []
    savePages()
  }
  currentPageId = 'home'
  APP_TITLE.textContent = 'Home'
  renderLeftNav()
  renderHeaderLinks()
  handleParams()
  savedLinks = loadSavedLinks()
  renderSavedLinks()
  render()
})
