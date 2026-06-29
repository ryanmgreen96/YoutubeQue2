const APP_KEY = 'ytQueueItems_v1'
const SAVED_LINKS_APP_KEY = 'ytSavedVideos_v1'
const HEADER_LINKS_KEY = 'ytHeaderLinks_v1'
const APP_TITLE = document.getElementById('view-title')
const homeBtn = document.getElementById('home-btn')
const favBtn = document.getElementById('fav-btn')
const addBtn = document.getElementById('add-btn')
const sections = document.getElementById('sections')
const savedLinksEl = document.getElementById('saved-links')
const headerLinksEl = document.getElementById('header-links')
const template = document.getElementById('item-template')

let items = load()
let savedLinks = loadSavedLinks()
let headerLinks = loadHeaderLinks()
let view = 'home'

function save(){ localStorage.setItem(APP_KEY, JSON.stringify(items)) }
function load(){ try{ return JSON.parse(localStorage.getItem(APP_KEY)||'[]') }catch(e){return[]}}
function loadSavedLinks(){ try{ return JSON.parse(localStorage.getItem(SAVED_LINKS_APP_KEY)||'[]') }catch(e){return[]}}
function saveSavedLinks(){ localStorage.setItem(SAVED_LINKS_APP_KEY, JSON.stringify(savedLinks)) }
function removeSavedLink(id){ savedLinks = savedLinks.filter(link=>link.id!==id); saveSavedLinks(); renderSavedLinks() }

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8) }

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

function addItem({url,title,videoId,favorite=false,created=new Date().toISOString()}){
  const id = uid()
  const item = {id, url, title, videoId, favorite, created}
  items.unshift(item)
  save()
  render()
}

function removeItem(id){ items = items.filter(i=>i.id!==id); save(); render() }

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

function render(){ sections.innerHTML=''
  const list = view==='favorites' ? items.filter(i=>i.favorite) : items.filter(i=>!i.favorite)
  const groups = {today:[], yesterday:[], earlier:[]}
  const now = new Date();
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
  const h = document.createElement('h2'); h.textContent=title; s.appendChild(h)
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
    starBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleFav(it.id) })
    delBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); removeItem(it.id) })
    el.addEventListener('click', ()=>{ removeItem(it.id); window.open(it.url, '_blank') })

    // long-press to edit
    let pressTimer = null
    el.addEventListener('mousedown', ()=>{ pressTimer = setTimeout(()=>{ editItem(it.id) },600) })
    el.addEventListener('mouseup', ()=>{ clearTimeout(pressTimer) })
    el.addEventListener('mouseleave', ()=>{ clearTimeout(pressTimer) })

    g.appendChild(node)
  })
  s.appendChild(g)
  sections.appendChild(s)
}

homeBtn.addEventListener('click', ()=>{ view='home'; homeBtn.classList.add('selected'); favBtn.classList.remove('selected'); APP_TITLE.textContent='Home'; render() })
favBtn.addEventListener('click', ()=>{ view='favorites'; favBtn.classList.add('selected'); homeBtn.classList.remove('selected'); APP_TITLE.textContent='Favorites'; render() })
addBtn.addEventListener('click', ()=>{
  const label = prompt('Text label for header link')
  if(!label) return
  const url = prompt('Link URL')
  if(!url) return
  addHeaderLink({title: label, url})
})

// handle url params (extension will open app with params)
function handleParams(){ const p = new URLSearchParams(location.search); if(p.has('videoId')){
  const videoId = p.get('videoId'); const title = p.get('title')? decodeURIComponent(p.get('title')) : '';
  const url = `https://www.youtube.com/watch?v=${videoId}`
  addItem({url,title:title||`YouTube video ${videoId}`,videoId,created:new Date().toISOString()})
  // remove params from url
  history.replaceState({},document.title,location.pathname)
}}

window.addEventListener('load', ()=>{ renderHeaderLinks(); handleParams(); savedLinks = loadSavedLinks(); renderSavedLinks(); render() })
