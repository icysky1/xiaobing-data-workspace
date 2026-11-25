#!/usr/bin/env node
// 暴力拟合：枚举 行公式 × 系数 × 缩放 × 行序，找同时匹配双方 gems 的组合
const FC = require('../xiaobing-data/utils/formationCode.js')
const heroMap = require('../xiaobing-data/data/heroes.js')
const petsArr = (() => { const m = require('../xiaobing-data/data/pets.js'); return Array.isArray(m) ? m : Object.values(m) })()
const teamBuff = require('../xiaobing-data/data/teamBuff.js')

const FRONT = [1, 4, 7, 10, 13, 16], MID = [2, 5, 8, 11, 14, 17], BACK = [3, 6, 9, 12, 15, 18]
function nameBase(n) { return String(n || '').replace(/^(飞仙|黄金甲|戏魂|昊天)·/, '') }
function parseEffect(str) {
  const out = { fp: 0, ip: 0, fa: 0, ia: 0 }
  String(str || '').split(/[，,]/).forEach((tok) => {
    const m = tok.match(/^(武力|智力)\s*\+\s*([\d.]+)%?$/)
    if (!m) return
    const v = parseFloat(m[2])
    if (m[1] === '武力') { if (/%$/.test(tok)) out.fp += v * 10; else out.fa += v } else { if (/%$/.test(tok)) out.ip += v * 10; else out.ia += v }
  })
  return out
}
function eraAdditionOf(heroes) {
  const groups = {}
  heroes.forEach((h) => { groups[h.era] = (groups[h.era] || 0) + 1 })
  let f = 0, iq = 0
  Object.keys(groups).forEach((e) => {
    const n = groups[e]; if (n < 3) return
    const tb = teamBuff.filter((x) => x.n === n)[0]; if (!tb) return
    f += tb.pct * 100; iq += tb.pct * 100
  })
  return { f: f, iq: iq }
}
function calcUnits(code, fetterMode) {
  const d = FC.decode(code)
  const units = []
  d.heroes.forEach((e) => {
    const row = FRONT.indexOf(e.position) >= 0 ? 'front' : MID.indexOf(e.position) >= 0 ? 'mid' : 'back'
    if (e.heroId >= FC.PET_MIN) {
      const p = petsArr.filter((x) => x.id === e.heroId)[0]
      units.push({ pos: e.position, row: row, pet: p, name: p.name, era: '', force: p.fp.slice(), iq: p.sp.slice(), inherit: p.inherit })
    } else {
      const h = heroMap[e.heroId]
      units.push({ pos: e.position, row: row, hero: h, name: h.name, era: h.era, quality: h.quality, force: h.force.slice(), iq: h.iq.slice(), fetters: h.fetters || [] })
    }
  })
  const heroes = units.filter((u) => u.hero)
  const deployed = new Set(heroes.map((u) => nameBase(u.name)))
  const era = eraAdditionOf(heroes)
  units.forEach((u) => {
    if (!u.hero) return
    u.fpd = 0; u.ipd = 0; u.fa = 0; u.ia = 0
    ;(u.fetters || []).forEach((ft) => {
      let active
      if (!ft.heroes || !ft.heroes.length) {
        const m = String(ft.effect || '').match(/任意(\d+)位/)
        active = heroes.filter((x) => x !== u && x.quality >= 5).length >= (m ? Number(m[1]) : 1)
      } else {
        active = ft.heroes.every((n) => deployed.has(nameBase(n)))
      }
      if (!active) return
      const v = parseEffect(ft.effect)
      // fetterMode: owner=加给自己；companion=加给同伴（heroes 列表里的人）
      if (fetterMode === 'owner') { u.fpd += v.fp; u.ipd += v.ip; u.fa += v.fa; u.ia += v.ia }
    })
  })
  if (fetterMode === 'companion') {
    // 重新按“谁的 fetter 指向谁”分配
    units.forEach((u) => { u.fpd = 0; u.ipd = 0; u.fa = 0; u.ia = 0 })
    heroes.forEach((h) => {
      ;(h.fetters || []).forEach((ft) => {
        let active
        if (!ft.heroes || !ft.heroes.length) {
          const m = String(ft.effect || '').match(/任意(\d+)位/)
          active = heroes.filter((x) => x !== h && x.quality >= 5).length >= (m ? Number(m[1]) : 1)
        } else active = ft.heroes.every((n) => deployed.has(nameBase(n)))
        if (!active) return
        const v = parseEffect(ft.effect)
        const targets = (ft.heroes || []).length ? heroes.filter((x) => ft.heroes.some((n) => nameBase(x.name) === nameBase(n))) : [h]
        targets.forEach((t) => { t.fpd += v.fp; t.ipd += v.ip; t.fa += v.fa; t.ia += v.ia })
      })
    })
  }
  units.forEach((u) => {
    if (u.hero) return
    const rowHeroes = units.filter((x) => x.hero && x.row === u.row)
    let sf = 0, si = 0
    rowHeroes.forEach((x) => {
      sf += x.force[1] + x.fa + x.force[1] * x.fpd / 1000
      si += x.iq[1] + x.ia + x.iq[1] * x.ipd / 1000
    })
    u.inhF = sf * (u.inherit ? u.inherit.force : 0) / 1000
    u.inhI = si * (u.inherit ? u.inherit.iq : 0) / 1000
  })
  units.forEach((u) => {
    u.a1 = 0; u.i1 = 0
    let f = u.force[1], i = u.iq[1]
    if (u.hero) { f += u.fa + u.force[1] * u.fpd / 1000; i += u.ia + u.iq[1] * u.ipd / 1000 } else { f += u.inhF; i += u.inhI }
    u.a1 = f * (1 + era.f / 1000)
    u.i1 = i * (1 + era.iq / 1000)
  })
  return units
}
const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
const FORMULAS = [
  ['1.5f', (u) => 1.5 * u.a1],
  ['f+i', (u) => u.a1 + u.i1],
  ['i', (u) => u.i1],
  ['f', (u) => u.a1],
  ['1.5f+i', (u) => 1.5 * u.a1 + u.i1],
  ['1.5(f+i)', (u) => 1.5 * (u.a1 + u.i1)],
  ['2f', (u) => 2 * u.a1],
  ['2i', (u) => 2 * u.i1],
  ['f+1.5i', (u) => u.a1 + 1.5 * u.i1],
  ['1.5f+1.5i', (u) => 1.5 * (u.a1 + u.i1)],
]
const ATK_GEMS = [1426, 2962, 5297]
const DEF_GEMS = [13743, 1173, 467]

