const APP_KEY = 'ytQueueItems_v1'
const PAGE_KEY = 'ytQueuePages_v1'
const PAGE_TABS_KEY = 'ytPageTabs_v1'
const ACTIVE_TAB_KEY = 'ytActiveTabs_v1'
const PAGE_TITLE_FILTERS_KEY = 'ytPageTitleFilters_v1'
const SAVED_LINKS_APP_KEY = 'ytSavedVideos_v1'
const HEADER_LINKS_KEY = 'ytHeaderLinks_v1'
const TOPBAR_ROWS_KEY = 'ytTopbarRows_v1'
const TOPBAR_ACTIVE_ROW_KEY = 'ytTopbarActiveRow_v1'
const THEME_INDEX_KEY = 'ytThemeIndex_v1'
const sections = document.getElementById('sections')
const leftNavEl = document.getElementById('left-nav')
const addPageBtn = document.getElementById('add-page-btn')
const deletePageItemsBtn = document.getElementById('delete-page-items-btn')
const addLinkBtn = document.getElementById('add-link-btn')
const savedLinksEl = document.getElementById('saved-links')
const topbarRolesEl = document.getElementById('topbar-roles')
const topbarLinksEl = document.getElementById('topbar-links')
const themeSwitcherEl = document.getElementById('theme-switcher')
const template = document.getElementById('item-template')
const holdDialogEl = document.getElementById('hold-action-dialog')
const holdDialogBackdropEl = holdDialogEl ? holdDialogEl.querySelector('.hold-dialog-backdrop') : null
const holdDialogTitleEl = document.getElementById('hold-dialog-title')
const holdEditBtn = document.getElementById('hold-edit-btn')
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
let topbarRows = loadTopbarRows()
let activeTopbarRowId = loadTopbarActiveRowId()
let currentPageId = 'home'
let editMode = false
let deleteMode = false
let pageDeleteMode = false
let selectedItemIds = new Set()
let rangeFlagStartId = null
let rangeFlagEndId = null
let holdDialogState = null
let titleFilterOverlayPageId = null
let dividerInsertMode = false
let activeThemeIndex = 0

const THEMES = [
  {
    name: 'Blue',
    bg: '#172330',
    card: '#111a26',
    text: '#e8f0fa',
    textSoft: '#cad8ea',
    accent: '#d7b06e'
  },
  {
    name: 'Red',
    bg: '#2b1f1d',
    card: '#241917',
    text: '#f3e8e5',
    textSoft: '#dbc7c0',
    accent: '#d39a7a'
  },
  {
    name: 'Green',
    bg: '#202a22',
    card: '#1a241c',
    text: '#e9f1e8',
    textSoft: '#c7d7c6',
    accent: '#c5b37a'
  },
  {
    name: 'Yellow',
    bg: '#2c291f',
    card: '#242116',
    text: '#f4eddc',
    textSoft: '#ddd2b4',
    accent: '#d2a967'
  },
  {
    name: 'Baby Blue',
    bg: '#1f2830',
    card: '#182029',
    text: '#ecf3f7',
    textSoft: '#cedbe4',
    accent: '#c9a77a'
  },
  {
    name: 'Purple',
    bg: '#292232',
    card: '#211b2a',
    text: '#efe9f6',
    textSoft: '#d3c6e2',
    accent: '#c8a07a'
  }
]

