const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const widgetSource = fs.readFileSync(path.join(__dirname, '..', 'astronomy-widget.js'), 'utf8')

function loadWidget(){
  const context = {console, Date, Intl, Math, Number, Object, Error, setInterval(){}}
  context.window = context
  context.globalThis = context
  vm.createContext(context)
  vm.runInContext(widgetSource, context)
  return context.SkyAstronomy
}

function buildAstronomyStub(eventOffset){
  const calls = []
  return {
    calls,
    Body:{Moon:'Moon', Sun:'Sun'},
    Observer:function(latitude, longitude, height){
      this.latitude = latitude
      this.longitude = longitude
      this.height = height
    },
    MakeTime(date){ return {date} },
    SearchRiseSet(body, observer, direction, startTime){
      calls.push({body, direction, start:startTime.date})
      const offset = eventOffset(body, direction)
      return offset == null ? null : {date:new Date(startTime.date.getTime() + offset)}
    },
    SearchHourAngle(body, observer, angle, startTime){
      calls.push({body, angle, start:startTime.date})
      return {time:{date:new Date(startTime.date.getTime() + 14 * 60 * 60 * 1000)}}
    },
    Equator(body){ return {ra:body === 'Moon' ? 12 : 0, dec:0} },
    Horizon(time, observer, ra){
      return {azimuth:ra === 12 ? 225 : 90, altitude:ra === 12 ? 34 : 0}
    }
  }
}

test('returns Moon direction and transit altitude with Sun times for a selected Maple Ridge day', () => {
  const sky = loadWidget()
  const astronomy = buildAstronomyStub((body, direction)=>body === 'Moon'
    ? (direction > 0 ? 8 : 20) * 60 * 60 * 1000
    : (direction > 0 ? 5 : 16) * 60 * 60 * 1000)
  const result = sky.getDayInfo('2026-06-21', astronomy)

  assert.equal(astronomy.calls[0].start.toISOString(), '2026-06-21T07:00:00.000Z')
  assert.equal(result.moonrise.direction, 'SW')
  assert.equal(result.moonrise.azimuth, 225)
  assert.equal(result.moonTransit.altitude, 34)
  assert.equal(result.moonset.direction, 'SW')
  assert.equal(result.sunrise.toISOString(), '2026-06-21T12:00:00.000Z')
  assert.equal(result.sunset.toISOString(), '2026-06-21T23:00:00.000Z')
})

test('does not show a rise or set belonging to the next Pacific calendar day across DST', () => {
  const sky = loadWidget()
  const astronomy = buildAstronomyStub((body, direction)=>{
    if(body === 'Moon' && direction < 0) return 23.5 * 60 * 60 * 1000
    return 2 * 60 * 60 * 1000
  })
  const result = sky.getDayInfo('2026-03-08', astronomy)

  assert.equal(astronomy.calls[0].start.toISOString(), '2026-03-08T08:00:00.000Z')
  assert.equal(result.moonset, null)
})
