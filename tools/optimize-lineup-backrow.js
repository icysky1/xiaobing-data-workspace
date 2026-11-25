// 鸣蛇（冥蛇）90级最强阵容搜索 v2
// 约束：18 格 = 17 名不同英雄（按基础名去重，飞仙·/黄金甲·/戏魂·视为同名）+ 鸣蛇固定中排第6格
// 目标：最大化单边总战力（模拟器真引擎：1级区间 + 羁绊 + 阵营效果/技能 + 英雄技能 + 鸣蛇90级技能）
// 方法：贪心/随机多重启 + 最陡上升局部搜索，最后用全量候选做一次收尾扫描
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }

const LINEUP_PATH = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
let src = fs.readFileSync(LINEUP_PATH, 'utf8')
const PATCH_FROM = '!x.ul || x.ul === 1'
const PATCH_TO = "(!x.ul || (x.ul === 1 && ['涸泽之咒','旱气鞭笞'].indexOf(x.n) < 0) || (x.n === '涸泽之咒' && x.ul === 85) || (x.n === '旱气鞭笞' && x.ul === 90) || (x.n === '龟裂禁域' && x.ul === 50))"
if (src.indexOf(PATCH_FROM) < 0) { console.error('未找到神兽技能口径补丁点'); process.exit(1) }
src = src.replace(PATCH_FROM, PATCH_TO)
const code = src + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('lineup-under-test')
m.filename = LINEUP_PATH
m.paths = Module._nodeModulePaths(path.dirname(LINEUP_PATH))
m._compile(code, LINEUP_PATH)
const L = m.exports

// ---------- 候选池 ----------
const EVOLVE_PREFIX = ['飞仙·', '戏魂·', '黄金甲·']
function baseName(n) {
  for (const p of EVOLVE_PREFIX) if (n.indexOf(p) === 0) return n.slice(p.length)
  return n
}
const heroesAll = Object.values(L.heroesMap)
  .filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1)
// 同基础名只保留品质最高的一档（进化形态算同一英雄，不能同时上阵）
const bestOf = {}
heroesAll.forEach((h) => {
  const bn = baseName(h.name)
  if (!bestOf[bn] || h.quality > bestOf[bn].quality) bestOf[bn] = h
})
const heroes = Object.values(bestOf)
console.log(`可上阵英雄（按基础名去重后）: ${heroes.length}`)
const petSnake = L.petsData.find((p) => p.name === '鸣蛇')

function rawVal(h, row) {
  const f = (h.force[0] + h.force[1]) / 2
  const i = (h.iq[0] + h.iq[1]) / 2
  if (row === 'front') return f * 1.5
  if (row === 'mid') return f + i
  return i
}
const POOL_N = 200 // 局部搜索用池；收尾阶段用全量
const pools = {}
;['front', 'mid', 'back'].forEach((row) => {
  pools[row] = row === 'back' ? heroes.slice().sort((a, b) => ((b.iq[0]+b.iq[1]) - (a.iq[0]+a.iq[1]))).slice(0, 12) : heroes.slice().sort((a, b) => rawVal(b, row) - rawVal(a, row)).slice(0, POOL_N)
})

// ---------- 状态与评估 ----------
const ROW_IDX = { back: 0, mid: 6, front: 12 }
const PET_SLOT = 11

function buildSlots(state) {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    state[row].forEach((h, i) => {
      const idx = ROW_IDX[row] + i
      if (idx === PET_SLOT) return
      slots[idx].unit = L.heroCard(h)
    })
  })
  slots[PET_SLOT].unit = L.petCard(petSnake)
  return slots
}
const evalCount = { n: 0 }
function evaluate(state) {
  evalCount.n++
  const model = { ours: { slots: buildSlots(state) }, enemy: { slots: L.makeSlots() } }
  const r = L.calcAll(model)
  const t = r.ours.total
  return { score: (t.min + t.max) / 2, min: t.min, max: t.max, res: r }
}
function usedSet(state, except) {
  const s = new Set()
  ;['front', 'mid', 'back'].forEach((row) => state[row].forEach((h) => { if (h !== except) s.add(baseName(h.name)) }))
  return s
}

