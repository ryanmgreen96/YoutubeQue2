(function(){
  const APP_KEY = 'ytQueueItems_v1'
  try{
    chrome.storage.local.get(['queuedItems'], (res)=>{
      const q = res.queuedItems || []
      if(!q.length) return
      try{
        const existing = JSON.parse(localStorage.getItem(APP_KEY)||'[]')
        const merged = q.concat(existing)
        localStorage.setItem(APP_KEY, JSON.stringify(merged))
      }catch(e){
        localStorage.setItem(APP_KEY, JSON.stringify(q))
      }
      chrome.storage.local.set({queuedItems: []}, ()=>{ location.reload() })
    })
  }catch(e){
    // no chrome APIs available
  }
})()