function save(){ localStorage.setItem(APP_KEY, JSON.stringify(items)) }
function load(){ try{ return JSON.parse(localStorage.getItem(APP_KEY)||'[]') }catch(e){return[]}}
function loadThemeIndex(){
  const parsed = Number(localStorage.getItem(THEME_INDEX_KEY) || '0')
  if(!Number.isInteger(parsed) || parsed < 0) return 0
  return parsed % THEMES.length
}
function saveThemeIndex(){ localStorage.setItem(THEME_INDEX_KEY, String(activeThemeIndex)) }
function applyTheme(index){
  const safeIndex = Number.isInteger(index) ? ((index % THEMES.length) + THEMES.length) % THEMES.length : 0
  const theme = THEMES[safeIndex]
  activeThemeIndex = safeIndex

  const root = document.documentElement
  root.style.setProperty('--bg', theme.bg)
  root.style.setProperty('--card', theme.card)
  root.style.setProperty('--text', theme.text)
  root.style.setProperty('--text-soft', theme.textSoft)
  root.style.setProperty('--accent', theme.accent)

  saveThemeIndex()
  renderThemeSwitcher()
}
function cycleTheme(){
  applyTheme(activeThemeIndex + 1)
}
function renderThemeSwitcher(){
  if(!themeSwitcherEl) return
  const theme = THEMES[activeThemeIndex] || THEMES[0]
  themeSwitcherEl.innerHTML = ''

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'theme-cycle-btn'
  btn.title = `Theme: ${theme.name}. Click to cycle.`
  btn.textContent = 'T'
  btn.addEventListener('click', cycleTheme)

  themeSwitcherEl.appendChild(btn)
}
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
function loadTopbarRows(){
  try{
    const parsed = JSON.parse(localStorage.getItem(TOPBAR_ROWS_KEY)||'[]')
    if(!Array.isArray(parsed)) return []
    return parsed
      .filter(row=>row && row.id)
      .map(row=>({
        id: row.id,
        name: typeof row.name==='string' ? row.name : 'Row',
        symbol: typeof row.symbol==='string' && row.symbol.trim() ? row.symbol.trim().slice(0, 1) : '#',
        links: Array.isArray(row.links)
          ? row.links
              .filter(link=>link && link.id && link.url)
              .map(link=>({
                id: link.id,
                title: typeof link.title==='string' ? link.title : link.url,
                url: typeof link.url==='string' ? link.url : ''
              }))
          : []
      }))
  }catch(e){ return [] }
}
function saveTopbarRows(){ localStorage.setItem(TOPBAR_ROWS_KEY, JSON.stringify(topbarRows)) }
function loadTopbarActiveRowId(){ return localStorage.getItem(TOPBAR_ACTIVE_ROW_KEY) || '' }
function saveTopbarActiveRowId(){ localStorage.setItem(TOPBAR_ACTIVE_ROW_KEY, activeTopbarRowId || '') }
function normalizeUrl(value){
  const raw = (value || '').trim()
  if(!raw) return ''
  if(/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8) }
