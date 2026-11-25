// 鸣蛇 90 级最强阵容搜索 v3：模拟退火 + 多重启 + 全量收尾
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }

const LINEUP_PATH = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
let src = fs.readFileSync(LINEUP_PATH, 'utf8')
const PATCH_FROM = '!x.ul || x.ul === 1'
const PATCH_TO = "(!x.ul || (x.ul === 1 && ['涸泽之咒','旱气鞭笞'].indexOf(x.n) < 0) || (x.n === '涸泽之咒' && x.ul === 85) || (x.n === '旱气鞭笞' && x.ul === 90) || (x.n === '龟裂禁域' && x.ul === 50))"
src = src.replace(PATCH_FROM, PATCH_TO)
const code = src + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('lineup-under-test')
m.filename = LINEUP_PATH
m.paths = Module._nodeModulePaths(path.dirname(LINEUP_PATH))
m._compile(code, LINEUP_PATH)
const L = m.exports

const EVOLVE_PREFIX = ['飞仙·', '戏魂·', '黄金甲·']
function baseName(n) {
  for (const p of EVOLVE_PREFIX) if (n.indexOf(p) === 0) return n.slice(p.length)
  return n
}
const heroesAll = Object.values(L.heroesMap)
  .filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1)
const bestOf = {}
heroesAll.forEach((h) => {
  const bn = baseName(h.name)
  if (!bestOf[bn] || h.quality > bestOf[bn].quality) bestOf[bn] = h
})
const heroes = Object.values(bestOf)
const petSnake = L.petsData.find((p) => p.name === '鸣蛇')

function rawVal(h, row) {
  const f = (h.force[0] + h.force[1]) / 2
  const i = (h.iq[0] + h.iq[1]) / 2
  if (row === 'front') return f * 1.5
  if (row === 'mid') return f + i
  return i
}
const POOL_N = 200
const pools = {}
;['front', 'mid', 'back'].forEach((row) => {
  pools[row] = heroes.slice().sort((a, b) => rawVal(b, row) - rawVal(a, row)).slice(0, POOL_N)
})

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
  const r = L.calcAll({ ours: { slots: buildSlots(state) }, enemy: { slots: L.makeSlots() } })
  const t = r.ours.total
  return { score: (t.min + t.max) / 2, min: t.min, max: t.max, res: r }
}
function usedSet(state, except) {
  const s = new Set()
  ;['front', 'mid', 'back'].forEach((row) => state[row].forEach((h) => { if (h !== except) s.add(baseName(h.name)) }))
  return s
}
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
    const cand = pools[row].slice(0, 80)
    let guard = 0
    while (s[row].length < need && guard++ < 600) {
      const c = cand[Math.floor(Math.random() * cand.length)]
      const bn = baseName(c.name)
      if (used.has(bn)) continue
      used.add(bn)
      s[row].push(c)
    }
  })
  return s
}
function allPositions(state) {
  const ps = []
  ;['front', 'mid', 'back'].forEach((row) => {
    const need = row === 'mid' ? 5 : 6
    for (let i = 0; i < need; i++) ps.push([row, i])
  })
  return ps
}
// 模拟退火：随机交换/移动/双交换
function anneal(state, iters) {
  let cur = JSON.parse(JSON.stringify(state))
  let curScore = evaluate(cur).score
  let bestState = JSON.parse(JSON.stringify(cur))
  let bestScore = curScore
  const T0 = 60
  for (let it = 0; it < iters; it++) {
    const T = T0 * (1 - it / iters) + 0.5
    const cand = JSON.parse(JSON.stringify(cur))
    const ps = allPositions(cand)
    const r = Math.random()
    if (r < 0.6) {
      // 单换
      const [row, i] = ps[Math.floor(Math.random() * ps.length)]
      const used = usedSet(cand, cand[row][i])
      const pool = pools[row]
      for (let g = 0; g < 20; g++) {
        const c = pool[Math.floor(Math.random() * pool.length)]
        if (c !== cand[row][i] && !used.has(baseName(c.name))) { cand[row][i] = c; break }
      }
    } else if (r < 0.85) {
      // 排间移动（换 row）
      const [row, i] = ps[Math.floor(Math.random() * ps.length)]
      const targetRow = ['front', 'mid', 'back'][Math.floor(Math.random() * 3)]
      if (targetRow !== row && cand[targetRow].length >= 1) {
        const used = usedSet(cand, cand[row][i])
        const pool = pools[targetRow]
        for (let g = 0; g < 20; g++) {
          const c = pool[Math.floor(Math.random() * pool.length)]
          if (!used.has(baseName(c.name))) {
            cand[row].splice(i, 1)
            const need = targetRow === 'mid' ? 5 : 6
            if (cand[targetRow].length >= need) cand[targetRow].pop()
            cand[targetRow].push(c)
            // 保持各排人数合法
            const needR = row === 'mid' ? 5 : 6
            if (cand[row].length < needR) {
              const poolR = pools[row].find((x) => !usedSet(cand, x).has(baseName(x.name)))
              if (poolR) cand[row].push(poolR)
            }
            break
          }
        }
      }
    } else {
      // 双换
      const p1 = ps[Math.floor(Math.random() * ps.length)]
      let p2 = ps[Math.floor(Math.random() * ps.length)]
      const u1 = usedSet(cand, cand[p1[0]][p1[1]])
      const pool2 = pools[p2[0]]
      for (let g = 0; g < 20; g++) {
        const c = pool2[Math.floor(Math.random() * pool2.length)]
        if (c !== cand[p2[0]][p2[1]] && !u1.has(baseName(c.name))) { cand[p2[0]][p2[1]] = c; break }
      }
      const u2 = usedSet(cand, cand[p1[0]][p1[1]])
      const pool1 = pools[p1[0]]
      for (let g = 0; g < 20; g++) {
        const c = pool1[Math.floor(Math.random() * pool1.length)]
        if (c !== cand[p1[0]][p1[1]] && !u2.has(baseName(c.name))) { cand[p1[0]][p1[1]] = c; break }
      }
    }
    // 合法性检查：各排人数
    let ok = true
    ;['front', 'mid', 'back'].forEach((row) => {
      const need = row === 'mid' ? 5 : 6
      if (cand[row].length !== need) ok = false
    })
    if (!ok) continue
    const v = evaluate(cand)
    if (v.score > curScore || Math.random() < Math.exp((v.score - curScore) / T)) {
      cur = cand
      curScore = v.score
      if (v.score > bestScore) { bestScore = v.score; bestState = JSON.parse(JSON.stringify(cand)) }
    }
  }
  return { state: bestState, score: bestScore }
}
function localSearch(state) {
  const cur = JSON.parse(JSON.stringify(state))
  let best = evaluate(cur).score
  let improved = true
  let sweep = 0
  while (improved && sweep < 8) {
    improved = false
    sweep++
    ;['front', 'mid', 'back'].forEach((row) => {
      const need = row === 'mid' ? 5 : 6
      for (let si = 0; si < need; si++) {
        const oldHero = cur[row][si]
        const used = usedSet(cur, oldHero)
        const pool = heroes.slice().sort((a, b) => rawVal(b, row) - rawVal(a, row))
        let bestSwap = null
        for (const c of pool) {
          if (c === oldHero || used.has(baseName(c.name))) continue
          cur[row][si] = c
          const v = evaluate(cur)
          if (v.score > best + 0.01 && (!bestSwap || v.score > bestSwap.score)) bestSwap = { hero: c, score: v.score }
        }
        if (bestSwap) { cur[row][si] = bestSwap.hero; best = bestSwap.score; improved = true }
        else cur[row][si] = oldHero
      }
    })
  }
  return { state: cur, score: best }
}

