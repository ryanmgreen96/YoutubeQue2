const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')
const start = appSource.indexOf('function sortFinanceEntriesNewestFirst')
const end = appSource.indexOf('function renderFinanceWorkForm', start)
assert.notEqual(start, -1)
assert.notEqual(end, -1)

const context = vm.createContext({})
vm.runInContext(appSource.slice(start, end), context)

test('finance entries render newest first without mutating saved order', () => {
  const entries = [
    {id:'old', date:'2026-11-02'},
    {id:'new', date:'2026-11-12'},
    {id:'middle', date:'2026-11-08'}
  ]
  const sorted = context.sortFinanceEntriesNewestFirst(entries)

  assert.deepEqual(Array.from(sorted, (entry)=>entry.id), ['new', 'middle', 'old'])
  assert.deepEqual(entries.map((entry)=>entry.id), ['old', 'new', 'middle'])
})