function ensureTopbarState(){
  if(!Array.isArray(topbarRows)) topbarRows = []
  if(!topbarRows.length){
    topbarRows = [{id: uid(), name: 'Default', symbol: '1', links: []}]
    saveTopbarRows()
  }
  const exists = topbarRows.some(row=>row.id===activeTopbarRowId)
  if(!exists){
    activeTopbarRowId = topbarRows[0].id
    saveTopbarActiveRowId()
  }
}
function getActiveTopbarRow(){
  ensureTopbarState()
  return topbarRows.find(row=>row.id===activeTopbarRowId) || topbarRows[0]
}
function makeFaviconUrl(url){
  try{
    const host = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
  }catch(e){
    return ''
  }
}
function fallbackGlyph(title, url){
  const source = (title || '').trim() || (url || '').trim()
  if(!source) return '?'
  const first = source.replace(/^https?:\/\//i, '').trim().charAt(0).toUpperCase()
  return first || '?'
}
function addTopbarRow(){
  const symbolInput = prompt('Row icon/symbol (single character)', `${topbarRows.length + 1}`)
  if(!symbolInput) return
  const nameInput = prompt('Row name', 'New row')
  if(!nameInput) return
  const row = {
    id: uid(),
    name: nameInput.trim() || 'Row',
    symbol: symbolInput.trim().slice(0, 1) || '#',
    links: []
  }
  topbarRows.push(row)
  activeTopbarRowId = row.id
  saveTopbarRows()
  saveTopbarActiveRowId()
  renderHeaderLinks()
}
function addTopbarLink(){
  const row = getActiveTopbarRow()
  if(!row) return
  const urlInput = prompt('Website URL')
  if(!urlInput) return
  const url = normalizeUrl(urlInput)
  try{ new URL(url) }catch(e){ alert('Please enter a valid URL'); return }
  let defaultTitle = url
  try{ defaultTitle = new URL(url).hostname.replace(/^www\./i, '') }catch(e){}
  const titleInput = prompt('Label (optional)', defaultTitle)
  const link = {id: uid(), title: (titleInput || '').trim() || defaultTitle, url}
  row.links.push(link)
  saveTopbarRows()
  renderHeaderLinks()
}
function editTopbarLink(linkId){
  const row = getActiveTopbarRow()
  if(!row) return
  const link = row.links.find(item=>item.id===linkId)
  if(!link) return
  const urlInput = prompt('Edit URL', link.url)
  if(!urlInput) return
  const url = normalizeUrl(urlInput)
  try{ new URL(url) }catch(e){ alert('Please enter a valid URL'); return }
  const titleInput = prompt('Edit label', link.title)
  if(titleInput===null) return
  link.url = url
  link.title = titleInput.trim() || link.title
  saveTopbarRows()
  renderHeaderLinks()
}
function deleteTopbarLink(linkId){
  const row = getActiveTopbarRow()
  if(!row) return
  const link = row.links.find(item=>item.id===linkId)
  if(!link) return
  if(!confirm(`Delete link "${link.title}"?`)) return
  row.links = row.links.filter(item=>item.id!==linkId)
  saveTopbarRows()
  renderHeaderLinks()
}
function clearRangeFlags(){
  rangeFlagStartId = null
  rangeFlagEndId = null
}
function applyRangeSelectionFromList(list){
  if(!rangeFlagStartId || !rangeFlagEndId || !Array.isArray(list)) return
  const startIndex = list.findIndex(item=>item.id===rangeFlagStartId)
  const endIndex = list.findIndex(item=>item.id===rangeFlagEndId)
  if(startIndex<0 || endIndex<0) return
  const from = Math.min(startIndex, endIndex)
  const to = Math.max(startIndex, endIndex)
  for(let index = from; index <= to; index += 1){
    selectedItemIds.add(list[index].id)
  }
}
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
function closeTitleFilterOverlay(){
  if(titleFilterOverlayPageId===null) return
  titleFilterOverlayPageId = null
  render()
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
function moveHeaderLink(linkId, delta){
  const index = headerLinks.findIndex(link=>link.id===linkId)
  if(index<0) return false
  const nextIndex = index + delta
  if(nextIndex<0 || nextIndex>=headerLinks.length) return false
  const copy = headerLinks.slice()
  const [link] = copy.splice(index, 1)
  copy.splice(nextIndex, 0, link)
  headerLinks = copy
  saveHeaderLinks()
  renderLeftNav()
  return true
}
function deleteHeaderLink(id){
  const link = headerLinks.find(item=>item.id===id)
  if(!link) return false
  if(!confirm(`Delete link "${link.title}"?`)) return false
  headerLinks = headerLinks.filter(item=>item.id!==id)
  saveHeaderLinks()
  renderLeftNav()
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
      canEdit: false,
      canMoveUp: index > 0,
      canMoveDown: index < pages.length - 1,
      canDelete: true,
      onEdit: null,
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
      canEdit: false,
      canMoveUp: index > 0,
      canMoveDown: index < tabs.length - 1,
      canDelete: tabs.length > 1,
      onEdit: null,
      onMoveUp: ()=>{ moveTabInPage(pid, tab.id, -1); renderHoldDialog() },
      onMoveDown: ()=>{ moveTabInPage(pid, tab.id, 1); renderHoldDialog() },
      onDelete: ()=>{
        if(!confirm(`Delete tab "${tab.title}"? Videos in it will move to another tab on this page.`)) return
        closeHoldDialog()
        deleteTabFromPage(pid, tab.id)
      }
    }
  }

  if(holdDialogState.type==='link'){
    const link = headerLinks.find(item=>item.id===holdDialogState.linkId)
    if(!link) return null
    const index = headerLinks.findIndex(item=>item.id===link.id)
    return {
      title: `Link: ${link.title}`,
      canEdit: true,
      canMoveUp: index > 0,
      canMoveDown: index < headerLinks.length - 1,
      canDelete: true,
      onEdit: ()=>{
        editHeaderLink(link.id)
        renderHoldDialog()
      },
      onMoveUp: ()=>{ moveHeaderLink(link.id, -1); renderHoldDialog() },
      onMoveDown: ()=>{ moveHeaderLink(link.id, 1); renderHoldDialog() },
      onDelete: ()=>{
        const deleted = deleteHeaderLink(link.id)
        if(deleted) closeHoldDialog()
      }
    }
  }

  return null
}
function renderHoldDialog(){
  if(!holdDialogEl || !holdDialogTitleEl || !holdEditBtn || !holdMoveUpBtn || !holdMoveDownBtn || !holdDeleteBtn) return
  const model = getHoldDialogModel()
  if(!model){
    closeHoldDialog()
    return
  }

  holdDialogTitleEl.textContent = model.title
  holdEditBtn.disabled = !model.canEdit
  holdEditBtn.style.display = model.canEdit ? '' : 'none'
  holdMoveUpBtn.disabled = !model.canMoveUp
  holdMoveDownBtn.disabled = !model.canMoveDown
  holdDeleteBtn.disabled = !model.canDelete

  holdEditBtn.onclick = model.onEdit
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
function openLinkHoldDialog(linkId){
  holdDialogState = {type:'link', linkId}
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
  dividerInsertMode = false
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
  const tabs = getPageTabs(targetPageId)
  let targetTabId = getActiveTabId(targetPageId)
  if(tabs.length > 1){
    const options = tabs.map((tab, index)=>`${index + 1}. ${tab.title}`).join('\n')
    const input = prompt(`Move selected videos to which tab?\n${options}`, '1')
    if(input===null) return
    const selectedIndex = Number(input) - 1
    if(!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= tabs.length) return
    targetTabId = tabs[selectedIndex].id
  }
  if(!selectedItemIds.size) return
  items = items.map(item=>selectedItemIds.has(item.id) ? {...item, pageId: targetPageId, tabId: targetTabId} : item)
  selectedItemIds.clear()
  clearRangeFlags()
  editMode = false
  currentPageId = targetPageId
  save()
  renderLeftNav()
  render()
}
function toggleEditMode(){
  deleteMode = false
  editMode = !editMode
  if(!editMode) selectedItemIds.clear()
  clearRangeFlags()
  render()
}
function toggleDeleteMode(){
  editMode = false
  pageDeleteMode = false
  deleteMode = !deleteMode
  selectedItemIds.clear()
  clearRangeFlags()
  render()
}
function togglePageDeleteMode(){
  if(currentPageId==='home') return
  editMode = false
  deleteMode = false
  pageDeleteMode = !pageDeleteMode
  selectedItemIds.clear()
  clearRangeFlags()
  renderLeftNav()
  render()
}
function syncPageDeleteModeButton(){
  if(!deletePageItemsBtn) return
  const enabled = currentPageId!=='home'
  deletePageItemsBtn.disabled = !enabled
  deletePageItemsBtn.classList.toggle('selected', pageDeleteMode)
  deletePageItemsBtn.title = enabled
    ? (pageDeleteMode ? 'Delete mode ON for this page' : 'Delete mode for page items')
    : 'Open a page to delete its items'
}
function selectItem(id, list){
  if(!selectedItemIds.has(id)){
    selectedItemIds.add(id)
    render()
    return
  }

  if(!rangeFlagStartId){
    rangeFlagStartId = id
    rangeFlagEndId = null
    render()
    return
  }

  if(rangeFlagStartId===id && !rangeFlagEndId){
    rangeFlagStartId = null
    render()
    return
  }

  if(!rangeFlagEndId){
    rangeFlagEndId = id
    applyRangeSelectionFromList(list)
    render()
    return
  }

  rangeFlagStartId = id
  rangeFlagEndId = null
  render()
}
function setCurrentPage(pageId){
  closeHoldDialog()
  const pid = normalizePageId(pageId)
  const known = pid === 'home' || pages.some(page=>page.id===pid)
  if(titleFilterOverlayPageId && titleFilterOverlayPageId!==pid) titleFilterOverlayPageId = null
  dividerInsertMode = false
  currentPageId = known ? pid : 'home'
  getPageTabs(currentPageId)
  getActiveTabId(currentPageId)
  editMode = false
  deleteMode = false
  pageDeleteMode = false
  selectedItemIds.clear()
  clearRangeFlags()
  renderLeftNav()
  syncPageDeleteModeButton()
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

function isDividerItem(item){ return item && item.type === 'divider' }

function addDividerBeforeItem(targetItemId){
  const target = items.find(item=>item.id===targetItemId)
  if(!target || isDividerItem(target)) return false
  const divider = {
    id: uid(),
    type: 'divider',
    pageId: normalizePageId(target.pageId),
    tabId: normalizeTabId(target.tabId),
    anchorId: target.id,
    created: new Date().toISOString()
  }
  items.unshift(divider)
  save()
  return true
}

function buildChronologicalListWithDividers(list){
  const dividersByAnchor = new Map()
  const orphans = []
  const videos = list.filter(item=>!isDividerItem(item))

  const sortedVideos = videos.slice().sort((a, b)=>{
    const aDate = new Date(a.publishedAt || a.created || 0).getTime()
    const bDate = new Date(b.publishedAt || b.created || 0).getTime()
    const aSafe = Number.isFinite(aDate) ? aDate : 0
    const bSafe = Number.isFinite(bDate) ? bDate : 0
    return bSafe - aSafe
  })

  list
    .filter(item=>isDividerItem(item))
    .forEach((divider)=>{
      const anchorId = divider.anchorId || ''
      if(!anchorId || !sortedVideos.some(video=>video.id===anchorId)){
        orphans.push(divider)
        return
      }
      if(!dividersByAnchor.has(anchorId)) dividersByAnchor.set(anchorId, [])
      dividersByAnchor.get(anchorId).push(divider)
    })

  const merged = []
  if(orphans.length) merged.push(...orphans)
  sortedVideos.forEach((video)=>{
    const attached = dividersByAnchor.get(video.id) || []
    if(attached.length) merged.push(...attached)
    merged.push(video)
  })
  return merged
}

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
function addHeaderLink({title,url}){ const link = {id:uid(), title, url, created: new Date().toISOString()}; headerLinks.push(link); saveHeaderLinks(); renderLeftNav(); }
function editHeaderLink(id){ const link = headerLinks.find(l=>l.id===id); if(!link) return; const newTitle = prompt('Edit text label', link.title); if(!newTitle) return; const newUrl = prompt('Edit URL', link.url); if(!newUrl) return; link.title = newTitle; link.url = newUrl; saveHeaderLinks(); renderLeftNav(); }
function renderHeaderLinks(){
  if(!topbarRolesEl || !topbarLinksEl) return
  ensureTopbarState()
  const activeRow = getActiveTopbarRow()

  topbarRolesEl.innerHTML = ''
  const roleGrid = document.createElement('div')
  roleGrid.className = 'topbar-role-grid'

  topbarRows.forEach(row=>{
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `topbar-role-btn${row.id===activeTopbarRowId ? ' selected' : ''}`
    btn.textContent = row.symbol || '#'
    btn.title = row.name
    btn.addEventListener('click', ()=>{
      activeTopbarRowId = row.id
      saveTopbarActiveRowId()
      renderHeaderLinks()
    })
    roleGrid.appendChild(btn)
  })

  const addRoleBtn = document.createElement('button')
  addRoleBtn.type = 'button'
  addRoleBtn.className = 'topbar-role-btn add'
  addRoleBtn.textContent = '+'
  addRoleBtn.title = 'Add link row'
  addRoleBtn.addEventListener('click', addTopbarRow)
  roleGrid.appendChild(addRoleBtn)
  topbarRolesEl.appendChild(roleGrid)

  topbarLinksEl.innerHTML = ''
  const linkTrack = document.createElement('div')
  linkTrack.className = 'topbar-link-track'

  activeRow.links.forEach(link=>{
    const iconBtn = document.createElement('button')
    iconBtn.type = 'button'
    iconBtn.className = 'topbar-link-icon'
    iconBtn.title = `${link.title} - ${link.url}`
    iconBtn.setAttribute('aria-label', link.title)

    const img = document.createElement('img')
    img.className = 'topbar-link-favicon'
    img.src = makeFaviconUrl(link.url)
    img.alt = ''

    const fallback = document.createElement('span')
    fallback.className = 'topbar-link-fallback'
    fallback.textContent = fallbackGlyph(link.title, link.url)

    img.addEventListener('error', ()=>{
      img.style.display = 'none'
      fallback.style.display = 'inline-flex'
    })
    img.addEventListener('load', ()=>{
      img.style.display = 'block'
      fallback.style.display = 'none'
    })

    iconBtn.addEventListener('click', ()=>{
      if(holdPress.consume()) return
      window.open(link.url, '_blank', 'noopener,noreferrer')
    })
    const holdPress = attachLongPress(iconBtn, ()=>{
      const action = prompt(`Manage link "${link.title}"\nType: edit or delete`, 'edit')
      if(!action) return
      const next = action.trim().toLowerCase()
      if(next==='delete') deleteTopbarLink(link.id)
      else editTopbarLink(link.id)
    })

    iconBtn.appendChild(img)
    iconBtn.appendChild(fallback)
    linkTrack.appendChild(iconBtn)
  })

  const addLinkBtn = document.createElement('button')
  addLinkBtn.type = 'button'
  addLinkBtn.className = 'topbar-link-icon add'
  addLinkBtn.textContent = '+'
  addLinkBtn.title = 'Add website link'
  addLinkBtn.addEventListener('click', addTopbarLink)
  linkTrack.appendChild(addLinkBtn)

  topbarLinksEl.appendChild(linkTrack)
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

  headerLinks.forEach(link=>{
    const row = document.createElement('div')
    row.className = 'page-link-row'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'page-link side-link'
    button.textContent = link.title
    button.title = link.url

    const holdPress = attachLongPress(button, ()=>openLinkHoldDialog(link.id))
    button.addEventListener('click', ()=>{
      if(holdPress.consume()) return
      window.open(link.url, '_blank', 'noopener,noreferrer')
    })

    row.appendChild(button)
    leftNavEl.appendChild(row)
  })

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
    const tabLabel = (pid!=='home' && tab.id==='default') ? getPageTitle(pid) : tab.title
    button.textContent = tabLabel
    button.title = tabLabel
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

  if(pid!=='home'){
    const dividerToggle = document.createElement('button')
    dividerToggle.type = 'button'
    dividerToggle.className = `main-tab title-filter-toggle${dividerInsertMode ? ' selected' : ''}`
    dividerToggle.title = 'Insert divider before selected video'
    dividerToggle.setAttribute('aria-label', 'Insert divider before selected video')
    dividerToggle.textContent = '/'
    dividerToggle.addEventListener('click', ()=>{
      dividerInsertMode = !dividerInsertMode
      render()
    })
    row.appendChild(dividerToggle)

    const info = document.createElement('button')
    info.type = 'button'
    info.className = `main-tab title-filter-toggle${titleFilterOverlayPageId===pid ? ' selected' : ''}`
    info.title = 'Manage hidden title phrases'
    info.setAttribute('aria-label', 'Manage hidden title phrases')
    info.textContent = 'i'
    info.addEventListener('click', ()=>{
      titleFilterOverlayPageId = titleFilterOverlayPageId===pid ? null : pid
      render()
    })
    row.appendChild(info)
  }

  sections.appendChild(row)

  if(pid==='home' || titleFilterOverlayPageId!==pid) return

  const overlay = document.createElement('div')
  overlay.className = 'title-filter-overlay'

  const backdrop = document.createElement('div')
  backdrop.className = 'title-filter-overlay-backdrop'
  backdrop.addEventListener('click', closeTitleFilterOverlay)
  overlay.appendChild(backdrop)

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
  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'title-filter-close'
  closeBtn.textContent = 'Close'
  closeBtn.addEventListener('click', closeTitleFilterOverlay)
  filterTools.appendChild(closeBtn)

  overlay.appendChild(filterTools)
  sections.appendChild(overlay)
}

function render(){ sections.innerHTML=''
  if(currentPageId !== 'home') renderTabBar(currentPageId)
  const activeTabId = getActiveTabId(currentPageId)
  const list = items.filter(i=>normalizePageId(i.pageId)===currentPageId && normalizeTabId(i.tabId)===activeTabId)
  const groups = {today:[], yesterday:[], earlier:[]}
  const now = new Date();

  if(currentPageId !== 'home'){
    const sortedList = buildChronologicalListWithDividers(list)
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

      const deleteButton = document.createElement('button')
      deleteButton.type = 'button'
      deleteButton.className = `edit-mode-btn delete-mode-btn${deleteMode ? ' selected' : ''}`
      deleteButton.textContent = 'X'
      deleteButton.title = 'Delete mode'
      deleteButton.addEventListener('click', toggleDeleteMode)
      header.appendChild(deleteButton)
    }
    s.appendChild(header)
  }
  const g = document.createElement('div'); g.className='grid'
  list.forEach(it=>{
    if(isDividerItem(it)){
      const dividerItem = document.createElement('div')
      dividerItem.className = 'queue-divider-item'
      dividerItem.title = 'Divider marker'

      const dividerLine = document.createElement('div')
      dividerLine.className = 'queue-divider-line'
      dividerItem.appendChild(dividerLine)

      g.appendChild(dividerItem)
      return
    }

    const node = template.content.cloneNode(true)
    const el = node.querySelector('.item')
    const img = node.querySelector('.thumb')
    const ttl = node.querySelector('.title')
    img.src = it.videoId ? makeThumbUrl(it.videoId) : ''
    const rawTitle = it.title || it.url
    ttl.textContent = currentPageId==='home' ? rawTitle : applyPageTitleFilters(rawTitle, currentPageId)
    el.classList.toggle('is-editing', editMode)
    el.classList.toggle('is-selected', selectedItemIds.has(it.id))
    el.classList.toggle('is-range-flag', rangeFlagStartId===it.id || rangeFlagEndId===it.id)
    el.addEventListener('click', ()=>{
      if(dividerInsertMode && currentPageId!=='home'){
        const inserted = addDividerBeforeItem(it.id)
        dividerInsertMode = false
        if(inserted) render()
        return
      }
      if(pageDeleteMode && currentPageId!=='home'){
        removeItem(it.id)
        return
      }
      if(deleteMode && currentPageId==='home'){
        removeItem(it.id)
        return
      }
      if(editMode){ selectItem(it.id, list); return }
      if(currentPageId==='home') removeItem(it.id)
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

if(addLinkBtn){
  addLinkBtn.addEventListener('click', ()=>{
    const urlInput = prompt('Paste link URL')
    if(!urlInput) return
    const url = normalizeUrl(urlInput)
    try{ new URL(url) }catch(e){ alert('Please enter a valid URL'); return }

    const titleInput = prompt('Link title')
    if(!titleInput) return
    const title = titleInput.trim()
    if(!title) return

    addHeaderLink({title, url})
  })
}

if(deletePageItemsBtn){
  deletePageItemsBtn.addEventListener('click', togglePageDeleteMode)
}

if(holdDialogBackdropEl) holdDialogBackdropEl.addEventListener('click', closeHoldDialog)
if(holdExitBtn) holdExitBtn.addEventListener('click', closeHoldDialog)
window.addEventListener('keydown', (ev)=>{
  if(ev.key!=='Escape') return
  closeHoldDialog()
  closeTitleFilterOverlay()
})

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
  renderLeftNav()
  syncPageDeleteModeButton()
  applyTheme(loadThemeIndex())
  renderHeaderLinks()
  handleParams()
  savedLinks = loadSavedLinks()
  renderSavedLinks()
  render()
})