const runs = [['贪心', greedyStart()]]
for (let i = 1; i <= 5; i++) runs.push([`随机${i}`, randomStart()])
const results = []
runs.forEach(([label, st]) => {
  const t0 = Date.now()
  const a = anneal(st, 8000)
  const ls = localSearch(a.state)
  const fin = evaluate(ls.state)
  console.log(`${label}: 退火后 ${a.score.toFixed(0)} → 局部 ${ls.score.toFixed(0)}，最终 ${fin.min}~${fin.max}，评估${evalCount.n}次，${((Date.now() - t0) / 1000).toFixed(0)}s`)
  results.push({ label, state: ls.state, ...fin })
})
results.sort((a, b) => b.score - a.score)
const best = results[0]

console.log('\n================ 鸣蛇 v3 最强阵容 ================')
const st = best.state
;['front', 'mid', 'back'].forEach((row) => {
  const cn = { front: '前排(武×1.5)', mid: '中排(武+智)', back: '后排(智)' }[row]
  console.log(`${cn}: ${st[row].map((h) => h.name).join('、')}${row === 'mid' ? ' + 🐲鸣蛇' : ''}`)
})
console.log(`总战力：${best.min} ~ ${best.max}`)
const d = best.res.ours.detail
console.log('阵营效果:', JSON.stringify(d.eraBuffs))
console.log('阵营技能:', JSON.stringify(d.eraSkills))
console.log('羁绊(' + (d.fetters || []).length + '):')
;(d.fetters || []).forEach((x) => console.log('  -', x.name + '（' + x.members + '）' + x.effect))
console.log('未量化:', JSON.stringify(d.unq))
console.log('\n评估总次数:', evalCount.n)
console.log('各起点对比:', results.map((r) => `${r.label}=${r.max}`).join(' / '))
