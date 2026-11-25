// 出手顺序模型验收：口径对齐（终局战力 vs 静态）、方向一致性、先手对称性
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.wx = { setStorageSync() {}, getStorageSync() { return '' } }
global.Page = () => {}
const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports = { makeSlots, heroCard, petCard, heroesMap, buildBattleSides, calcAll, collectSide }', P)
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

const CODE = {
  A: 'Z3-__GNMAqAmOYAEOcACOWDkMyAsDoPSAoAiPfvK4gxdek',
  B: 'Z33__EDCDeKiPOM-KmOEDQAIDGOGKoDEDMOmDTvLqAhicy',
  C: 'Z3-__GPYCIDiDmACOoDuPMMCDkM8DwDoCOCKCDvK5gid-o',
}

function mid(t) { return Math.round((t.min + t.max) / 2) }

function inspect(name, slots) {
  const col = X.collectSide(slots)
  const kinds = {}
  col.effects.forEach((e) => { const k = e.type || 'buff'; kinds[k] = (kinds[k] || 0) + 1 })
  console.log('  ' + name + ' 效果 ' + col.effects.length + ' 条：' + Object.keys(kinds).map((k) => k + '×' + kinds[k]).join(' '))
}

console.log('=== ① 单场口径：全员放完 ≈ 静态 ===')
;['A', 'B', 'C'].forEach((k) => inspect(k, build(CODE[k])))
const sa = build(CODE.A)
const sb = build(CODE.B)
const sides = X.buildBattleSides(sa, sb)
const c = X.calcAll({ ours: { slots: sa }, enemy: { slots: sb } })
console.log('  静态：我方 ' + mid(c.ours.total) + ' / 敌方 ' + mid(c.enemy.total))
const one = sim.runOnce(sides.ours, sides.enemy, { noise: 0, solo: false })
console.log('  单场：起算 ' + one.startOurs + ' → 终局 ' + one.ours.total + ' | 敌方 ' + one.startEnemy + ' → ' + one.enemy.total)
console.log('  放出技能 ' + one.fired + ' 条，被沉默 我方' + one.silencedOurs + ' 人 / 敌方' + one.silencedEnemy + ' 人')

const j = sim.createJob({ ours: sides.ours, enemy: sides.enemy, sims: 600, opt: { solo: false } })
let r = j.step(1e9)
while (!r.done) r = j.step(1e9)
const st = r.stats
console.log('  600 场均值：起算 ' + st.startOurs + ' → 终局 ' + st.ours.total + ' | 敌方 ' + st.startEnemy + ' → ' + st.enemy.total)
console.log('  与静态偏差：我方 ' + (Math.round((st.ours.total / mid(c.ours.total) - 1) * 1000) / 10) + '% 敌方 ' + (Math.round((st.enemy.total / mid(c.enemy.total) - 1) * 1000) / 10) + '%')
console.log('  胜率 ' + (st.winRate * 100).toFixed(1) + '% 平 ' + (st.drawRate * 100).toFixed(1) + '% 平均沉默 我' + st.avgSilencedOurs + '/敌' + st.avgSilencedEnemy)

console.log('\n=== ② 方向一致性矩阵（静态占优 vs 推演胜率） ===')
let bad = 0
const pairs = [['A', 'B'], ['B', 'A'], ['B', 'C'], ['C', 'B'], ['A', 'C'], ['C', 'A']]
pairs.forEach(([x, y]) => {
  const ax = build(CODE[x])
  const by = build(CODE[y])
  const cc = X.calcAll({ ours: { slots: ax }, enemy: { slots: by } })
  const om = (cc.ours.total.min + cc.ours.total.max) / 2
  const em = (cc.enemy.total.min + cc.enemy.total.max) / 2
  const adv = om > em * 1.02 ? '我优' : em > om * 1.02 ? '敌优' : '接近'
  const s = X.buildBattleSides(ax, by)
  const jj = sim.createJob({ ours: s.ours, enemy: s.enemy, sims: 500, opt: {} })
  const sr = jj.step(1e9).stats
  const wr = sr.winRate
  const flag = (adv === '我优' && wr < 0.5) || (adv === '敌优' && wr > 0.5)
  if (flag) bad++
  console.log('  ' + x + ' vs ' + y + ' 静态' + adv + '（' + Math.round(om) + ' vs ' + Math.round(em) + '）→ 胜率 ' + (wr * 100).toFixed(1) + '%' + (flag ? '  ⚠️ 方向不一致' : ''))
})

console.log('\n=== ③ 先手价值：同一对阵容强制交换先手 ===')
const sAB = X.buildBattleSides(sa, sb)
const nat = sim.createJob({ ours: sAB.ours, enemy: sAB.enemy, sims: 200, opt: { solo: false } })
console.log('  先手判定：基础战力 我方 ' + Math.round(sAB.ours.power) + ' / 敌方 ' + Math.round(sAB.enemy.power) + ' → 引擎判先手 = ' + (nat.first === 'enemy' ? '敌方' : '我方'))
const ab = sim.createJob({ ours: sAB.ours, enemy: sAB.enemy, sims: 800, opt: { first: 'ours', solo: false } }).step(1e9).stats
const ba = sim.createJob({ ours: sAB.ours, enemy: sAB.enemy, sims: 800, opt: { first: 'enemy', solo: false } }).step(1e9).stats
console.log('  我方先手：我方胜率 ' + (ab.winRate * 100).toFixed(1) + '%')
console.log('  敌方先手：我方胜率 ' + (ba.winRate * 100).toFixed(1) + '%')
console.log(bad === 0 ? '\n✅ 方向一致' : '\n❌ ' + bad + ' 组不一致')