// ---------- 初始解 ----------
function greedyStart() {
  const s = { front: [], mid: [], back: [] }
  const used = new Set()
  ;['front', 'mid', 'back'].forEach((row) => {
    const need = row === 'mid' ? 5 : 6
    for (const h of pools[row]) {
      if (s[row].length >= need) break
      const bn = baseName(h.name)
      if (used.has(bn)) continue
      used.add(bn)
      s[row].push(h)
    }
  })
  return s
}
function randomStart() {
  const s = { front: [], mid: [], back: [] }
  const used = new Set()
  ;['front', 'mid', 'back'].forEach((row) => {
    const need = row === 'mid' ? 5 : 6
    const cand = pools[row].slice(0, 60)
    let guard = 0
    while (s[row].length < need && guard++ < 500) {
      const c = cand[Math.floor(Math.random() * cand.length)]
      const bn = baseName(c.name)
      if (used.has(bn)) continue
      used.add(bn)
      s[row].push(c)
    }
  })
  return s
}

// ---------- 最陡上升局部搜索 ----------
function localSearch(state, label, fullFinal) {
  const cur = JSON.parse(JSON.stringify(state))
  let best = evaluate(cur).score
  let improved = true
  let sweep = 0
  while (improved && sweep < 10) {
    improved = false
    sweep++
    const t0 = Date.now()
    ;['front', 'mid', 'back'].forEach((row) => {
      const need = row === 'mid' ? 5 : 6
      for (let si = 0; si < need; si++) {
        const oldHero = cur[row][si]
        const used = usedSet(cur, oldHero)
        const pool = fullFinal ? heroes.slice().sort((a, b) => rawVal(b, row) - rawVal(a, row)) : pools[row]
        let bestSwap = null
        for (const cand of pool) {
          if (cand === oldHero || used.has(baseName(cand.name))) continue
          cur[row][si] = cand
          const v = evaluate(cur)
          if (v.score > best + 0.01 && (!bestSwap || v.score > bestSwap.score)) bestSwap = { hero: cand, score: v.score }
        }
        if (bestSwap) { cur[row][si] = bestSwap.hero; best = bestSwap.score; improved = true }
        else cur[row][si] = oldHero
      }
    })
    if (!fullFinal) console.log(`  [${label}] 第${sweep}轮，评估 ${evalCount.n} 次，最优分 ${best.toFixed(0)}，${((Date.now() - t0) / 1000).toFixed(1)}s`)
  }
  return { state: cur, score: best }
}

// ---------- 多重启 ----------
const runs = [['贪心(纯数值)', greedyStart()]]

const results = []
runs.forEach(([label, st]) => {
  console.log(`\n=== 起点：${label} ===`)
  const r = localSearch(st, label, false)
  console.log(`${label} 阶段1收敛：${r.score.toFixed(0)}`)
  const r2 = localSearch(r.state, label + '+全量', true) // 全量候选收尾扫描
  const fin = evaluate(r2.state)
  console.log(`${label} 最终：${fin.min} ~ ${fin.max}`)
  results.push({ label, state: r2.state, ...fin })
})
results.sort((a, b) => b.score - a.score)
const best = results[0]

// ---------- 报告 ----------
console.log('\n================ 最强阵容（鸣蛇 90 级，英雄不重复） ================')
const st = best.state
;['front', 'mid', 'back'].forEach((row) => {
  const cn = { front: '前排(战力=武×1.5)', mid: '中排(战力=武+智)', back: '后排(战力=智)' }[row]
  console.log(`${cn}: ${st[row].map((h) => h.name).join('、')}${row === 'mid' ? ' + 🐲鸣蛇(中排第6格)' : ''}`)
})
console.log(`总战力（已含主战/防守+100%口径）：${best.min} ~ ${best.max}`)
const d = best.res.ours.detail
const eraCnt = {}
;['front', 'mid', 'back'].forEach((row) => st[row].forEach((h) => { eraCnt[h.era] = (eraCnt[h.era] || 0) + 1 }))
console.log('阵营分布:', JSON.stringify(eraCnt))
console.log('阵营效果:', JSON.stringify(d.eraBuffs))
console.log('阵营技能:', JSON.stringify(d.eraSkills))
console.log('羁绊(' + (d.fetters || []).length + '):')
;(d.fetters || []).forEach((x) => console.log('  -', x.name + '（' + x.members + '）' + x.effect))
console.log('神兽技能:', JSON.stringify(d.petLabels))
console.log('技能数:', (d.skillLabels || []).length, '| 未量化:', JSON.stringify(d.unq))
console.log('\n评估总次数:', evalCount.n)
console.log('各起点最终对比:', results.map((r) => `${r.label}=${r.max}`).join(' / '))
