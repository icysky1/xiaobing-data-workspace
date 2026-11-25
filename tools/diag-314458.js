#!/usr/bin/env node
// 对账 2：分层拆解 —— 实战 ID:314458 的显示值到底对应模拟器哪一层口径
//   实战：进攻主战 9684（gems 1426/2962/5297）· 助战 2029 = 20%×助战总
//        防守参战 15383（gems 13743/1173/467）· 顶部总战力 17225
//   神兽：进攻鸣蛇 lv92 · 防守帝江 lv91（用户确认，均在前排1号/2号位）
//   结论前提（用户确认）：三排 gems = 最终前/中/后排战力；本场防守方胜
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = () => {}
global.wx = { setStorageSync() {}, getStorageSync() { return '' } }

const FC = require('../xiaobing-data/utils/formationCode.js')
const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const SRC = fs.readFileSync(P, 'utf8').replace(/\r\n/g, '\n')

function load() {
  const m = new Module(P)
  m.filename = P
  m.paths = Module._nodeModulePaths(path.dirname(P))
  m._compile(SRC + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData, collectSide, computeSide, resetUnits, buildBattleSides }', P)
  return m.exports
}
const L = load()

const LV_O = 92 // 进攻方鸣蛇
const LV_E = 91 // 防守方帝江

function slotsOf(code) {
  const d = FC.decode(code)
  const slots = L.makeSlots()
  FC.withRowCol(d.heroes).forEach((e) => {
    const idx = e.row === 'back' ? e.col : e.row === 'mid' ? 6 + e.col : 12 + e.col
    if (e.heroId >= FC.PET_MIN) {
      const p = L.petsData.filter((x) => x.id === e.heroId)[0]
      if (p) slots[idx] = { ...slots[idx], unit: L.petCard(p) }
    } else {
      const h = L.heroesMap[e.heroId]
      if (h) slots[idx] = { ...slots[idx], unit: L.heroCard(h) }
    }
  })
  return slots
}

const ATK = slotsOf('Z3f__IPKOEAgAQOWOQPuASAaACPUOSPOAEAIOHvLqAtxCN')
const DEF = slotsOf('Z3_f_CGyPuAUMCGwGmO4GkOUEGOaAIQAOSGuEJvLpAWtJt')
const ASL = slotsOf('Z3__3MDiACPMDmAmQCDoMCOYDuAqDwAsNMDkOXvLrApZW2')

const mid = (t) => Math.round((t.min + t.max) / 2)
const rowStr = (r) => mid(r.rows.front) + '/' + mid(r.rows.mid) + '/' + mid(r.rows.back)
const pct = (x, y) => ((x / y - 1) * 100).toFixed(0) + '%'

function layers(slots, lv, label, real) {
  const col = L.collectSide(slots, lv)
  const saved = col.effects

  col.effects = []
  L.resetUnits(col.units)
  const r0 = L.computeSide(col, [])

  col.effects = saved.filter((e) => e.forceTargets || e.src === '阵营效果')
  L.resetUnits(col.units)
  const r1 = L.computeSide(col, [])

  col.effects = saved
  L.resetUnits(col.units)
  const r2 = L.computeSide(col, [])

  console.log('\n== ' + label + ' ==')
  console.log('  纯基础      ' + rowStr(r0) + '  总 ' + mid(r0.total))
  console.log('  阵营+羁绊   ' + rowStr(r1) + '  总 ' + mid(r1.total))
  console.log('  全静态      ' + rowStr(r2) + '  总 ' + mid(r2.total))
  if (real) {
    console.log('  实战终局    ' + real.rows + '  总 ' + real.total + '   （模拟全静态/实战 ' + pct(mid(r2.total), real.total) + '）')
    const f = mid(r2.rows.front), m2 = mid(r2.rows.mid), b = mid(r2.rows.back)
    console.log('  排偏差      前' + pct(f, real.f) + '  中' + pct(m2, real.m) + '  后' + pct(b, real.b))
  }
  return { base: mid(r1.total), full: mid(r2.total) }
}

layers(ATK, LV_O, '进攻方（主战 9684 · 鸣蛇 lv' + LV_O + '）', { rows: '1426/2962/5297', total: 9684, f: 1426, m: 2962, b: 5297 })
layers(DEF, LV_E, '防守方（参战 15383 · 帝江 lv' + LV_E + '）', { rows: '13743/1173/467', total: 15383, f: 13743, m: 1173, b: 467 })
layers(ASL, 110, '助战方（实战 20%×总 = 2029 → 总约 10145）', null)

// 推演：王座三档
const sim = require('../xiaobing-data/utils/battleSim.js')
console.log('\n---- 推演（实战：防守方胜） ----')
;[0, 12, 20].forEach((t) => {
  const B = L.buildBattleSides(ATK, DEF, LV_O, LV_E)
  const j = sim.createJob({ ours: B.ours, enemy: B.enemy, sims: 4000, opt: { throneEnemy: t } })
  const st = j.step(1e9).stats
  console.log(
    '王座 +' + t + '%: 进攻胜率 ' + (st.winRate * 100).toFixed(1) + '%' +
    '  终局 攻 ' + st.ours.total + ' (' + st.ours.front + '/' + st.ours.mid + '/' + st.ours.back + ')' +
    ' 守 ' + st.enemy.total + ' (' + st.enemy.front + '/' + st.enemy.mid + '/' + st.enemy.back + ')'
  )
})
