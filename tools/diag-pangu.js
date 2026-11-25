#!/usr/bin/env node
// 对账 3b：ID:314458 按推演阶段逐单位核对
//   进场态 = 被动(阵营+羁绊)后；实测锚点：
//   · 盘古 进场 627（=四翼和鸣时点 629）
//   · 四翼和鸣(+41%武力) 反推防守前排：刑天456 李元霸315 盘古629 杨再兴244 孙悟空415
//   · 浑敦感知(-41%智力) 反推进攻后排：神农202 女娲217 苏妲己224 嫦娥156 华胥氏212
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
const sim = require('../xiaobing-data/utils/battleSim.js')
// battleSim 只导出 prepare —— cloneState/fire/pinRange 从源码补齐（与实现保持同口径）
const simSrc = fs.readFileSync(path.resolve('xiaobing-data/utils/battleSim.js'), 'utf8')
const simMod = new Module(path.resolve('xiaobing-data/utils/battleSim.js'))
simMod.filename = simMod.filename
simMod.paths = Module._nodeModulePaths(path.dirname(path.resolve('xiaobing-data/utils/battleSim.js')))
simMod._compile(simSrc + '\nmodule.exports.__extra = { cloneState, fire, pinRange }', path.resolve('xiaobing-data/utils/battleSim.js'))
const { cloneState, fire, pinRange } = simMod.exports.__extra

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

function entryState(slots, lv, label, targets) {
  const B = L.buildBattleSides(ATK, DEF, 92, 91)
  const me = label.indexOf('防守') >= 0 ? B.enemy : B.ours
  const foe = label.indexOf('防守') >= 0 ? B.ours : B.enemy
  const p = sim.prepare(me)
  const st = cloneState(p)
  const tally = { fired: 0, silencedFoe: 0, immune: 0 }
  for (let i = 0; i < p.passives.length; i++) fire(p.passives[i].sk, st, null, tally)
  console.log('\n== ' + label + '（被动后=进场态） ==')
  const rows = { front: [], mid: [], back: [] }
  st.units.forEach((u) => rows[u.row].push(u))
  Object.keys(rows).forEach((r) => {
    console.log('  [' + r + ']')
    rows[r].forEach((u) => {
      const fr = pinRange(u.baseFmin, u.baseFmax, u.pinF, u.pinFp)
      const ir = pinRange(u.baseImin, u.baseImax, u.pinI, u.pinIp)
      const f = ((fr[0] + fr[1]) / 2 + u.df) * (1 + u.pf) * (u.pfm || 1) * (u.dfm || 1)
      const ii = ((ir[0] + ir[1]) / 2 + u.di) * (1 + u.pi) * (u.pim || 1) * (u.dim || 1)
      console.log('    ' + u.name.padEnd(10, '　') + '  武力=' + f.toFixed(0) + '  智力=' + ii.toFixed(0))
    })
  })
  if (targets) {
    console.log('  -- 锚点对比（进场态） --')
    targets.forEach(([name, attr, real]) => {
      const u = st.units.filter((x) => x.name.indexOf(name) >= 0)[0]
      if (!u) { console.log('    ! 找不到 ' + name); return }
      const fr = pinRange(u.baseFmin, u.baseFmax, u.pinF, u.pinFp)
      const ir = pinRange(u.baseImin, u.baseImax, u.pinI, u.pinIp)
      const v = attr === 'F'
        ? ((fr[0] + fr[1]) / 2 + u.df) * (1 + u.pf) * (u.pfm || 1) * (u.dfm || 1)
        : ((ir[0] + ir[1]) / 2 + u.di) * (1 + u.pi) * (u.pim || 1) * (u.dim || 1)
      console.log('    ' + u.name + '  实测=' + real + '  模型=' + v.toFixed(0) + '  倍数=' + (v / real).toFixed(2))
    })
  }
  return { p, st }
}

// buildBattleSides 需要双方，先统一构建
entryState(DEF, 91, '防守方（帝江 lv91）', [
  ['刑天', 'F', 456],
  ['李元霸', 'F', 315],
  ['盘古', 'F', 629],
  ['杨再兴', 'F', 244],
  ['孙悟空', 'F', 415],
])
entryState(ATK, 92, '进攻方（鸣蛇 lv92）', [
  ['神农', 'I', 202],
  ['女娲', 'I', 217],
  ['苏妲己', 'I', 224],
  ['嫦娥', 'I', 156],
  ['华胥', 'I', 212],
])
