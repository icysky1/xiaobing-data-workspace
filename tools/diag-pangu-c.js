#!/usr/bin/env node
// 对账 3c：防守方前排「进场态」逐被动拆解 —— 找出刑天/李元霸/盘古/孙悟空偏高的来源
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
const simMod = new Module(path.resolve('xiaobing-data/utils/battleSim.js'))
simMod.paths = Module._nodeModulePaths(path.dirname(path.resolve('xiaobing-data/utils/battleSim.js')))
simMod._compile(fs.readFileSync(path.resolve('xiaobing-data/utils/battleSim.js'), 'utf8') + '\nmodule.exports.__extra = { cloneState, fire, pinRange }', path.resolve('xiaobing-data/utils/battleSim.js'))
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
const B = L.buildBattleSides(ATK, DEF, 92, 91)
const me = B.enemy // 防守方
const p = sim.prepare(me)
const st = cloneState(p)

const WATCH = ['刑天', '李元霸', '盘古', '杨再兴', '孙悟空']
const val = (u) => {
  const fr = pinRange(u.baseFmin, u.baseFmax, u.pinF, u.pinFp)
  return ((fr[0] + fr[1]) / 2 + u.df) * (1 + u.pf) * (u.pfm || 1) * (u.dfm || 1)
}
const idxOf = (n) => st.units.findIndex((u) => u.name.indexOf(n) >= 0)

console.log('== 防守方前排：逐被动增量 ==')
console.log('初始: ' + WATCH.map((n) => n + '=' + val(st.units[idxOf(n)]).toFixed(0)).join('  '))
for (let i = 0; i < p.passives.length; i++) {
  const sk = p.passives[i].sk
  const before = WATCH.map((n) => val(st.units[idxOf(n)]))
  fire(sk, st, null, { fired: 0, silencedFoe: 0, immune: 0 })
  const after = WATCH.map((n) => val(st.units[idxOf(n)]))
  const changed = after.some((v, k) => Math.abs(v - before[k]) > 0.5)
  const label = sk.tag || sk.raw || "?" // " + JSON.stringify({own:sk.own,foe:sk.foe,p:sk.p})
  if (changed) {
    console.log('  ' + label)
    console.log('    → ' + WATCH.map((n, k) => n + ': ' + before[k].toFixed(0) + '→' + after[k].toFixed(0) + (Math.abs(after[k] - before[k]) > 0.5 ? ' (' + (after[k] > before[k] ? '+' : '') + (after[k] - before[k]).toFixed(0) + ')' : '')).join('  '))
  }
}
console.log('终态: ' + WATCH.map((n) => n + '=' + val(st.units[idxOf(n)]).toFixed(0)).join('  '))
console.log('实测: 刑天456  李元霸315  盘古629  杨再兴244  孙悟空415')

// 也看看这些英雄的被动技能列表里有什么（便于核对）
console.log('\n== 防守方前排各单位携带的被动技能 ==')
p.passives.forEach((it) => {
  const sk = it.sk
  const own = (sk.own || []).map((d) => 't' + d.t).join(',')
  console.log('  · ' + (sk.raw || sk.label || sk.desc || '') + '   [own: ' + (own || '-') + ']')
})
