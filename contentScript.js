(function(){
  const APP_KEY = 'ytQueueItems_v1'
  const SAVED_LINKS_APP_KEY = 'ytSavedVideos_v1'
  const SAVED_LINKS_EXT_KEY = 'savedVideoLinks'

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
  }catch(e){
    // no chrome APIs available
  }
})()
