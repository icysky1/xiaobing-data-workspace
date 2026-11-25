#!/usr/bin/env node
// 对账 3d：验证「羁绊叠加方式」—— 乘算(现口径) vs 同英雄内加算
//   锚点：防守前排(帝江侧) 进场态武力：刑天456 李元霸315 盘古629 杨再兴244 孙悟空415
//         进攻后排(鸣蛇侧) 进场态智力：神农202 女娲217 苏妲己224 嫦娥156 华胥氏212
//   口径：进场态 = 基础 × 羁绊 × 阵营（四翼和鸣是第一个主动技能）
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

// 把被动分成：阵营(all) 与 羁绊(按持有者分组)，羁绊内加算、羁绊间/阵营乘算
function entryValue(prepared, unitIdx, scheme) {
  const st = cloneState(prepared)
  const passives = prepared.passives
  // 先放阵营（all-target），再放羁绊（每条独立乘算 or 同英雄加算）
  const eras = [], fets = []
  passives.forEach((it) => {
    const own = it.sk.own || []
    const isEra = own.length > 3 // 阵营效果命中全场
    ;(isEra ? eras : fets).push(it.sk)
  })
  const fireSk = (sk) => fire(sk, st, null, { fired: 0, silencedFoe: 0, immune: 0 })
  if (scheme === 'era-first') {
    eras.forEach(fireSk)
    fets.forEach(fireSk) // 乘算（现口径）
  } else {
    // 羁绊内加算：同 sk 组先合并
    eras.forEach(fireSk)
    // 简化：直接逐条放，但把羁绊的 pf 改为加算 —— fire 本身是 pf += d.pf 加算，
    // 乘算来自 pfm。加算方案 = 不用 pfm，用 pf。此处重放：先清 pfm 再换算。
    st.units.forEach((u) => { u.pfm = 1; u.pim = 1; u.pf = 0; u.pi = 0 })
    fets.forEach((sk) => {
      const sk2 = JSON.parse(JSON.stringify(sk))
      const conv = (arr) => (arr || []).map((d) => ({ ...d, pf: (d.pf || 0) + ((d.pfm || 1) - 1), pfm: undefined, pi: (d.pi || 0) + ((d.pim || 1) - 1), pim: undefined }))
      sk2.own = conv(sk.own); sk2.foe = conv(sk.foe)
      fire(sk2, st, null, { fired: 0, silencedFoe: 0, immune: 0 })
    })
  }
  const u = st.units[unitIdx]
  const fr = pinRange(u.baseFmin, u.baseFmax, u.pinF, u.pinFp)
  const ir = pinRange(u.baseImin, u.baseImax, u.pinI, u.pinIp)
  return {
    f: ((fr[0] + fr[1]) / 2 + u.df) * (1 + u.pf) * (u.pfm || 1) * (u.dfm || 1),
    i: ((ir[0] + ir[1]) / 2 + u.di) * (1 + u.pi) * (u.pim || 1) * (u.dim || 1),
  }
}

function findIdx(prep, name) {
  return prep.units.findIndex((u) => u.name.indexOf(name) >= 0)
}

const cases = [
  { side: 'enemy', name: '刑天', attr: 'f', real: 456 },
  { side: 'enemy', name: '李元霸', attr: 'f', real: 315 },
  { side: 'enemy', name: '盘古', attr: 'f', real: 629 },
  { side: 'enemy', name: '杨再兴', attr: 'f', real: 244 },
  { side: 'enemy', name: '孙悟空', attr: 'f', real: 415 },
  { side: 'ours', name: '神农', attr: 'i', real: 202 },
  { side: 'ours', name: '女娲', attr: 'i', real: 217 },
  { side: 'ours', name: '苏妲己', attr: 'i', real: 224 },
  { side: 'ours', name: '嫦娥', attr: 'i', real: 156 },
  { side: 'ours', name: '华胥', attr: 'i', real: 212 },
]

console.log('方案A（羁绊乘算，现口径）          方案B（同英雄羁绊加算）')
let sumA = 0, sumB = 0
cases.forEach((c) => {
  const prep = sim.prepare(c.side === 'enemy' ? B.enemy : B.ours)
  const idx = findIdx(prep, c.name)
  const a = entryValue(prep, idx, 'era-first')[c.attr]
  const b = entryValue(prep, idx, 'fet-add')[c.attr]
  console.log(
    c.name.padEnd(6, '　') + ' 实测' + c.real +
    '   A=' + a.toFixed(0) + ' (' + ((a / c.real - 1) * 100).toFixed(1) + '%)' +
    '   B=' + b.toFixed(0) + ' (' + ((b / c.real - 1) * 100).toFixed(1) + '%)'
  )
  sumA += Math.abs(a / c.real - 1); sumB += Math.abs(b / c.real - 1)
})
console.log('平均绝对偏差  A=' + ((sumA / cases.length) * 100).toFixed(1) + '%   B=' + ((sumB / cases.length) * 100).toFixed(1) + '%')
