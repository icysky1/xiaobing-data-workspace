#!/usr/bin/env node
// 对账 3e：推演到「军师技发动前」，核对盘古 3062 / 军师技后 2756（×0.9）
// 新口径：进场值=被动后；英雄/神兽技增量=目标进场值×pct；阵营技=阶段快照×pct；军师技=当前值×pct
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
const simPath = path.resolve('xiaobing-data/utils/battleSim.js')
const simMod = new Module(simPath)
simMod.paths = Module._nodeModulePaths(path.dirname(simPath))
simMod._compile(fs.readFileSync(simPath, 'utf8') + '\nmodule.exports.__extra = { cloneState, fire, pinRange, curForce, curIntel }', simPath)
const { cloneState, fire, pinRange, curForce, curIntel } = simMod.exports.__extra

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
console.log('先手方: ' + (B.firstBy === 'ours' ? '进攻方(鸣蛇)' : '防守方(帝江)'))

const pA = sim.prepare(B.ours) // 进攻
const pB = sim.prepare(B.enemy) // 防守
const A = cloneState(pA)
const D = cloneState(pB)
const tally = { fired: 0, silencedFoe: 0, immune: 0 }

const force = (u) => curForce(u)
const dIdx = D.units.findIndex((u) => u.name.indexOf('盘古') >= 0)
const show = (tag) => console.log(tag + '  盘古武力=' + force(D.units[dIdx]).toFixed(0))

const ENTRY = { mode: 'entry' }

// 1) 被动
for (let i = 0; i < pA.passives.length; i++) fire(pA.passives[i].sk, A, D, tally)
for (let i = 0; i < pB.passives.length; i++) fire(pB.passives[i].sk, D, A, tally)
// 进场值快照（英雄/神兽技能增量的参考值）
A.units.forEach((u) => { u.f0 = curForce(u); u.i0 = curIntel(u) })
D.units.forEach((u) => { u.f0 = curForce(u); u.i0 = curIntel(u) })
show('被动后(进场值):           实测 629')

// 先手方 = 防守方（战力高），order[k] 是第 k 个出手的 side 下标（0=进攻,1=防守）
const order = B.firstBy === 'ours' ? [0, 1] : [1, 0]
const sides = [A, D]
const preps = [pA, pB]

// 2) 重置 + 3) 号位技能（增量 = 目标进场值 ×pct）
;['reset', 'slot'].forEach((phase) => {
  for (let no = 1; no <= 18; no++) {
    for (let k = 0; k < 2; k++) {
      const s = order[k]
      const side = sides[s]
      const idx = preps[s].bySlot[no]
      if (idx === undefined) continue
      const u = side.units[idx]
      if (u.silenced) continue
      const list = preps[s].byUnit[idx]
      if (!list) continue
      for (let i = 0; i < list.length; i++) {
        if (list[i].phase !== phase) continue
        fire(list[i].sk, side, sides[1 - s], tally, phase === 'reset' ? null : { own: ENTRY, foe: ENTRY })
      }
    }
  }
  if (phase === 'slot') show('号位技能后:')
})

// 4) 阵容技能：阶段开始快照（双方同时取一次）
const snapF = [A.units.map(curForce), D.units.map(curForce)]
const snapI = [A.units.map(curIntel), D.units.map(curIntel)]
for (let k = 0; k < 2; k++) {
  const s = order[k]
  const ctx = {
    own: { mode: 'snap', F: snapF[s], I: snapI[s] },
    foe: { mode: 'snap', F: snapF[1 - s], I: snapI[1 - s] },
  }
  const list = preps[s].eras
  for (let i = 0; i < list.length; i++) {
    console.log('  阵营技[' + (s === 0 ? '攻' : '守') + ']: ' + (list[i].sk.tag || '?'))
    fire(list[i].sk, sides[s], sides[1 - s], tally, ctx)
  }
}
show('阵容技能后(=军师技前):   实测 3062')

// 5) 军师技：历史修正 = 当前值×10% 减益
for (let i = 0; i < pA.schemes.length; i++) {
  const sk = pA.schemes[i].sk
  console.log('进攻方军师技: ' + (sk.tag || sk.raw || '?'))
  fire(sk, A, D, tally, { own: { mode: 'cur' }, foe: { mode: 'cur' } })
}
console.log('军师技后: 盘古武力=' + force(D.units[dIdx]).toFixed(0) + '   实测 2756 (=3062-10%×3062)')
