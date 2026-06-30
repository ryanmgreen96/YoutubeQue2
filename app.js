const APP_KEY = 'ytQueueItems_v1'
const PAGE_KEY = 'ytQueuePages_v1'
const PAGE_TABS_KEY = 'ytPageTabs_v1'
const ACTIVE_TAB_KEY = 'ytActiveTabs_v1'
const PAGE_TITLE_FILTERS_KEY = 'ytPageTitleFilters_v1'
const SAVED_LINKS_APP_KEY = 'ytSavedVideos_v1'
const HEADER_LINKS_KEY = 'ytHeaderLinks_v1'
const APP_TITLE = document.getElementById('view-title')
const sections = document.getElementById('sections')
const leftNavEl = document.getElementById('left-nav')
const addPageBtn = document.getElementById('add-page-btn')
const savedLinksEl = document.getElementById('saved-links')
const headerLinksEl = document.getElementById('header-links')
const template = document.getElementById('item-template')
const holdDialogEl = document.getElementById('hold-action-dialog')
const holdDialogBackdropEl = holdDialogEl ? holdDialogEl.querySelector('.hold-dialog-backdrop') : null
const holdDialogTitleEl = document.getElementById('hold-dialog-title')
const holdMoveUpBtn = document.getElementById('hold-move-up-btn')
const holdMoveDownBtn = document.getElementById('hold-move-down-btn')
const holdDeleteBtn = document.getElementById('hold-delete-btn')
const holdExitBtn = document.getElementById('hold-exit-btn')

let items = load()
let pages = loadPages()
let pageTabs = loadPageTabs()
let activeTabs = loadActiveTabs()
let pageTitleFilters = loadPageTitleFilters()
let savedLinks = loadSavedLinks()
let headerLinks = loadHeaderLinks()
let currentPageId = 'home'
let editMode = false
let selectedItemIds = new Set()
let holdDialogState = null

function save(){ localStorage.setItem(APP_KEY, JSON.stringify(items)) }
function load(){ try{ return JSON.parse(localStorage.getItem(APP_KEY)||'[]') }catch(e){return[]}}
function loadPages(){
  try{
    const stored = JSON.parse(localStorage.getItem(PAGE_KEY)||'[]')
    if(!Array.isArray(stored)) return []
    return stored.filter(page=>page && page.id && page.title)
  }catch(e){return[]}
}
function savePages(){ localStorage.setItem(PAGE_KEY, JSON.stringify(pages)) }
function loadPageTabs(){
  try{
    const parsed = JSON.parse(localStorage.getItem(PAGE_TABS_KEY)||'{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  }catch(e){ return {} }
}
function savePageTabs(){ localStorage.setItem(PAGE_TABS_KEY, JSON.stringify(pageTabs)) }
function loadActiveTabs(){
  try{
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_TAB_KEY)||'{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  }catch(e){ return {} }
}
function saveActiveTabs(){ localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify(activeTabs)) }
function loadPageTitleFilters(){
  try{
    const parsed = JSON.parse(localStorage.getItem(PAGE_TITLE_FILTERS_KEY)||'{}')
    if(!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result = {}
    Object.keys(parsed).forEach(pid=>{
      if(!Array.isArray(parsed[pid])) return
      result[pid] = parsed[pid]
        .map(item=>typeof item==='string' ? item.trim() : '')
        .filter(Boolean)
    })
    return result
  }catch(e){ return {} }
}
function savePageTitleFilters(){ localStorage.setItem(PAGE_TITLE_FILTERS_KEY, JSON.stringify(pageTitleFilters)) }
function loadSavedLinks(){ try{ return JSON.parse(localStorage.getItem(SAVED_LINKS_APP_KEY)||'[]') }catch(e){return[]}}
function saveSavedLinks(){ localStorage.setItem(SAVED_LINKS_APP_KEY, JSON.stringify(savedLinks)) }
function removeSavedLink(id){ savedLinks = savedLinks.filter(link=>link.id!==id); saveSavedLinks(); renderSavedLinks() }

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8) }
function escapeRegExp(value){ return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function normalizePhrase(value){ return (value || '').trim().replace(/\s+/g, ' ') }
function getPageTitleFilters(pageId){
  const pid = normalizePageId(pageId)
  if(!Array.isArray(pageTitleFilters[pid])) pageTitleFilters[pid] = []
  return pageTitleFilters[pid]
}
function addPageTitleFilter(pageId, phrase){
  const pid = normalizePageId(pageId)
  const next = normalizePhrase(phrase)
  if(!next) return false
  const list = getPageTitleFilters(pid)
  if(list.some(item=>item.toLowerCase()===next.toLowerCase())) return false
  list.push(next)
  savePageTitleFilters()
  return true
}
function editPageTitleFilter(pageId, index, phrase){
  const pid = normalizePageId(pageId)
  const list = getPageTitleFilters(pid)
  if(index<0 || index>=list.length) return false
  const next = normalizePhrase(phrase)
  if(!next) return false
  if(list.some((item, itemIndex)=>itemIndex!==index && item.toLowerCase()===next.toLowerCase())) return false
  list[index] = next
  savePageTitleFilters()
  return true
}
function removePageTitleFilter(pageId, index){
  const pid = normalizePageId(pageId)
  const list = getPageTitleFilters(pid)
  if(index<0 || index>=list.length) return false
  list.splice(index, 1)
  savePageTitleFilters()
  return true
}
function applyPageTitleFilters(title, pageId){
  const source = title || ''
  if(!source) return source
  const filters = getPageTitleFilters(pageId)
  if(!filters.length) return source

  let cleaned = source
  const ordered = filters.slice().sort((a, b)=>b.length - a.length)
  ordered.forEach(phrase=>{
    const spacedPhrase = escapeRegExp(phrase).replace(/\s+/g, '\\s+')
    cleaned = cleaned.replace(new RegExp(spacedPhrase, 'ig'), ' ')
  })

  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([|:\-])\s+/g, ' $1 ')
    .replace(/^[\s|:\-]+|[\s|:\-]+$/g, '')
    .trim()

  return cleaned || source
}

