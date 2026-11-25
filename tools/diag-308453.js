// ID 308453 众生平等对账（用户提供先手方 18 号位逐一点名 + 双方三排宝石）
// 实战：先手 总15822 前9831 中1034 后423；后手(码 Z3_f_CGy...) 总15836 前11485 中1337 后249
// 先手军师技 淝水风声（敌前排武力-6%）；按无助战。
global.Page = () => {}
global.wx = { setStorageSync() {}, getStorageSync() { return '' } }
const fs = require('fs')
const path = require('path')
const Module = require('module')
const FC = require('../xiaobing-data/utils/formationCode.js')
const P = path.resolve(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const m = new Module(P)
m.filename = P
m.paths = Module._nodeModulePaths(path.dirname(P))
m._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports={makeSlots,heroCard,petCard,heroesMap,petsData,collectSide,resetUnits,computeSide,buildBattleSides,petSkillTiers}', P)
const L = m.exports
const mid = (t) => Math.round((t.min + t.max) / 2)

// ---- 先手方：号位 1-18（前排=1/4/7/10/13/16，中排=2/5/8/11/14/17，后排=3/6/9/12/15/18）----
const ORDER = [
  '刑天', '吕布', '李煜',
  '黄金甲·杨再兴', '罗成', '李渊',
  '黄金甲·盘古', '韩擒虎', '花蕊夫人',
  '__PET_TAOTIE__', '孙悟空', '柴荣',
  '李元霸', '项羽', '邓禹',
  '薛丁山', null, '吴刚',
]
// 槽位约定（与 formationCode 一致）：0-5=后排、6-11=中排、12-17=前排
// 号位 n → 行序 (n-1)%3（0前/1中/2后）、列 floor((n-1)/3)
const A = L.makeSlots()
ORDER.forEach((name, n) => {
  const rowIdx = n % 3 // 0 front / 1 mid / 2 back
  const colIdx = Math.floor(n / 3)
  const idx = (2 - rowIdx) * 6 + colIdx
  if (name === null) return
  if (name === '__PET_TAOTIE__') {
    const p = L.petsData.filter((x) => x.name === '饕餮')[0]
    A[idx] = { ...A[idx], unit: L.petCard(p, 90) }
    return
  }
  let h = L.heroesMap[name] || Object.values(L.heroesMap).find((x) => x.name === name)
  if (!h) throw new Error('英雄未找到: ' + name)
  A[idx] = { ...A[idx], unit: L.heroCard(h) }
})

// ---- 后手方：阵容码（含麒麟，强制 90 级）----
const CODE = 'Z3_f_CGyH2PqGwEIQmAIGkOUG2O0OSQAAUEGH5vK3gf2pq'
const B = L.makeSlots()
FC.withRowCol(FC.decode(CODE).heroes).forEach((e) => {
  const idx = e.row === 'back' ? e.col : e.row === 'mid' ? 6 + e.col : 12 + e.col
  if (e.heroId >= FC.PET_MIN) {
    const p = L.petsData.filter((x) => x.id === e.heroId)[0]
    if (p) B[idx] = { ...B[idx], unit: L.petCard(p, 90) }
  } else {
    const h = L.heroesMap[e.heroId]
    if (h) B[idx] = { ...B[idx], unit: L.heroCard(h) }
  }
})

// ---- 静态逐层 ----
function layers(slots, lv, tag, real) {
  const col = L.collectSide(slots, lv)
  const saved = col.effects
  col.effects = []
  L.resetUnits(col.units)
  const r0 = L.computeSide(col, [])
  col.effects = saved
  L.resetUnits(col.units)
  const r1 = L.computeSide(col, [])
  console.log('== ' + tag + ' (神兽lv' + lv + ') ==')
  console.log('  裸值     前' + mid(r0.rows.front) + ' 中' + mid(r0.rows.mid) + ' 后' + mid(r0.rows.back) + ' 总' + mid(r0.total))
  console.log('  全静态   前' + mid(r1.rows.front) + ' 中' + mid(r1.rows.mid) + ' 后' + mid(r1.rows.back) + ' 总' + mid(r1.total))
  console.log('  实战终局 ' + real)
  return col
}
const colA = layers(A, 90, '先手方', '前9831 中1034 后423 总15822')
const colD = layers(B, 90, '后手方', '前11485 中1337 后249 总15836')

// ---- 推演 ----
const sim = require('../xiaobing-data/utils/battleSim.js')
const BB = L.buildBattleSides(A, B, 90, 90)
console.log('\n引擎先手判定: ' + (BB.firstBy === 'ours' ? '我方(先手方)' : '敌方(后手方)') + '  (实战: 先手方先手)')
const j = sim.createJob({ ours: BB.ours, enemy: BB.enemy, sims: 4000 })
const st = j.step(1e9).stats
console.log('推演: 先手方胜率 ' + ((BB.firstBy === 'ours' ? st.winRate : 1 - st.winRate) * 100).toFixed(1) + '%  (实战军师技=先手方淝水风声)')
console.log('  先手方三排 ' + st.ours.front + '/' + st.ours.mid + '/' + st.ours.back + ' 总' + st.ours.total + '  (实战 9831/1034/423 总11288)')
console.log('  后手方三排 ' + st.enemy.front + '/' + st.enemy.mid + '/' + st.enemy.back + ' 总' + st.enemy.total + '  (实战 11485/1337/249 总13071)')
console.log('  比值 先前' + (st.ours.front / 9831).toFixed(2) + ' 先中' + (st.ours.mid / 1034).toFixed(2) + ' 先后' + (st.ours.back / 423).toFixed(2))
console.log('  比值 后前' + (st.enemy.front / 11485).toFixed(2) + ' 后中' + (st.enemy.mid / 1337).toFixed(2) + ' 后后' + (st.enemy.back / 249).toFixed(2))
console.log('  免疫/沉默统计: ' + JSON.stringify(st.tally || {}))
