// 众生平等对决（严格 16 英雄 + 1 神兽 = 17 单位，空 1 格）：我方(鸣蛇) vs 敌方(九尾狐)
// 客户端规则：upHeroFull「最多上阵16名武将」；18 格 = 6前+6中+6后，神兽占 1 格 → 必空 1 格
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }

const LINEUP_PATH = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const src = fs.readFileSync(LINEUP_PATH, 'utf8')
const code = src + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('lineup-equal16')
m.filename = LINEUP_PATH
m.paths = Module._nodeModulePaths(path.dirname(LINEUP_PATH))
m._compile(code, LINEUP_PATH)
const L = m.exports

const heroesAll = Object.values(L.heroesMap)
const byName = {}
heroesAll.forEach((h) => { byName[h.name] = h })
function resolve(name) {
  if (byName[name]) return byName[name]
  const cands = heroesAll.filter((h) => h.name.indexOf(name) >= 0)
  if (cands.length) return cands.sort((a, b) => b.quality - a.quality)[0]
  return null
}
const petSnake = L.petsData.find((p) => p.name === '鸣蛇')

// 敌方（用户确认的 18 位，13 号位空）：16 英雄 + 九尾狐
// 客户端铁律：frontPostion=[1,4,7,10,13,16] middlePostion=[2,5,8,11,14,17] backPostion=[3,6,9,12,15,18]
// 号位按列编号（每列 前→中→后），按号位还原到三排：
// front: 1九天玄女 4后羿 7黄金甲·雨师妾 10刘邦 13空 16夏启
// mid:   2女艾 5黄金甲·精卫 8伏羲 11李白 14张良 17大禹
// back:  3九尾狐 6女娲 9黄金甲·嫦娥 12洛嫔 15飞仙·涂山女 18飞仙·赵飞燕
const ENEMY = {
  front: ['九天玄女', '后羿', '黄金甲·雨师妾', '刘邦', null, '夏启'],
  mid: ['女艾', '黄金甲·精卫', '伏羲', '李白', '张良', '大禹'],
  back: ['PET:九尾狐', '女娲', '黄金甲·嫦娥', '洛嫔', '飞仙·涂山女', '飞仙·赵飞燕'],
}
const ROW_IDX = { back: 0, mid: 6, front: 12 }
function buildEnemy() {
  const slots = L.makeSlots()
  Object.keys(ENEMY).forEach((row) => {
    ENEMY[row].forEach((name, i) => {
      if (!name) return
      const idx = ROW_IDX[row] + i
      if (name.indexOf('PET:') === 0) {
        const p = L.petsData.find((x) => x.name === name.slice(4))
        if (p) slots[idx].unit = L.petCard(p)
        return
      }
      const h = resolve(name)
      if (!h) { console.log('[敌方缺英雄]', name); return }
      slots[idx].unit = L.heroCard(h)
    })
  })
  return slots
}
const enemySlots = buildEnemy()

// 候选池
const EVOLVE_PREFIX = ['飞仙·', '戏魂·', '黄金甲·']
function baseName(n) {
  for (const p of EVOLVE_PREFIX) if (n.indexOf(p) === 0) return n.slice(p.length)
  return n
}
const BASE_ONLY = process.env.BASE_ONLY === '1'
const bestOf = {}
heroesAll
  .filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1 && (!BASE_ONLY || !/^(飞仙|戏魂|黄金甲)·/.test(h.name)))
  .forEach((h) => {
    const bn = baseName(h.name)
    if (!bestOf[bn] || h.quality > bestOf[bn].quality) bestOf[bn] = h
  })
const heroes = Object.values(bestOf)
function rawVal(h, row) {
  const f = (h.force[0] + h.force[1]) / 2
  const i = (h.iq[0] + h.iq[1]) / 2
  if (row === 'front') return f * 1.5
  if (row === 'mid') return f + i
  return i
}
const POOL_N = 150
const pools = {}
;['front', 'mid', 'back'].forEach((row) => {
  pools[row] = heroes.slice().sort((a, b) => rawVal(b, row) - rawVal(a, row)).slice(0, POOL_N)
})