function attachLongPress(target, onLongPress, delayMs = 600){
  let timer = null
  let didLongPress = false

  const start = (ev)=>{
    if(ev.type==='mousedown' && ev.button!==0) return
    didLongPress = false
    clearTimeout(timer)
    timer = setTimeout(()=>{
      didLongPress = true
      onLongPress()
    }, delayMs)
  }
  const cancel = ()=>{ clearTimeout(timer) }

  target.addEventListener('mousedown', start)
  target.addEventListener('mouseup', cancel)
  target.addEventListener('mouseleave', cancel)
  target.addEventListener('touchstart', start, {passive:true})
  target.addEventListener('touchend', cancel)
  target.addEventListener('touchcancel', cancel)

  return {
    consume(){
      if(!didLongPress) return false
      didLongPress = false
      return true
    }
  }
}
function closeHoldDialog(){
  holdDialogState = null
  if(!holdDialogEl) return
  holdDialogEl.classList.add('hidden')
  holdDialogEl.setAttribute('aria-hidden', 'true')
}
function movePage(pageId, delta){
  const pid = normalizePageId(pageId)
  const index = pages.findIndex(page=>page.id===pid)
  if(index<0) return false
  const nextIndex = index + delta
  if(nextIndex<0 || nextIndex>=pages.length) return false
  const copy = pages.slice()
  const [page] = copy.splice(index, 1)
  copy.splice(nextIndex, 0, page)
  pages = copy
  savePages()
  renderLeftNav()
  render()
  return true
}
function moveTabInPage(pageId, tabId, delta){
  const pid = normalizePageId(pageId)
  const tid = normalizeTabId(tabId)
  const tabs = getPageTabs(pid).slice()
  const index = tabs.findIndex(tab=>tab.id===tid)
  if(index<0) return false
  const nextIndex = index + delta
  if(nextIndex<0 || nextIndex>=tabs.length) return false
  const [tab] = tabs.splice(index, 1)
  tabs.splice(nextIndex, 0, tab)
  pageTabs[pid] = tabs
  savePageTabs()
  render()
  return true
}
function getHoldDialogModel(){
  if(!holdDialogState) return null

  if(holdDialogState.type==='page'){
    const page = pages.find(item=>item.id===holdDialogState.pageId)
    if(!page) return null
    const index = pages.findIndex(item=>item.id===page.id)
    return {
      title: `Page: ${page.title}`,
      canMoveUp: index > 0,
      canMoveDown: index < pages.length - 1,
      canDelete: true,
      onMoveUp: ()=>{ movePage(page.id, -1); renderHoldDialog() },
      onMoveDown: ()=>{ movePage(page.id, 1); renderHoldDialog() },
      onDelete: ()=>{
        if(!confirm(`Delete page "${page.title}" and all videos in it?`)) return
        closeHoldDialog()
        deletePage(page.id)
      }
    }
  }

  if(holdDialogState.type==='tab'){
    const pid = normalizePageId(holdDialogState.pageId)
    const tabs = getPageTabs(pid)
    const tab = tabs.find(item=>item.id===holdDialogState.tabId)
    if(!tab) return null
    const index = tabs.findIndex(item=>item.id===tab.id)
    return {
      title: `Tab: ${tab.title}`,
      canMoveUp: index > 0,
      canMoveDown: index < tabs.length - 1,
      canDelete: tabs.length > 1,
      onMoveUp: ()=>{ moveTabInPage(pid, tab.id, -1); renderHoldDialog() },
      onMoveDown: ()=>{ moveTabInPage(pid, tab.id, 1); renderHoldDialog() },
      onDelete: ()=>{
        if(!confirm(`Delete tab "${tab.title}"? Videos in it will move to another tab on this page.`)) return
        closeHoldDialog()
        deleteTabFromPage(pid, tab.id)
      }
    }
  }

  return null
}
function renderHoldDialog(){
  if(!holdDialogEl || !holdDialogTitleEl || !holdMoveUpBtn || !holdMoveDownBtn || !holdDeleteBtn) return
  const model = getHoldDialogModel()
  if(!model){
    closeHoldDialog()
    return
  }

  holdDialogTitleEl.textContent = model.title
  holdMoveUpBtn.disabled = !model.canMoveUp
  holdMoveDownBtn.disabled = !model.canMoveDown
  holdDeleteBtn.disabled = !model.canDelete

  holdMoveUpBtn.onclick = model.onMoveUp
  holdMoveDownBtn.onclick = model.onMoveDown
  holdDeleteBtn.onclick = model.onDelete

  holdDialogEl.classList.remove('hidden')
  holdDialogEl.setAttribute('aria-hidden', 'false')
}
function openPageHoldDialog(pageId){
  holdDialogState = {type:'page', pageId: normalizePageId(pageId)}
  renderHoldDialog()
}
function openTabHoldDialog(pageId, tabId){
  holdDialogState = {type:'tab', pageId: normalizePageId(pageId), tabId: normalizeTabId(tabId)}
  renderHoldDialog()
}

