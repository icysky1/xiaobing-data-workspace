#!/usr/bin/env node
// 对账 3f：逐技能列出「盘古在 slot/era 阶段吃到的增益」，找 629→3062 缺口
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
  m._compile(SRC + '\nmodule.exports = { makeSlots, heroCard, petCard, heroesMap, petsData, collectSide, computeSide, buildBattleSides }', P)
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
const pA = sim.prepare(B.ours)
const pB = sim.prepare(B.enemy)
const A = cloneState(pA)
const D = cloneState(pB)
const tally = { fired: 0, silencedFoe: 0, immune: 0 }
const dIdx = D.units.findIndex((u) => u.name.indexOf('盘古') >= 0)

const force = (u) => {
  const fr = pinRange(u.baseFmin, u.baseFmax, u.pinF, u.pinFp)
  return Math.max(0, ((fr[0] + fr[1]) / 2 + u.df) * (1 + u.pf) * (u.pfm || 1) * (u.dfm || 1))
}
const snap = () => {
  const u = D.units[dIdx]
  return { f: force(u), pf: u.pf, pfm: u.pfm || 1, df: u.df, dfm: u.dfm || 1 }
}

for (let i = 0; i < pA.passives.length; i++) fire(pA.passives[i].sk, A, D, tally)
for (let i = 0; i < pB.passives.length; i++) fire(pB.passives[i].sk, D, A, tally)

const order = B.firstBy === 'ours' ? [0, 1] : [1, 0]
const sides = [A, D]
const preps = [pA, pB]
const sname = (s) => (s === 0 ? '进攻' : '防守')

const logSk = (tag, sk, before, phase) => {
  const after = snap()
  const b = before
  const dF = after.f - b.f
  if (Math.abs(dF) < 0.5) return
  const u = D.units[dIdx]
  console.log(
    '[' + phase + '][' + tag + '] ' + (sk.tag || sk.raw || '(无标签)') +
    '   盘古: ' + b.f.toFixed(0) + '→' + after.f.toFixed(0) + ' (' + (dF > 0 ? '+' : '') + dF.toFixed(0) + ')' +
    '   [pf=' + u.pf.toFixed(3) + ' pfm=' + (u.pfm || 1).toFixed(3) + ' df=' + u.df.toFixed(0) + ']'
  )
}

;['reset', 'slot'].forEach((phase) => {
  for (let no = 1; no <= 18; no++) {
    for (let k = 0; k < 2; k++) {
      const s = order[k]
      const side = sides[s]
      const idx = preps[s].bySlot[no]
      if (idx === undefined) continue
      const list = preps[s].byUnit[idx]
      if (!list) continue
      for (let i = 0; i < list.length; i++) {
        if (list[i].phase !== phase) continue
        const sk = list[i].sk
        const holderName = side.units[idx] ? side.units[idx].name : '?'
        const before = snap()
        fire(sk, side, sides[1 - s], tally)
        logSk(sname(s) + '·' + holderName, sk, before, phase)
      }
    }
  }
})
for (let k = 0; k < 2; k++) {
  const s = order[k]
  preps[s].eras.forEach((it) => {
    const before = snap()
    fire(it.sk, sides[s], sides[1 - s], tally)
    logSk(sname(s) + '·阵容', it.sk, before, 'era')
  })
}
const u = D.units[dIdx]
console.log('\n盘古终值(军师技前): ' + force(u).toFixed(0) + '   实测 3062   倍数 ' + (3062 / force(u)).toFixed(2))
console.log('盘古状态: pf=' + u.pf.toFixed(3) + ' pfm=' + (u.pfm || 1).toFixed(3) + ' df=' + u.df.toFixed(0) + ' dfm=' + (u.dfm || 1).toFixed(3))