// 中排第 6 格（idx 11）固定给神兽 → 中排英雄格只有 5 个
const PET_SLOT = 11
const ROW_CELLS = { front: 6, mid: 5, back: 6 }
const CELLS = []
;['front', 'mid', 'back'].forEach((row) => {
  for (let i = 0; i < ROW_CELLS[row]; i++) CELLS.push([row, i])
})
const MAX_HEROES = 16 // 客户端硬限制

function countHeroes(state) {
  let n = 0
  ;['front', 'mid', 'back'].forEach((r) => state[r].forEach((h) => { if (h) n++ }))
  return n
}
function buildSlots(state) {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    state[row].forEach((h, i) => {
      if (!h) return
      slots[ROW_IDX[row] + i].unit = L.heroCard(h)
    })
  })
  slots[PET_SLOT].unit = L.petCard(petSnake)
  return slots
}
const evalCount = { n: 0 }
function evaluate(state) {
  evalCount.n++
  if (countHeroes(state) > MAX_HEROES) return { score: -1e9, ours: { min: 0, max: 0 }, enemy: { min: 0, max: 0 }, res: null }
  const r = L.calcAll({ ours: { slots: buildSlots(state) }, enemy: { slots: enemySlots } })
  const o = r.ours.total, e = r.enemy.total
  return { score: (o.min + o.max) / 2 - (e.min + e.max) / 2, ours: o, enemy: e, res: r }
}
function usedSet(state, except) {
  const s = new Set()
  ;['front', 'mid', 'back'].forEach((row) => state[row].forEach((h) => { if (h && h !== except) s.add(baseName(h.name)) }))
  return s
}
function emptyState() { return { front: new Array(6).fill(null), mid: new Array(5).fill(null), back: new Array(6).fill(null) } }

function greedyStart(shortRow) {
  const s = emptyState()
  const used = new Set()
  const quota = { front: 6, mid: 5, back: 6 }
  quota[shortRow] = 5 // 这一排少放 1 人（空 1 格）
  ;['front', 'mid', 'back'].forEach((row) => {
    for (const h of pools[row]) {
      const filled = s[row].filter(Boolean).length
      if (filled >= quota[row]) break
      const bn = baseName(h.name)
      if (used.has(bn)) continue
      used.add(bn)
      s[row][s[row].indexOf(null)] = h
    }
  })
  return s
}
function randomStart(shortRow) {
  const s = emptyState()
  const used = new Set()
  const quota = { front: 6, mid: 5, back: 6 }
  quota[shortRow] = 5
  ;['front', 'mid', 'back'].forEach((row) => {
    const cand = pools[row].slice(0, 80)
    let guard = 0
    while (s[row].filter(Boolean).length < quota[row] && guard++ < 800) {
      const c = cand[Math.floor(Math.random() * cand.length)]
      const bn = baseName(c.name)
      if (used.has(bn)) continue
      used.add(bn)
      s[row][s[row].indexOf(null)] = c
    }
  })
  return s
}