function normalizePageId(pageId){ return pageId || 'home' }
function normalizeTabId(tabId){ return tabId || 'default' }
function getPageTitle(pageId){ if(pageId==='home') return 'Home'; const page = pages.find(item=>item.id===pageId); return page ? page.title : 'Home' }
function getDefaultTab(){ return {id:'default', title:'Main'} }
function getPageTabs(pageId){
  const pid = normalizePageId(pageId)
  const list = pageTabs[pid]
  if(Array.isArray(list) && list.length) return list
  const fallback = [getDefaultTab()]
  pageTabs[pid] = fallback
  savePageTabs()
  return fallback
}
function getActiveTabId(pageId){
  const pid = normalizePageId(pageId)
  const tabs = getPageTabs(pid)
  const selected = normalizeTabId(activeTabs[pid])
  const exists = tabs.some(tab=>tab.id===selected)
  if(exists) return selected
  const fallback = tabs[0].id
  activeTabs[pid] = fallback
  saveActiveTabs()
  return fallback
}
function setActiveTab(pageId, tabId){
  const pid = normalizePageId(pageId)
  activeTabs[pid] = normalizeTabId(tabId)
  saveActiveTabs()
  render()
}
function addTabToPage(pageId, title){
  const tabTitle = (title || '').trim()
  if(!tabTitle) return
  const pid = normalizePageId(pageId)
  const tabs = getPageTabs(pid).slice()
  const tab = {id: uid(), title: tabTitle}
  tabs.push(tab)
  pageTabs[pid] = tabs
  savePageTabs()
  setActiveTab(pid, tab.id)
}
function deleteTabFromPage(pageId, tabId){
  const pid = normalizePageId(pageId)
  const tid = normalizeTabId(tabId)
  const tabs = getPageTabs(pid).slice()
  if(tabs.length <= 1) return

  const nextTabs = tabs.filter(tab=>tab.id !== tid)
  if(nextTabs.length === tabs.length) return
  const fallbackTabId = nextTabs[0].id

  items = items.map(item=>{
    if(normalizePageId(item.pageId)!==pid || normalizeTabId(item.tabId)!==tid) return item
    return {...item, tabId: fallbackTabId}
  })

  pageTabs[pid] = nextTabs
  if(normalizeTabId(activeTabs[pid])===tid) activeTabs[pid] = fallbackTabId
  savePageTabs()
  saveActiveTabs()
  save()
  render()
}
function addPage(title){
  const pageTitle = (title || '').trim()
  if(!pageTitle) return
  const page = {id: uid(), title: pageTitle, created: new Date().toISOString()}
  pages.push(page)
  savePages()
  pageTabs[page.id] = [getDefaultTab()]
  activeTabs[page.id] = 'default'
  pageTitleFilters[page.id] = []
  savePageTabs()
  saveActiveTabs()
  savePageTitleFilters()
  setCurrentPage(page.id)
  renderLeftNav()
}
function deletePage(pageId){
  const pid = normalizePageId(pageId)
  if(pid === 'home') return

  pages = pages.filter(page=>page.id !== pid)
  delete pageTabs[pid]
  delete activeTabs[pid]
  delete pageTitleFilters[pid]

  items = items.filter(item=>normalizePageId(item.pageId)!==pid)

  savePages()
  savePageTabs()
  saveActiveTabs()
  savePageTitleFilters()
  save()

  if(currentPageId===pid){
    setCurrentPage('home')
    return
  }
  renderLeftNav()
  render()
}
function ensurePageTabIntegrity(){
  let changedTabs = false
  let changedActive = false
  let changedItems = false
  let changedFilters = false

  getPageTabs('home')
  getActiveTabId('home')

  const validPageIds = new Set(['home', ...pages.map(page=>page.id)])

  Object.keys(pageTabs).forEach(pid=>{
    if(!validPageIds.has(pid)){
      delete pageTabs[pid]
      changedTabs = true
    }
  })

  Object.keys(activeTabs).forEach(pid=>{
    if(!validPageIds.has(pid)){
      delete activeTabs[pid]
      changedActive = true
    }
  })

  Object.keys(pageTitleFilters).forEach(pid=>{
    if(!validPageIds.has(pid) || pid==='home'){
      delete pageTitleFilters[pid]
      changedFilters = true
      return
    }
    const list = pageTitleFilters[pid]
    if(!Array.isArray(list)){
      pageTitleFilters[pid] = []
      changedFilters = true
      return
    }
    const cleaned = list.map(item=>normalizePhrase(item)).filter(Boolean)
    if(cleaned.length!==list.length || cleaned.some((item, index)=>item!==list[index])){
      pageTitleFilters[pid] = cleaned
      changedFilters = true
    }
  })

  pages.forEach(page=>{
    if(!Array.isArray(pageTitleFilters[page.id])){
      pageTitleFilters[page.id] = []
      changedFilters = true
    }
  })

  validPageIds.forEach(pid=>{
    const tabs = pageTabs[pid]
    if(!Array.isArray(tabs) || !tabs.length){
      pageTabs[pid] = [getDefaultTab()]
      changedTabs = true
    }
    const tabIds = new Set(pageTabs[pid].map(tab=>tab.id))
    const activeId = normalizeTabId(activeTabs[pid])
    if(!tabIds.has(activeId)){
      activeTabs[pid] = pageTabs[pid][0].id
      changedActive = true
    }
  })

  items = items.map(item=>{
    const nextPageId = validPageIds.has(normalizePageId(item.pageId)) ? normalizePageId(item.pageId) : 'home'
    const tabs = pageTabs[nextPageId] || [getDefaultTab()]
    const tabIds = new Set(tabs.map(tab=>tab.id))
    const nextTabId = tabIds.has(normalizeTabId(item.tabId)) ? normalizeTabId(item.tabId) : tabs[0].id
    if(nextPageId===normalizePageId(item.pageId) && nextTabId===normalizeTabId(item.tabId)) return item
    changedItems = true
    return {...item, pageId: nextPageId, tabId: nextTabId}
  })

  if(changedTabs) savePageTabs()
  if(changedActive) saveActiveTabs()
  if(changedFilters) savePageTitleFilters()
  if(changedItems) save()
}
function moveSelectedItemsToPage(pageId){
  const targetPageId = normalizePageId(pageId)
  const targetTabId = getActiveTabId(targetPageId)
  if(!selectedItemIds.size) return
  items = items.map(item=>selectedItemIds.has(item.id) ? {...item, pageId: targetPageId, tabId: targetTabId} : item)
  selectedItemIds.clear()
  editMode = false
  currentPageId = targetPageId
  save()
  renderLeftNav()
  render()
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
function setCurrentPage(pageId){
  closeHoldDialog()
  const pid = normalizePageId(pageId)
  const known = pid === 'home' || pages.some(page=>page.id===pid)
  currentPageId = known ? pid : 'home'
  getPageTabs(currentPageId)
  getActiveTabId(currentPageId)
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

function addItem({url,title,videoId,favorite=false,pageId='home',tabId='default',created=new Date().toISOString()}){
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

  const homeRow = document.createElement('div')
  homeRow.className = 'page-link-row'
  const homeButton = document.createElement('button')
  homeButton.type = 'button'
  homeButton.className = `page-link${currentPageId==='home' ? ' selected' : ''}`
  homeButton.textContent = 'Home'
  homeButton.addEventListener('click', ()=>{
    if(editMode && selectedItemIds.size){ moveSelectedItemsToPage('home'); return }
    setCurrentPage('home')
  })
  homeRow.appendChild(homeButton)
  leftNavEl.appendChild(homeRow)

  pages.forEach(page=>{
    const row = document.createElement('div')
    row.className = 'page-link-row'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = `page-link${currentPageId===page.id ? ' selected' : ''}`
    button.textContent = page.title
    button.title = page.title
    const holdPress = attachLongPress(button, ()=>openPageHoldDialog(page.id))
    button.addEventListener('click', ()=>{
      if(holdPress.consume()) return
      if(editMode && selectedItemIds.size){ moveSelectedItemsToPage(page.id); return }
      setCurrentPage(page.id)
    })
    row.appendChild(button)
    leftNavEl.appendChild(row)
  })
}

function renderTabBar(pageId){
  const pid = normalizePageId(pageId)
  const tabs = getPageTabs(pid)
  const activeTabId = getActiveTabId(pid)
  const row = document.createElement('div')
  row.className = 'tab-row'

  tabs.forEach(tab=>{
    const wrap = document.createElement('div')
    wrap.className = 'main-tab-wrap'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = `main-tab${activeTabId===tab.id ? ' selected' : ''}`
    button.textContent = tab.title
    button.title = tab.title
    const holdPress = attachLongPress(button, ()=>openTabHoldDialog(pid, tab.id))
    button.addEventListener('click', ()=>{
      if(holdPress.consume()) return
      setActiveTab(pid, tab.id)
    })

    wrap.appendChild(button)
    row.appendChild(wrap)
  })

  const add = document.createElement('button')
  add.type = 'button'
  add.className = 'main-tab add-tab'
  add.title = 'Add tab'
  add.textContent = '+'
  add.addEventListener('click', ()=>{
    const title = prompt('Tab title')
    if(!title) return
    addTabToPage(pid, title)
  })
  row.appendChild(add)

  sections.appendChild(row)

  if(pid==='home') return

  const filterTools = document.createElement('div')
  filterTools.className = 'title-filter-tools'

  const inputWrap = document.createElement('div')
  inputWrap.className = 'title-filter-input-wrap'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'title-filter-input'
  input.placeholder = 'Hide phrase from titles on this page'

  const addPhraseBtn = document.createElement('button')
  addPhraseBtn.type = 'button'
  addPhraseBtn.className = 'title-filter-add'
  addPhraseBtn.textContent = 'Add'

  const addPhrase = ()=>{
    if(!addPageTitleFilter(pid, input.value)) return
    input.value = ''
    render()
  }

  addPhraseBtn.addEventListener('click', addPhrase)
  input.addEventListener('keydown', (ev)=>{ if(ev.key==='Enter') addPhrase() })

  inputWrap.appendChild(input)
  inputWrap.appendChild(addPhraseBtn)
  filterTools.appendChild(inputWrap)

  const list = document.createElement('div')
  list.className = 'title-filter-list'
  const filters = getPageTitleFilters(pid)

  if(!filters.length){
    const empty = document.createElement('div')
    empty.className = 'title-filter-empty'
    empty.textContent = 'No hidden phrases yet'
    list.appendChild(empty)
  }else{
    filters.forEach((phrase, index)=>{
      const chip = document.createElement('div')
      chip.className = 'title-filter-chip'

      const text = document.createElement('span')
      text.className = 'title-filter-chip-text'
      text.textContent = phrase

      const editBtn = document.createElement('button')
      editBtn.type = 'button'
      editBtn.className = 'title-filter-chip-btn'
      editBtn.textContent = 'Edit'
      editBtn.addEventListener('click', ()=>{
        const next = prompt('Edit hidden phrase', phrase)
        if(!next) return
        if(!editPageTitleFilter(pid, index, next)) return
        render()
      })

      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'title-filter-chip-btn danger'
      removeBtn.textContent = 'Delete'
      removeBtn.addEventListener('click', ()=>{
        if(!removePageTitleFilter(pid, index)) return
        render()
      })

      chip.appendChild(text)
      chip.appendChild(editBtn)
      chip.appendChild(removeBtn)
      list.appendChild(chip)
    })
  }

  filterTools.appendChild(list)
  sections.appendChild(filterTools)
}

function render(){ sections.innerHTML=''
  renderTabBar(currentPageId)
  const activeTabId = getActiveTabId(currentPageId)
  const list = items.filter(i=>normalizePageId(i.pageId)===currentPageId && normalizeTabId(i.tabId)===activeTabId)
  const groups = {today:[], yesterday:[], earlier:[]}
  const now = new Date();

  APP_TITLE.textContent = getPageTitle(currentPageId)

  if(currentPageId !== 'home'){
    const sortedList = list.slice().sort((a, b)=>{
      const aDate = new Date(a.publishedAt || a.created || 0).getTime()
      const bDate = new Date(b.publishedAt || b.created || 0).getTime()
      return aDate - bDate
    })
    const heading = document.createElement('div')
    heading.className = 'page-heading'
    heading.textContent = getPageTitle(currentPageId)
    sections.appendChild(heading)
    if(sortedList.length){
      renderSection('', sortedList)
    }else{
      const empty = document.createElement('p')
      empty.style.padding = '12px'
      empty.style.color = '#9fb0d6'
      empty.textContent = 'No items'
      sections.appendChild(empty)
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
  if(!groups.today.length && !groups.yesterday.length && !groups.earlier.length){
    const empty = document.createElement('p')
    empty.style.padding = '12px'
    empty.style.color = '#9fb0d6'
    empty.textContent = 'No items'
    sections.appendChild(empty)
  }
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
    const rawTitle = it.title || it.url
    ttl.textContent = currentPageId==='home' ? rawTitle : applyPageTitleFilters(rawTitle, currentPageId)
    starBtn.textContent = it.favorite ? '★' : '☆'
    el.classList.toggle('is-editing', editMode)
    el.classList.toggle('is-selected', selectedItemIds.has(it.id))
    starBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleFav(it.id) })
    delBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); removeItem(it.id) })
    el.addEventListener('click', ()=>{
      if(editMode){ selectItem(it.id); return }
      removeItem(it.id); window.open(it.url, '_blank')
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

if(holdDialogBackdropEl) holdDialogBackdropEl.addEventListener('click', closeHoldDialog)
if(holdExitBtn) holdExitBtn.addEventListener('click', closeHoldDialog)
window.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape') closeHoldDialog() })

// handle url params (extension will open app with params)
function handleParams(){ const p = new URLSearchParams(location.search); if(p.has('videoId')){
  const videoId = p.get('videoId'); const title = p.get('title')? decodeURIComponent(p.get('title')) : '';
  const url = `https://www.youtube.com/watch?v=${videoId}`
  addItem({url,title:title||`YouTube video ${videoId}`,videoId,pageId:'home',created:new Date().toISOString()})
  // remove params from url
  history.replaceState({},document.title,location.pathname)
}}

window.addEventListener('load', ()=>{
  if(!pages.length){
    pages = []
    savePages()
  }
  ensurePageTabIntegrity()
  currentPageId = 'home'
  APP_TITLE.textContent = 'Home'
  renderLeftNav()
  renderHeaderLinks()
  handleParams()
  savedLinks = loadSavedLinks()
  renderSavedLinks()
  render()
})
