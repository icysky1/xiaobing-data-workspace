#!/usr/bin/env node
// 校验：按解包客户端的真实公式重算「主战/参战战力」，对账实战 ID:314458
// 客户端公式（game.js 已考证）：
//   每单位 attack/iq = 基础区间 → +羁绊(自身卡面羁绊, aPer×基础+a) → ×(1+阵营加成‰)
//   阵营加成 = 每个同阵营组(≥3人)按 teamBuff 档位求和，作用于全体单位
//   神兽 = 基础 + 同排英雄(羁绊后、阵营前) 的 attack/iq × petInherit‰ → 再吃阵营加成
//   frontNum = round(1.5 × Σ前排 attack[max]) ; middleNum = round(Σ中排 (attack+iq)[max]) ; backNum = round(Σ后排 iq[max])
//   主战(显示) = frontNum+middleNum+backNum ；助战 = ×(20%)
// 实战：进攻 gems 1426/2962/5297=9685 · 防守 gems 13743/1173/467=15383 · 助战 2029→10145
const FC = require('../xiaobing-data/utils/formationCode.js')
const heroMap = require('../xiaobing-data/data/heroes.js')
const petsArr = (() => { const m = require('../xiaobing-data/data/pets.js'); return Array.isArray(m) ? m : Object.values(m) })()
const teamBuff = require('../xiaobing-data/data/teamBuff.js')

const FRONT = [1, 4, 7, 10, 13, 16], MID = [2, 5, 8, 11, 14, 17], BACK = [3, 6, 9, 12, 15, 18]

function nameBase(n) { return String(n || '').replace(/^(飞仙|黄金甲|戏魂|昊天)·/, '') }
function parseEffect(str) {
  // "武力+40%,智力+30%" → {fp:400, ip:300} ‰ ；兼容无%的平加
  const out = { fp: 0, ip: 0, fa: 0, ia: 0 }
  String(str || '').split(/[，,]/).forEach((tok) => {
    const m = tok.match(/^(武力|智力)\s*\+\s*([\d.]+)%?$/)
    if (!m) return
    const v = parseFloat(m[2])
    if (m[1] === '武力') { if (/%$/.test(tok)) out.fp += v * 10; else out.fa += v }
    else { if (/%$/.test(tok)) out.ip += v * 10; else out.ia += v }
  })
  return out
}

// 阵营加成（‰）：每个 ≥3 人组求和；西楚并入主力阵营（本对局无西楚，跳过）
function eraAdditionOf(heroes) {
  const groups = {}
  heroes.forEach((h) => { const e = h.era; groups[e] = (groups[e] || 0) + 1 })
  let f = 0, iq = 0
  const detail = []
  Object.keys(groups).forEach((e) => {
    const n = groups[e]
    if (n < 3) return
    const tb = teamBuff.filter((x) => x.n === n)[0]
    if (!tb) return
    f += tb.pct * 100; iq += tb.pct * 100   // pct=1.8 → 18% → 180‰
    detail.push(e + '×' + n + ' +' + (tb.pct * 10) + '%')
  })
  return { f: f, iq: iq, detail: detail }
}

