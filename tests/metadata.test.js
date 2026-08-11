const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const backgroundPath = path.join(__dirname, '..', 'background.js')
const backgroundSource = fs.readFileSync(backgroundPath, 'utf8')

function buildContext() {
  const context = { console, Date, URL, setTimeout, clearTimeout }
  context.safeText = (value) => {
    if(typeof value === 'string') return value.trim()
    if(value == null) return ''
    return String(value).trim()
  }
  context.parseYouTubeAbsoluteDateText = (value) => {
    if(typeof value !== 'string') return ''
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString()
  }
  context.parseYouTubeRelativeDate = (value) => {
    if(typeof value !== 'string') return ''
    const match = value.match(/(\d+)\s+days?\s+ago/i)
    if(!match) return ''
    const days = Number(match[1] || 0)
    const d = new Date(Date.now() - (days * 24 * 60 * 60 * 1000))
    return d.toISOString()
  }
  vm.createContext(context)
  return context
}

function loadDateHelpers() {
  const context = buildContext()
  const start = backgroundSource.indexOf('function parseYouTubeFeedPublishedAt')
  const end = backgroundSource.indexOf('async function fetchPagePublishedAt')
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  vm.runInContext(backgroundSource.slice(start, end), context)
  return context
}

test('findPublishDateInValue extracts nested publish dates', () => {
  const context = loadDateHelpers()
  const payload = {
    responseContext: {
      serviceTrackingParams: [],
      webResponseContextExtensionData: {
        hasDecorated: true
      }
    },
    microformat: {
      playerMicroformatRenderer: {
        publishDate: '2024-05-01T12:00:00.000Z'
      }
    }
  }
  assert.equal(context.findPublishDateInValue(payload), '2024-05-01T12:00:00.000Z')
})

test('parseYouTubeFeedPublishedAt parses XML published values', () => {
  const context = loadDateHelpers()
  const xml = '<feed><entry><published>2024-05-01T12:00:00.000Z</published></entry></feed>'
  assert.equal(context.parseYouTubeFeedPublishedAt(xml), '2024-05-01T12:00:00.000Z')
})

test('extractPublishDateFromYouTubePayload prefers player microformat publish dates', () => {
  const context = loadDateHelpers()
  const payload = {
    microformat: {
      playerMicroformatRenderer: {
        publishDate: '2017-01-13T00:33:00-08:00',
        uploadDate: '2017-01-13T00:33:00-08:00'
      }
    }
  }
  assert.equal(context.extractPublishDateFromYouTubePayload(payload), '2017-01-13T00:33:00-08:00')
})