function tryFit(label, code, gems) {
  const results = []
  for (const fm of ['owner', 'companion']) {
    const units = calcUnits(code, fm)
    const rows = { front: units.filter((u) => u.row === 'front'), mid: units.filter((u) => u.row === 'mid'), back: units.filter((u) => u.row === 'back') }
    for (const scale of [1, 2, 3]) {
      for (const fp of FORMULAS) for (const mp of FORMULAS) for (const bp of FORMULAS) {
        const vals = {
          front: scale * rows.front.reduce((s, u) => s + fp[1](u), 0),
          mid: scale * rows.mid.reduce((s, u) => s + mp[1](u), 0),
          back: scale * rows.back.reduce((s, u) => s + bp[1](u), 0),
        }
        for (const perm of perms) {
          // perm[i] = 实际 gems 第 i 位对应的行
          const targets = [gems[perm[0]], gems[perm[1]], gems[perm[2]]]
          const errs = ['front', 'mid', 'back'].map((k, idx) => vals[k] / targets[idx] - 1)
          if (errs.every((e) => Math.abs(e) < 0.06)) {
            results.push({ fm, scale, f: fp[0], m: mp[0], b: bp[0], perm: perm.join(''), errs: errs.map((e) => (e * 100).toFixed(1) + '%').join('/'), errsRaw: errs.map(Math.abs) })
          }
        }
      }
    }
  }
  console.log('== ' + label + ' 命中组合: ' + results.length)
  results.sort((a,b)=>Math.max(...a.errsRaw)>Math.max(...b.errsRaw)?1:-1);results.slice(0, 12).forEach((r) => console.log('  ', JSON.stringify(r)))
  return results
}

const dump = (label, code) => {
  const units = calcUnits(code, 'owner')
  console.log('== ' + label + ' 逐单位（owner 羁绊） ==')
  units.forEach((u) => console.log('  #' + String(u.pos).padStart(2), u.row.padEnd(5), u.name.padEnd(10), 'era=' + String(u.era).padEnd(4), 'attack=' + u.a1.toFixed(1), 'iq=' + u.i1.toFixed(1)))
}
dump('进攻方', 'Z3f__IPKOEAgAQOWOQPuASAaACPUOSPOAEAIOHvLqAtxCN')
dump('防守方', 'Z3_f_CGyPuAUMCGwGmO4GkOUEGOaAIQAOSGuEJvLpAWtJt')
tryFit('进攻方', 'Z3f__IPKOEAgAQOWOQPuASAaACPUOSPOAEAIOHvLqAtxCN', ATK_GEMS)
tryFit('防守方', 'Z3_f_CGyPuAUMCGwGmO4GkOUEGOaAIQAOSGuEJvLpAWtJt', DEF_GEMS)
