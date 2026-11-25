// 精卫核心阵容优化器
// 目标：对「鸣蛇均衡版」的净胜差最大化（引擎真实双方结算，精卫的填海削减敌方中排）
// 约束：阵容必须包含精卫（位置由优化器决定），18格=17英雄不重复+鸣蛇
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
const byName = {}
heroes.forEach((h) => (byName[h.name] = h))
const petSnake = L.petsData.find((p) => p.name === '鸣蛇')
const jingwei = byName['黄金甲·精卫'] || byName['精卫']
if (!jingwei) { console.error('找不到精卫'); process.exit(1) }

// ---------- 对手：鸣蛇均衡版（固定） ----------
const FOE = {
  front: ['孙悟空', '飞仙·哪吒', '蚩尤', '戏魂·李存孝', '黄金甲·盘古', '黄金甲·王贲'],
  mid: ['飞仙·黄帝', '飞仙·女娲', '戏魂·蒙恬', '戏魂·昊天大帝', '妈祖'],
  back: ['戏魂·姜子牙', '飞仙·褒姒', '伏羲', '月老', '飞仙·李白', '飞仙·花蕊夫人'],
}
const ROW_IDX = { back: 0, mid: 6, front: 12 }
const PET_SLOT = 11
function buildFromNames(cfg, pet) {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    cfg[row].forEach((n, i) => {
      const idx = ROW_IDX[row] + i
      if (idx === PET_SLOT && pet) return
      const h = byName[n]
      if (h) slots[idx].unit = L.heroCard(h)
    })
  })
  if (pet) slots[PET_SLOT].unit = L.petCard(pet)
  return slots
}
const foeSlots = buildFromNames(FOE, petSnake)

// ---------- 候选池 ----------
function rawVal(h, row) {
  const f = (h.force[0] + h.force[1]) / 2
  const i = (h.iq[0] + h.iq[1]) / 2
  if (row === 'front') return f * 1.5
  if (row === 'mid') return f + i
  return i
}
const POOL_N = 220
const pools = {}
;['front', 'mid', 'back'].forEach((row) => {
  pools[row] = heroes.slice().sort((a, b) => rawVal(b, row) - rawVal(a, row)).slice(0, POOL_N)
})

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
  const r = L.calcAll({ ours: { slots: buildSlots(state) }, enemy: { slots: foeSlots } })
  const ours = (r.ours.total.min + r.ours.total.max) / 2
  const foe = (r.enemy.total.min + r.enemy.total.max) / 2
  return { score: ours - foe, ours: r.ours.total, foe: r.enemy.total, res: r }
}
function usedSet(state, except) {
  const s = new Set()
  ;['front', 'mid', 'back'].forEach((row) => state[row].forEach((h) => { if (h !== except) s.add(baseName(h.name)) }))
  return s
}

// ---------- 初始解：先按数值贪心，再强制塞入精卫 ----------
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
  // 把精卫换到中排最后一位（替换战力最低者）
  const midLowest = s.mid.reduce((a, b) => (rawVal(a, 'mid') <= rawVal(b, 'mid') ? a : b))
  s.mid[s.mid.indexOf(midLowest)] = jingwei
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
      if (used.has(bn) || (c === jingwei && row !== 'mid')) continue
      used.add(bn)
      s[row].push(c)
    }
  })
  s.mid[s.mid.length - 1] = jingwei
  return s
}

function localSearch(state, fullFinal) {
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
        if (oldHero === jingwei) continue // 精卫锁定
        const used = usedSet(cur, oldHero)
        const pool = fullFinal ? heroes.slice().sort((a, b) => rawVal(b, row) - rawVal(a, row)) : pools[row]
        let bestSwap = null
        for (const c of pool) {
          if (c === oldHero || c === jingwei || used.has(baseName(c.name))) continue
          cur[row][si] = c
          const v = evaluate(cur)
          if (v.score > best + 0.01 && (!bestSwap || v.score > bestSwap.score)) bestSwap = { hero: c, score: v.score }
        }
        if (bestSwap) { cur[row][si] = bestSwap.hero; best = bestSwap.score; improved = true }
        else cur[row][si] = oldHero
      }
    })
    // 额外：尝试把精卫与其他排的最弱者互换（换位而非复制）
    const saved = JSON.parse(JSON.stringify(cur))
    ;['front', 'mid', 'back'].forEach((row) => {
      if (cur[row].includes(jingwei)) return
      const fromRow = cur.mid.includes(jingwei) ? 'mid' : 'front'
      const fromIdx = saved[fromRow].indexOf(jingwei)
      if (fromIdx < 0) return
      const trial = JSON.parse(JSON.stringify(saved))
      const need = row === 'mid' ? 5 : 6
      let weakest = 0
      for (let i = 1; i < need; i++) if (rawVal(trial[row][i], row) < rawVal(trial[row][weakest], row)) weakest = i
      if (trial[row][weakest] === jingwei) return
      // 互换：精卫去目标排，目标排最弱者去精卫原来的位置
      const swapped = trial[row][weakest]
      trial[row][weakest] = jingwei
      trial[fromRow][fromIdx] = swapped
      const v = evaluate(trial)
      if (v.score > best + 0.01) { best = v.score; Object.assign(cur, JSON.parse(JSON.stringify(trial))); improved = true }
    })
  }
  return { state: cur, score: best }
}

const runs = [['贪心', greedyStart()]]
for (let i = 1; i <= 3; i++) runs.push([`随机${i}`, randomStart()])
const results = []
runs.forEach(([label, st]) => {
  const t0 = Date.now()
  const r = localSearch(st, false)
  const r2 = localSearch(r.state, true)
  const fin = evaluate(r2.state)
  console.log(`${label}: ${r.score.toFixed(0)} → 最终 ${fin.score.toFixed(0)}（我 ${fin.ours.min}~${fin.ours.max} / 敌 ${fin.foe.min}~${fin.foe.max}），评估${evalCount.n}，${((Date.now() - t0) / 1000).toFixed(0)}s`)
  results.push({ label, state: r2.state, ...fin })
})
results.sort((a, b) => b.score - a.score)
const best = results[0]

console.log('\n================ 精卫核心阵容 ================')
const st = best.state
;['front', 'mid', 'back'].forEach((row) => {
  const cn = { front: '前排(武×1.5)', mid: '中排(武+智)', back: '后排(智)' }[row]
  console.log(`${cn}: ${st[row].map((h) => h.name).join('、')}${row === 'mid' ? ' + 🐲鸣蛇' : ''}`)
})
console.log(`我方：${best.ours.min}~${best.ours.max}   对方(鸣蛇均衡版)：${best.foe.min}~${best.foe.max}`)
const d = best.res.ours.detail
console.log('阵营效果:', JSON.stringify(d.eraBuffs))
console.log('阵营技能:', JSON.stringify(d.eraSkills))
console.log('羁绊(' + (d.fetters || []).length + '):')
;(d.fetters || []).forEach((x) => console.log('  -', x.name + '（' + x.members + '）' + x.effect))
const ed = best.res.enemy.detail
console.log('对敌方施加的削减:', JSON.stringify(ed.enemyDebuffs))
console.log('未量化:', JSON.stringify(d.unq))
console.log('\n评估总次数:', evalCount.n)
console.log('各起点对比:', results.map((r) => `${r.label}=${r.score.toFixed(0)}`).join(' / '))