function calc(code, opt) {
  const o = opt || {}
  const d = FC.decode(code)
  const units = [] // {pos, row, hero|pet, era, name, force[min,max], iq[min,max]}
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
  const deployedNames = new Set(heroes.map((u) => nameBase(u.name)))
  const era = eraAdditionOf(heroes)

  // 羁绊（挂在自己的卡面上，搭档全在才激活）
  units.forEach((u) => {
    if (!u.hero) return
    u.fpd = 0; u.ipd = 0; u.fa = 0; u.ia = 0
    ;(u.fetters || []).forEach((ft) => {
      let active = false
      if (!ft.heroes || !ft.heroes.length) {
        // 任意N位神话英雄：数其他在场的高品质英雄
        const m = String(ft.effect || '').match(/任意(\d+)位/)
        const need = m ? Number(m[1]) : 1
        const cnt = heroes.filter((x) => x !== u && (x.quality >= (o.mythQ || 5))).length
        active = cnt >= need
      } else {
        active = ft.heroes.every((n) => deployedNames.has(nameBase(n)))
      }
      if (!active) return
      const v = parseEffect(ft.effect)
      u.fpd += v.fp; u.ipd += v.ip; u.fa += v.fa; u.ia += v.ia
    })
  })

  // 神兽继承：同排英雄（羁绊后、阵营前）
  units.forEach((u) => {
    if (!u.pet) return
    const rowHeroes = units.filter((x) => x.hero && x.row === u.row)
    let sf = 0, si = 0
    rowHeroes.forEach((x) => {
      const fMax = x.force[1] + x.fa + x.force[1] * x.fpd / 1000
      const iMax = x.iq[1] + x.ia + x.iq[1] * x.ipd / 1000
      sf += fMax; si += iMax
    })
    u.inhF = sf * (u.inherit ? u.inherit.force : 0) / (o.inheritPermil ? 1000 : 1)
    u.inhI = si * (u.inherit ? u.inherit.iq : 0) / (o.inheritPermil ? 1000 : 1)
  })

  // 阵营加成作用于全体（含神兽），乘在（基础+羁绊）上
  units.forEach((u) => {
    u.attack = [0, 0]; u.iqv = [0, 0]
    for (let k = 0; k < 2; k++) {
      let f = u.force[k], i = u.iq[k]
      if (u.hero) { f += u.fa + f * u.fpd / 1000; i += u.ia + i * u.ipd / 1000 }
      else { f += u.inhF; i += u.inhI }
      u.attack[k] = f * (1 + era.f / 1000)
      u.iqv[k] = i * (1 + era.iq / 1000)
    }
  })

  const sum = (arr, fn) => Math.round(arr.reduce((s, u) => s + fn(u), 0))
  const frontNum = sum(units.filter((u) => u.row === 'front'), (u) => 1.5 * u.attack[1])
  const middleNum = sum(units.filter((u) => u.row === 'mid'), (u) => u.attack[1] + u.iqv[1])
  const backNum = sum(units.filter((u) => u.row === 'back'), (u) => u.iqv[1])
  return { frontNum, middleNum, backNum, total: frontNum + middleNum + backNum, era, units }
}

const ATK = 'Z3f__IPKOEAgAQOWOQPuASAaACPUOSPOAEAIOHvLqAtxCN'
const DEF = 'Z3_f_CGyPuAUMCGwGmO4GkOUEGOaAIQAOSGuEJvLpAWtJt'
const ASL = 'Z3__3MDiACPMDmAmQCDoMCOYDuAqDwAsNMDkOXvLrApZW2'

function show(label, code, target, opt) {
  const r = calc(code, opt || {})
  console.log('\n== ' + label + (opt && opt.tag ? '（' + opt.tag + '）' : '') + ' ==')
  console.log('  阵营加成: ' + (r.era.detail.join(' | ') || '无（无≥3人组）') + '  → 全体 +' + (r.era.f / 10) + '%')
  console.log('  前×1.5/中/后: ' + r.frontNum + ' / ' + r.middleNum + ' / ' + r.backNum + '  总 ' + r.total)
  if (target) {
    const rev = opt && opt.rev
    const t = rev ? [target[2], target[1], target[0]] : target
    console.log('  实战 gems' + (rev ? '（倒序 前/中/后）' : '') + ': ' + t[0] + ' / ' + t[1] + ' / ' + t[2] + '  总 ' + (t[0] + t[1] + t[2]) +
      '   总偏差 ' + ((r.total * 2 / (t[0] + t[1] + t[2]) - 1) * 100).toFixed(1) + '%' +
      '   行偏差 ' + [r.frontNum * 2 / t[0], r.middleNum * 2 / t[1], r.backNum * 2 / t[2]].map((x) => ((x - 1) * 100).toFixed(0) + '%').join('/'))
  }
  return r
}

const OPT = { inheritPermil: false, tag: '继承按百分比' }
show('进攻方（乾元主战）', ATK, [1426, 2962, 5297], { ...OPT, rev: true })
show('防守方（朝歌）', DEF, [13743, 1173, 467], { ...OPT, rev: true })
const rAsl = show('助战方', ASL, null, OPT)
console.log('  助战×20% = ' + Math.round(rAsl.total * 2 * 0.2) + '（实战 2029 → 总 10145）')

console.log('\n---- 对照：继承按千分比 ----')
show('进攻方', ATK, [1426, 2962, 5297], { inheritPermil: true, rev: true })
show('防守方', DEF, [13743, 1173, 467], { inheritPermil: true, rev: true })