function anneal(state, iters) {
  let cur = JSON.parse(JSON.stringify(state))
  let curScore = evaluate(cur).score
  let bestState = JSON.parse(JSON.stringify(cur))
  let bestScore = curScore
  const T0 = 60
  for (let it = 0; it < iters; it++) {
    const T = T0 * (1 - it / iters) + 0.5
    const cand = JSON.parse(JSON.stringify(cur))
    const r = Math.random()
    if (r < 0.55) {
      // 换人：随机一个已占格替换为未使用英雄
      const occ = CELLS.filter(([row, i]) => cand[row][i])
      const [row, i] = occ[Math.floor(Math.random() * occ.length)]
      const used = usedSet(cand, cand[row][i])
      for (let g = 0; g < 25; g++) {
        const c = pools[row][Math.floor(Math.random() * pools[row].length)]
        if (!used.has(baseName(c.name))) { cand[row][i] = c; break }
      }
    } else if (r < 0.85) {
      // 交换两格（可含空格）：移动空位 / 跨排换位
      const a = CELLS[Math.floor(Math.random() * CELLS.length)]
      const b = CELLS[Math.floor(Math.random() * CELLS.length)]
      const ha = cand[a[0]][a[1]], hb = cand[b[0]][b[1]]
      if ((ha && hb && baseName(ha.name) === baseName(hb.name))) continue
      cand[a[0]][a[1]] = hb; cand[b[0]][b[1]] = ha
    } else {
      // 补空 + 摘掉另一人（保持 16 人）
      const empt = CELLS.filter(([row, i]) => !cand[row][i])
      const occ = CELLS.filter(([row, i]) => cand[row][i])
      if (!empt.length || !occ.length) continue
      const [er, ei] = empt[Math.floor(Math.random() * empt.length)]
      const [dr, di] = occ[Math.floor(Math.random() * occ.length)]
      const used = usedSet(cand, cand[dr][di])
      for (let g = 0; g < 25; g++) {
        const c = pools[er][Math.floor(Math.random() * pools[er].length)]
        if (!used.has(baseName(c.name))) { cand[er][ei] = c; cand[dr][di] = null; break }
      }
    }
    if (countHeroes(cand) > MAX_HEROES) continue
    const v = evaluate(cand)
    if (v.score > curScore || Math.random() < Math.exp((v.score - curScore) / T)) {
      cur = cand; curScore = v.score
      if (v.score > bestScore) { bestScore = v.score; bestState = JSON.parse(JSON.stringify(cand)) }
    }
  }
  return { state: bestState, score: bestScore }
}

function localSearch(state, maxSweep) {
  const cur = JSON.parse(JSON.stringify(state))
  let best = evaluate(cur).score
  let improved = true, sweep = 0
  while (improved && sweep < maxSweep) {
    improved = false; sweep++
    for (const [row, i] of CELLS) {
      const oldHero = cur[row][i]
      const used = usedSet(cur, oldHero)
      const pool = pools[row].slice(0, 45)
      let bestSwap = null
      for (const c of pool) {
        if (c === oldHero || used.has(baseName(c.name))) continue
        cur[row][i] = c
        const v = evaluate(cur)
        if (v.score > best + 0.01 && (!bestSwap || v.score > bestSwap.score)) bestSwap = { hero: c, score: v.score }
      }
      if (bestSwap) { cur[row][i] = bestSwap.hero; best = bestSwap.score; improved = true } else cur[row][i] = oldHero
    }
    // 空位搬家：逐一尝试把空位移到每个格
    const empt = CELLS.filter(([row, i]) => !cur[row][i])
    if (empt.length) {
      const [er, ei] = empt[0]
      let bestMove = null
      for (const [row, i] of CELLS) {
        if (!cur[row][i]) continue
        const h = cur[row][i]
        cur[er][ei] = h; cur[row][i] = null
        const v = evaluate(cur)
        cur[row][i] = h; cur[er][ei] = null
        if (v.score > best + 0.01 && (!bestMove || v.score > bestMove.score)) bestMove = { row, i, score: v.score }
      }
      if (bestMove) {
        const h = cur[bestMove.row][bestMove.i]
        cur[er][ei] = h; cur[bestMove.row][bestMove.i] = null
        best = bestMove.score; improved = true
      }
    }
  }
  return { state: cur, score: best }
}

