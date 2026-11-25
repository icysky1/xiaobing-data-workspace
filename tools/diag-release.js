// 诊断：把「全员技能必放、无沉默」的推演终局，逐单位对齐静态结算
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.wx = { setStorageSync() {}, getStorageSync() { return '' } }
global.Page = () => {}
const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports = { makeSlots, heroCard, petCard, heroesMap, buildBattleSides, calcAll }', P)
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

const A = 'Z3-__GNMAqAmOYAEOcACOWDkMyAsDoPSAoAiPfvK4gxdek'
const B = 'Z33__EDCDeKiPOM-KmOEDQAIDGOGKoDEDMOmDTvLqAhicy'
const sa = build(A)
const sb = build(B)
const sides = X.buildBattleSides(sa, sb)
const c = X.calcAll({ ours: { slots: sa }, enemy: { slots: sb } })

// 全员必放、去掉控制
function allFire(side) {
  return {
    label: side.label,
    finalMult: side.finalMult,
    units: side.units,
    skills: side.skills.map((s) => Object.assign({}, s, { p: 1 })),
  }
}
const one = sim.runOnce(allFire(sides.ours), allFire(sides.enemy), { noise: 0, debug: true })
console.log('全员必放：我方', one.ours.total, '静态', Math.round((c.ours.total.min + c.ours.total.max) / 2))
console.log('          敌方', one.enemy.total, '静态', Math.round((c.enemy.total.min + c.enemy.total.max) / 2))

const pw = (u) => {
  const f = (u.effFmin + u.effFmax) / 2
  const i = (u.effImin + u.effImax) / 2
  return (u.row === 'front' ? f * 1.5 : u.row === 'mid' ? f + i : i) * 2
}
function cmp(label, res, dbg) {
  console.log('\n--- ' + label + ' 逐单位：静态 vs 出战 ---')
  res.units.forEach((u, i) => {
    const s = pw(u)
    const d = dbg[i]
    const bf = (u.baseFmin + u.baseFmax) / 2
    const bi = (u.baseImin + u.baseImax) / 2
    const b = (u.row === 'front' ? (bf + d.df) * (1 + d.pf) * 1.5 : u.row === 'mid' ? (bf + d.df) * (1 + d.pf) + (bi + d.di) * (1 + d.pi) : (bi + d.di) * (1 + d.pi)) * 2
    if (Math.abs(s - b) > 1) {
      console.log('  ' + u.name.padEnd(9) + ' 静态 ' + Math.round(s) + ' 出战 ' + Math.round(b) + ' 差 ' + Math.round(b - s) +
        ' | pf ' + (d.pf * 100).toFixed(1) + '% 静态pf ' + (u.pf * 100).toFixed(1) + '% | df ' + d.df.toFixed(0) + '/' + u.df.toFixed(0))
    }
  })
}
cmp('我方', c.ours, one.units.ours)
cmp('敌方', c.enemy, one.units.enemy)
