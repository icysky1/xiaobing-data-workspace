// 号位顺序的价值：只打乱「同一排内的 6 个位置」，战力基本不变，胜率能差多少
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.wx = { setStorageSync() {}, getStorageSync() { return '' } }
global.Page = () => {}
const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports = { makeSlots, heroCard, petCard, heroesMap, buildBattleSides, calcAll, slotNoOf }', P)
const X = L.exports
const sim = require('../xiaobing-data/utils/battleSim.js')
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
const A = build('Z3-__GNMAqAmOYAEOcACOWDkMyAsDoPSAoAiPfvK4gxdek')
const B = build('Z33__EDCDeKiPOM-KmOEDQAIDGOGKoDEDMOmDTvLqAhicy')

// 同排内打乱：slots 按 col 分组，组内轮换 unit
const COLS = ['front', 'mid', 'back']
function shuffleRow(slots, col, seed) {
  const idxs = slots.map((s, i) => (s.col === col ? i : -1)).filter((i) => i >= 0)
  const units = idxs.map((i) => slots[i].unit)
  const n = units.length
  const k = seed % n
  const rot = units.slice(k).concat(units.slice(0, k))
  const out = slots.map((s) => ({ ...s }))
  idxs.forEach((i, j) => { out[i].unit = rot[j] })
  return out
}

function evalWin(slotsA) {
  const c = X.calcAll({ ours: { slots: slotsA }, enemy: { slots: B } })
  const s = X.buildBattleSides(slotsA, B)
  const st = sim.createJob({ ours: s.ours, enemy: s.enemy, sims: 600, opt: {} }).step(1e9).stats
  return {
    staticMid: Math.round((c.ours.total.min + c.ours.total.max) / 2),
    win: st.winRate * 100,
  }
}

const base = evalWin(A)
console.log('原始站位：静态 ' + base.staticMid + '，胜率 ' + base.win.toFixed(1) + '%')
const rows = []
for (let k = 1; k <= 5; k++) {
  COLS.forEach((col) => {
    const s = shuffleRow(A, col, k)
    const r = evalWin(s)
    rows.push({ col, k, ...r })
  })
}
rows.sort((a, b) => b.win - a.win)
console.log('\n只轮换同一排的位置（静态战力几乎不变）：')
rows.forEach((r) => console.log('  ' + r.col.padEnd(5) + ' 轮换 ' + r.k + ' 格 → 静态 ' + r.staticMid + '，胜率 ' + r.win.toFixed(1) + '%'))
console.log('\n最好 ' + rows[0].win.toFixed(1) + '% / 最差 ' + rows[rows.length - 1].win.toFixed(1) + '% ，极差 ' + (rows[0].win - rows[rows.length - 1].win).toFixed(1) + ' 个百分点')