// ---------- 基准（合法 16 人版） ----------
function stateFromCfg(cfg, shortRow) {
  const s = emptyState()
  const used = new Set()
  ;['front', 'mid', 'back'].forEach((row) => {
    (cfg[row] || []).forEach((n) => {
      const h = resolve(n)
      if (!h) return
      const bn = baseName(h.name)
      if (used.has(bn)) return
      if (s[row].filter(Boolean).length >= ROW_CELLS[row]) return
      if (countHeroes(s) >= MAX_HEROES) return
      used.add(bn)
      s[row][s[row].indexOf(null)] = h
    })
  })
  return s
}
const BASE_CFG = {
  '旧鸣蛇v3(17人，超编1人)': {
    back: ['飞仙·黄帝', '妈祖', '伏羲', '飞仙·李白', '飞仙·女娲', '月老'],
    mid: ['黄金甲·王贲', '戏魂·蒙恬', '戏魂·岳飞', '黄金甲·织田信长', '戏魂·昊天大帝'],
    front: ['飞仙·岳云', '杨戬', '孙悟空', '戏魂·亚瑟王', '飞仙·哪吒', '阿瑞斯'],
  },
}
console.log('=========== 基准：旧方案合法化（16 英雄） ===========')
Object.entries(BASE_CFG).forEach(([k, cfg]) => {
  const st = stateFromCfg(cfg)
  const v = evaluate(st)
  console.log(`${k} → 实际 ${countHeroes(st)} 英雄 | 我方 ${Math.round(v.ours.min)}~${Math.round(v.ours.max)} | 敌方 ${Math.round(v.enemy.min)}~${Math.round(v.enemy.max)} | 净胜差 ${v.score.toFixed(0)}`)
})

// ---------- 搜索 ----------
const runs = []
runs.push(['贪心-前排少1', greedyStart('front')])
runs.push(['贪心-后排少1', greedyStart('back')])
for (let i = 1; i <= 2; i++) runs.push([`随机${i}`, randomStart(i % 2 ? 'front' : 'back')])
const results = []
runs.forEach(([label, st]) => {
  const t0 = Date.now()
  const a = anneal(st, 2600)
  const ls = localSearch(a.state, 3)
  const fin = evaluate(ls.state)
  console.log(`${label}: 退火 ${a.score.toFixed(0)} → 局部 ${ls.score.toFixed(0)}，净胜差 ${fin.score.toFixed(0)}，${countHeroes(ls.state)} 英雄，评估${evalCount.n}次，${((Date.now() - t0) / 1000).toFixed(0)}s`)
  results.push({ label, state: ls.state, ...fin })
})
results.sort((a, b) => b.score - a.score)
const best = results[0]
const st = best.state

console.log(`\n=========== 最强合法阵容（16 英雄 + 鸣蛇${BASE_ONLY ? '，仅基础卡' : ''}） ===========`)
const GAME_NO = { front: [1, 4, 7, 10, 13, 16], mid: [2, 5, 8, 11, 14, 17], back: [3, 6, 9, 12, 15, 18] }
;['front', 'mid', 'back'].forEach((row) => {
  const names = st[row].map((h, i) => (h ? `${GAME_NO[row][i]}号位 ${h.name}` : `${GAME_NO[row][i]}号位 【空】`))
  console.log(`${{ front: '前排', mid: '中排', back: '后排' }[row]}: ${names.join(' | ')}`)
})
console.log(`${GAME_NO.mid[5]}号位 鸣蛇（神兽）`)
console.log('英雄数:', countHeroes(st), '/ 16；总单位:', countHeroes(st) + 1)
console.log(`我方：${Math.round(best.ours.min)}~${Math.round(best.ours.max)}`)
console.log(`敌方：${Math.round(best.enemy.min)}~${Math.round(best.enemy.max)}`)
console.log(`净胜差：${best.score.toFixed(0)} ${best.score > 0 ? '✅ 胜' : '❌ 负'}`)
const d = best.res.ours.detail
console.log('我方阵营:', JSON.stringify(d.eraBuffs))
console.log('羁绊:' + (d.fetters || []).length + ' 条')
console.log('各起点:', results.map((r) => `${r.label}=${r.score.toFixed(0)}`).join(' / '))
console.log('评估总次数:', evalCount.n)
