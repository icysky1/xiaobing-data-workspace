// 端到端验证：页面里点「开战推演」能跑出结果
const fs = require('fs')
const path = require('path')
const Module = require('module')

const store = {}
global.wx = {
  setStorageSync(k, v) { store[k] = v },
  getStorageSync(k) { return store[k] || null },
  showToast(o) { console.log('[toast]', o && o.title) },
  createSelectorQuery() { return { selectAll: () => ({ fields: () => {} }), exec: () => {} } },
}
let pageCfg = null
global.Page = (cfg) => { pageCfg = cfg }

const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports = { buildBattleSides, makeSlots, heroCard, petCard, heroesMap }', P)
const X = L.exports
const fc = require('./formation-code.js')
const pets = require('../xiaobing-data/data/pets.js')

const NO2IDX = {}
for (let i = 0; i < 6; i++) { NO2IDX[3 + i * 3] = i; NO2IDX[2 + i * 3] = 6 + i; NO2IDX[1 + i * 3] = 12 + i }
function build(code) {
  const d = fc.decode(code)
  const slots = X.makeSlots()
  d.heroes.forEach((e) => {
    if (e.heroId >= 900000) {
      const p = pets.filter((x) => x.id === e.heroId)[0]
      if (p) slots[NO2IDX[e.position]].unit = X.petCard(p)
    } else if (X.heroesMap[e.heroId]) {
      slots[NO2IDX[e.position]].unit = X.heroCard(X.heroesMap[e.heroId])
    }
  })
  return slots
}

const pg = Object.create(pageCfg)
pg.data = JSON.parse(JSON.stringify(pageCfg.data))
pg.setData = function (o) { Object.assign(this.data, o) }
pg.onLoad()

pg.model.ours.slots = build('Z3-__GPYCIDiDmACOoDuPMMCDkM8DwDoCOCKCDvK5gid-o')
pg.model.enemy.slots = build('Z33__EDCDeKiPOM-KmOEDQAIDGOGKoDEDMOmDTvLqAhicy')
pg.recalc()

const t0 = Date.now()
pg.runBattleSim()
const timer = setInterval(() => {
  if (pg.data.battleRunning) return
  clearInterval(timer)
  console.log('耗时', Date.now() - t0, 'ms')
  console.log(JSON.stringify(pg.data.battleRes, null, 1))
}, 50)
