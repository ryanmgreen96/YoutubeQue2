(function(global){
  const TIME_ZONE = 'America/Vancouver'
  const OBSERVER = {latitude:49.2194, longitude:-122.6019, height:0}
  const COMPASS_POINTS = ['N','NE','E','SE','S','SW','W','NW']

  function dateParts(dateString){
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || '')
    if(!match) throw new Error('Choose a valid date.')
    const parts = match.slice(1).map(Number)
    const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
    if(parsed.getUTCFullYear() !== parts[0] || parsed.getUTCMonth() !== parts[1] - 1 || parsed.getUTCDate() !== parts[2]){
      throw new Error('Choose a valid date.')
    }
    return parts
  }

  function localDateToUtc(dateString){
    const [year, month, day] = dateParts(dateString)
    const targetUtc = Date.UTC(year, month - 1, day)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone:TIME_ZONE,
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
      hour:'2-digit',
      minute:'2-digit',
      second:'2-digit',
      hourCycle:'h23'
    })
    let guess = targetUtc
    for(let attempt = 0; attempt < 3; attempt += 1){
      const fields = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part)=>[part.type, part.value]))
      const representedUtc = Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day), Number(fields.hour), Number(fields.minute), Number(fields.second))
      guess += targetUtc - representedUtc
    }
    return new Date(guess)
  }

  function addCalendarDays(dateString, amount){
    const [year, month, day] = dateParts(dateString)
    return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10)
  }

  function isoDateInZone(date){
    const fields = new Intl.DateTimeFormat('en-CA', {
      timeZone:TIME_ZONE,
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).formatToParts(date)
    const parts = Object.fromEntries(fields.map((part)=>[part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
  }

  function timeInZone(date){
    return new Intl.DateTimeFormat(undefined, {
      timeZone:TIME_ZONE,
      hour:'numeric',
      minute:'2-digit'
    }).format(date)
  }

  function dateInZone(date){
    return new Intl.DateTimeFormat(undefined, {
      timeZone:TIME_ZONE,
      weekday:'long',
      year:'numeric',
      month:'long',
      day:'numeric'
    }).format(date)
  }

  function eventDate(result){
    if(!result) return null
    const date = result.date || (result.time && result.time.date)
    if(!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Astronomy calculation returned an invalid event time.')
    return date
  }

  function horizontalPosition(Astronomy, body, date, observer){
    const time = Astronomy.MakeTime(date)
    const equator = Astronomy.Equator(body, time, observer, true, true)
    return Astronomy.Horizon(time, observer, equator.ra, equator.dec, 'normal')
  }

  function findRiseSet(Astronomy, body, observer, direction, start, end){
    const result = Astronomy.SearchRiseSet(body, observer, direction, Astronomy.MakeTime(start), 2, 0)
    const date = eventDate(result)
    return date && date >= start && date < end ? date : null
  }

  function getDayInfo(dateString, Astronomy = global.Astronomy){
    if(!Astronomy) throw new Error('Astronomy calculations have not loaded. Check your internet connection and try again.')
    const start = localDateToUtc(dateString)
    const end = localDateToUtc(addCalendarDays(dateString, 1))
    const observer = new Astronomy.Observer(OBSERVER.latitude, OBSERVER.longitude, OBSERVER.height)
    const moonrise = findRiseSet(Astronomy, Astronomy.Body.Moon, observer, +1, start, end)
    const moonset = findRiseSet(Astronomy, Astronomy.Body.Moon, observer, -1, start, end)
    const sunrise = findRiseSet(Astronomy, Astronomy.Body.Sun, observer, +1, start, end)
    const sunset = findRiseSet(Astronomy, Astronomy.Body.Sun, observer, -1, start, end)
    const transitResult = Astronomy.SearchHourAngle(Astronomy.Body.Moon, observer, 0, Astronomy.MakeTime(start), +1, 2)
    const transit = eventDate(transitResult)
    const moonTransit = transit && transit >= start && transit < end ? transit : null

    function positionAt(date, body){
      if(!date) return null
      const horizontal = horizontalPosition(Astronomy, body, date, observer)
      const azimuth = Number(horizontal.azimuth)
      const altitude = Number(horizontal.altitude)
      if(!Number.isFinite(azimuth) || !Number.isFinite(altitude)) throw new Error('Astronomy calculation returned an invalid sky position.')
      const normalizedAzimuth = (azimuth + 360) % 360
      return {
        date,
        direction:COMPASS_POINTS[Math.round(normalizedAzimuth / 45) % COMPASS_POINTS.length],
        azimuth:Math.round(normalizedAzimuth),
        altitude:Math.round(altitude)
      }
    }

    return {
      date:dateString,
      moonrise:positionAt(moonrise, Astronomy.Body.Moon),
      moonTransit:positionAt(moonTransit, Astronomy.Body.Moon),
      moonset:positionAt(moonset, Astronomy.Body.Moon),
      sunrise,
      sunset
    }
  }

  global.SkyAstronomy = {
    addCalendarDays,
    dateInZone,
    getDayInfo,
    isoDateInZone,
    timeInZone
  }

  function init(){
    const toggle = document.getElementById('sky-toggle-btn')
    const overlay = document.getElementById('sky-overlay')
    const panel = overlay && overlay.querySelector('.sky-panel')
    const dateInput = document.getElementById('sky-date')
    const status = document.getElementById('sky-status')
    const closeButton = document.getElementById('sky-close-btn')
    const backdrop = document.getElementById('sky-backdrop')
    const previousButton = document.getElementById('sky-previous-day')
    const nextButton = document.getElementById('sky-next-day')
    if(!toggle || !overlay || !panel || !dateInput || !status) return

    const output = {
      moonrise:document.getElementById('sky-moonrise'),
      moonTransit:document.getElementById('sky-moon-transit'),
      moonset:document.getElementById('sky-moonset'),
      sunrise:document.getElementById('sky-sunrise'),
      sunset:document.getElementById('sky-sunset')
    }
    let lastToday = isoDateInZone(new Date())

    function showEvent(element, date, details, noEventText){
      if(!element) return
      element.classList.toggle('sky-no-event', !date)
      if(!date){
        element.textContent = noEventText
        return
      }
      const description = details
        ? `${timeInZone(date)} · ${details}`
        : timeInZone(date)
      element.textContent = description
    }

    function render(){
      const dateString = dateInput.value
      try{
        const info = getDayInfo(dateString)
        const dayStart = localDateToUtc(dateString)
        overlay.querySelector('.sky-title').textContent = `Maple Ridge · ${dateInZone(dayStart)}`
        showEvent(output.moonrise, info.moonrise && info.moonrise.date, info.moonrise && `${info.moonrise.direction} · azimuth ${info.moonrise.azimuth}°`, 'No moonrise this day')
        const transitAltitude = info.moonTransit && info.moonTransit.altitude
        const transitHeight = transitAltitude == null
          ? null
          : `${Math.abs(transitAltitude)}° ${transitAltitude < 0 ? 'below' : 'above'} horizon · ${info.moonTransit.direction}`
        showEvent(output.moonTransit, info.moonTransit && info.moonTransit.date, transitHeight, 'No lunar transit this day')
        showEvent(output.moonset, info.moonset && info.moonset.date, info.moonset && `${info.moonset.direction} · azimuth ${info.moonset.azimuth}°`, 'No moonset this day')
        showEvent(output.sunrise, info.sunrise, null, 'No sunrise this day')
        showEvent(output.sunset, info.sunset, null, 'No sunset this day')
        status.textContent = 'Times shown in Maple Ridge local time.'
        status.classList.remove('error')
      }catch(error){
        console.error('Unable to calculate the selected day’s sky events.', error)
        status.textContent = error instanceof Error ? error.message : 'Unable to calculate sky events.'
        status.classList.add('error')
      }
    }

    function open(){
      const today = isoDateInZone(new Date())
      if(dateInput.value === lastToday || !dateInput.value) dateInput.value = today
      lastToday = today
      overlay.classList.remove('hidden')
      overlay.setAttribute('aria-hidden', 'false')
      toggle.setAttribute('aria-expanded', 'true')
      render()
      closeButton.focus()
    }

    function close(){
      overlay.classList.add('hidden')
      overlay.setAttribute('aria-hidden', 'true')
      toggle.setAttribute('aria-expanded', 'false')
      toggle.focus()
    }

    toggle.addEventListener('click', open)
    closeButton.addEventListener('click', close)
    backdrop.addEventListener('click', close)
    dateInput.addEventListener('change', render)
    function shiftDay(amount){
      const selected = dateInput.value || isoDateInZone(new Date())
      dateInput.value = addCalendarDays(selected, amount)
      render()
    }
    if(previousButton) previousButton.addEventListener('click', ()=>shiftDay(-1))
    if(nextButton) nextButton.addEventListener('click', ()=>shiftDay(1))
    document.addEventListener('keydown', (event)=>{
      if(event.key === 'Escape' && !overlay.classList.contains('hidden')) close()
    })
    window.setInterval(()=>{
      const today = isoDateInZone(new Date())
      if(today === lastToday) return
      const shouldFollowToday = dateInput.value === lastToday
      lastToday = today
      if(shouldFollowToday){
        dateInput.value = today
        if(!overlay.classList.contains('hidden')) render()
      }
    }, 60000)
  }

  if(typeof document !== 'undefined') init()
})(typeof window === 'undefined' ? globalThis : window)
