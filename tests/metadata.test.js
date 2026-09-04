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
  context.isPlaceholderDate = (value) => {
    if(typeof value !== 'string') return false
    const trimmed = context.safeText(value)
    if(!trimmed) return false
    const placeholders = [/^2000-01-01(?:[T\s].*)?$/i, /^2001-01-01(?:[T\s].*)?$/i, /^january 1, 2000$/i, /^jan 1, 2000$/i, /^1 january 2000$/i, /^01\s+jan\s+2000$/i, /^january 1, 2001$/i, /^jan 1, 2001$/i, /^1 january 2001$/i, /^01\s+jan\s+2001$/i]
    return placeholders.some((pattern)=>pattern.test(trimmed))
  }
  context.isReasonablePublishDate = (value) => {
    if(typeof value !== 'string') return false
    const trimmed = context.safeText(value)
    if(!trimmed || context.isPlaceholderDate(trimmed)) return false
    const parsed = Date.parse(trimmed)
    if(Number.isNaN(parsed)) return false
    const date = new Date(parsed)
    const year = date.getUTCFullYear()
    const nowYear = new Date().getUTCFullYear()
    return Number.isInteger(year) && year >= 2005 && year <= nowYear + 1
  }
  vm.createContext(context)
  return context
}

function loadDateHelpers(startMarker, endMarker) {
  const context = buildContext()
  const start = backgroundSource.indexOf(startMarker)
  const end = backgroundSource.indexOf(endMarker)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  vm.runInContext(backgroundSource.slice(start, end), context)
  return context
}

function loadDateHelpersForFeed() {
  return loadDateHelpers('function parseYouTubeRelativeDate', 'async function fetchPagePublishedAt')
}

function loadDateHelpersForHtmlExtraction() {
  return loadDateHelpers('function parseYouTubeRelativeDate', 'async function fetchPagePublishedAt')
}

test('findPublishDateInValue extracts nested publish dates', () => {
  const context = loadDateHelpersForFeed()
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
  const context = loadDateHelpersForFeed()
  const xml = '<feed><entry><published>2024-05-01T12:00:00.000Z</published></entry></feed>'
  assert.equal(context.parseYouTubeFeedPublishedAt(xml), '2024-05-01T12:00:00.000Z')
})

test('extractPublishDateFromYouTubePayload prefers player microformat publish dates', () => {
  const context = loadDateHelpersForFeed()
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
test('extractDateFromYoutubeHtml finds publishDate from page HTML', () => {
  const context = loadDateHelpersForHtmlExtraction()
  const html = '<html><body><script>var ytInitialPlayerResponse = {"microformat":{"playerMicroformatRenderer":{"publishDate":"2017-01-13T00:33:00-08:00"}}};</script></body></html>'
  assert.equal(context.extractDateFromYoutubeHtml(html), '2017-01-13T08:33:00.000Z')
})

test('normalizeDateCandidate rejects absurd years', () => {
  const context = loadDateHelpersForFeed()
  assert.equal(context.normalizeDateCandidate('+021540-01-01T08:00:00.000Z'), '')
})

test('extractYouTubeTitleFromHtml ignores generic shell titles', () => {
  const context = loadDateHelpersForFeed()
  const html = '<title>YouTube</title><script>var ytInitialPlayerResponse = {"videoDetails":{"title":"A Real Video Title"}};</script>'
  assert.equal(context.extractYouTubeTitleFromHtml(html), 'A Real Video Title')
})

test('extractYouTubeTitleFromHtml accepts normal og titles', () => {
  const context = loadDateHelpersForFeed()
  const html = '<meta content="A Real Video Title" property="og:title"><title>YouTube</title>'
  assert.equal(context.extractYouTubeTitleFromHtml(html), 'A Real Video Title')
})

test('extractYouTubeTitleFromPlayerData ignores the generic YouTube title', () => {
  const context = loadDateHelpersForFeed()
  assert.equal(context.extractYouTubeTitleFromPlayerData({videoDetails:{title:'A Real Video Title'}}), 'A Real Video Title')
  assert.equal(context.extractYouTubeTitleFromPlayerData({videoDetails:{title:'YouTube'}}), '')
})
