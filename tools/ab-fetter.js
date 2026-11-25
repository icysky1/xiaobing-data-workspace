// A/B 实验：羁绊「加算 vs 乘算」对两场实战对账的影响
// 用法：node tools/ab-fetter.js
// 注意：computeSide 有副作用（重复调用会二次叠加效果），因此每次都要重新 collectSide
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
m._compile(
  fs.readFileSync(P, 'utf8') +
    '\nmodule.exports={makeSlots,heroCard,petCard,heroesMap,petsData,collectSide,resetUnits,computeSide,buildBattleSides,petSkillTiers}',
  P
)
const L = m.exports

const findHero = (n) => L.heroesMap[n] || Object.values(L.heroesMap).find((x) => x.name === n)
const findPet = (n) => L.petsData.filter((x) => x.name === n)[0]

function slotsOfCode(code, lv) {
  const d = FC.decode(code)
  const slots = L.makeSlots()
  FC.withRowCol(d.heroes).forEach((e) => {
    const idx = e.row === 'back' ? e.col : e.row === 'mid' ? 6 + e.col : 12 + e.col
    if (e.heroId >= FC.PET_MIN) {
      const p = L.petsData.filter((x) => x.id === e.heroId)[0]
      if (p) slots[idx] = { ...slots[idx], unit: L.petCard(p, lv) }
    } else {
      const h = L.heroesMap[e.heroId]
      if (h) slots[idx] = { ...slots[idx], unit: L.heroCard(h) }
    }
  })
  return slots
}

// 308453 先手方：按号位 1-18 填
const ORDER = ['刑天', '吕布', '李煜', '黄金甲·杨再兴', '罗成', '李渊', '黄金甲·盘古', '韩擒虎', '花蕊夫人', '__PET__', '孙悟空', '柴荣', '李元霸', '项羽', '邓禹', '薛丁山', null, '吴刚']
function slotsOfOrder() {
  const slots = L.makeSlots()
  ORDER.forEach((name, n) => {
    if (!name) return
    const rowIdx = n % 3
    const colIdx = Math.floor(n / 3)
    const idx = (2 - rowIdx) * 6 + colIdx
    if (name === '__PET__') {
      const p = findPet('饕餮')
      slots[idx] = { ...slots[idx], unit: L.petCard(p, 90) }
      return
    }
    const h = findHero(name)
    slots[idx] = { ...slots[idx], unit: L.heroCard(h) }
  })
  return slots
}

const mid = (t) => Math.round((t.min + t.max) / 2)
const FM = 2 // FINAL_MULT 显示系数

function run(tag, slots, lv, oppSlots, real) {
  const col = L.collectSide(slots, lv)
  const opp = oppSlots ? L.collectSide(oppSlots, 90) : null
  L.resetUnits(col.units)
  const r = L.computeSide(col, opp ? opp.effects : [])
  const f = mid(r.rows.front) / FM
  const mm = mid(r.rows.mid) / FM
  const b = mid(r.rows.back) / FM
  const t = mid(r.total) / FM
  const dev = (a, b2) => ((a / b2 - 1) * 100).toFixed(0) + '%'
  console.log(
    tag.padEnd(22) +
      '前 ' + String(f).padStart(6) + ' (实战 ' + real[0] + ' ' + dev(f, real[0]).padStart(5) + ')  ' +
      '中 ' + String(mm).padStart(5) + ' (' + real[1] + ' ' + dev(mm, real[1]).padStart(5) + ')  ' +
      '后 ' + String(b).padStart(5) + ' (' + real[2] + ' ' + dev(b, real[2]).padStart(5) + ')  ' +
      '总 ' + String(t).padStart(6) + ' (实战和 ' + real[3] + ' ' + dev(t, real[3]).padStart(5) + ')'
  )
}

const ATK314458 = slotsOfCode('Z3f__IPKOEAgAQOWOQPuASAaACPUOSPOAEAIOHvLqAtxCN', 92)
const DEF314458 = slotsOfCode('Z3_f_CGyPuAUMCGwGmO4GkOUEGOaAIQAOSGuEJvLpAWtJt', 91)
const A308 = slotsOfOrder()
const B308 = slotsOfCode('Z3_f_CGyH2PqGwEIQmAIGkOUG2O0OSQAAUEGH5vK3gf2pq', 90)

console.log('=== 当前口径（羁绊加算） ===')
run('308453 先手', A308, 90, B308, [9831, 1034, 423, 11288])
run('308453 后手', B308, 90, A308, [11485, 1337, 249, 13071])
run('314458 进攻', ATK314458, 92, DEF314458, [5299, 2962, 1426, 9684])
run('314458 防守', DEF314458, 91, ATK314458, [13743, 1173, 467, 15383])

// 逐单位前排对比（308453 先手）
const realF = { 刑天: 1012, '黄金甲·杨再兴': 466, '黄金甲·盘古': 1508, 饕餮: 2582, 李元霸: 580, 薛丁山: 406 }
const col = L.collectSide(A308, 90)
L.resetUnits(col.units)
L.computeSide(col, B308.effects)
console.log('\n308453 先手前排逐格:')
col.units.filter((u) => u.row === 'front').forEach((u) => {
  const e = (u.effFmin + u.effFmax) / 2
  const r = realF[u.name]
  console.log('  ' + u.name.padEnd(12) + ' effF=' + e.toFixed(0).padStart(5) + '  实测=' + String(r).padStart(5) + '  比值=' + (r / e).toFixed(2))
})
