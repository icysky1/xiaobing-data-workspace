// 军师技特化搜索：目标 = 总战力 + 军师技期望收益（后排智膨胀竞赛）
// 军师技收益估算：对手后排取参考值 REF_OPP_BACK，打到 LvX 后按参考敌方总战力折算削益
const fs = require('fs')
const path = require('path')
const Module = require('module')
global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }
const LINEUP_PATH = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
let src = fs.readFileSync(LINEUP_PATH, 'utf8')
src = src.replace('!x.ul || x.ul === 1', "(!x.ul || (x.ul === 1 && ['涸泽之咒','旱气鞭笞'].indexOf(x.n) < 0) || (x.n === '涸泽之咒' && x.ul === 85) || (x.n === '旱气鞭笞' && x.ul === 90) || (x.n === '龟裂禁域' && x.ul === 50))")
const code = src + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('lineup-under-test')
m.filename = LINEUP_PATH
m.paths = Module._nodeModulePaths(path.dirname(LINEUP_PATH))
m._compile(code, LINEUP_PATH)
const L = m.exports

// 军师技分档（与引擎一致）
const SCHEME = [
  { lv: 1, cond: [833, 1000], f: 4, i: 0 },
  { lv: 2, cond: [714, 833], f: 5, i: 0 },
  { lv: 3, cond: [526, 714], f: 6, i: 0 },
  { lv: 4, cond: [400, 526], f: 7, i: 7 },
  { lv: 5, cond: [333, 400], f: 10, i: 10 },
  { lv: 6, cond: [250, 333], f: 15, i: 15 },
  { lv: 7, cond: [200, 250], f: 20, i: 20 },
  { lv: 8, cond: [0, 200], f: 30, i: 30 },
]
// 参考对手：后排智 1500（典型水平），总战力 12000、前排 2800（用于折算削益）
const REF_OPP_BACK = 1500, REF_ENEMY_TOTAL = 12000, REF_ENEMY_FRONT = 2800
function schemeGain(ownBack) {
  if (!ownBack || ownBack <= REF_OPP_BACK) return { gain: 0, lv: 0 }
  const ratio = Math.max(1, Math.round((REF_OPP_BACK / ownBack) * 1000))
  const sc = SCHEME.find((s) => ratio >= s.cond[0] && ratio < s.cond[1]) || SCHEME[7]
  const gain = sc.i ? (sc.i / 100) * REF_ENEMY_TOTAL : (sc.f / 100) * REF_ENEMY_FRONT
  return { gain, lv: sc.lv, name: sc.name }
}

const EVOLVE_PREFIX = ['飞仙·', '戏魂·', '黄金甲·']
function baseName(n) {
  for (const p of EVOLVE_PREFIX) if (n.indexOf(p) === 0) return n.slice(p.length)
  return n
}
const heroes = Object.values(L.heroesMap).filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1)
const bestOf = {}
heroes.forEach((h) => {
  const bn = baseName(h.name)
  if (!bestOf[bn] || h.quality > bestOf[bn].quality) bestOf[bn] = h
})
const pool = Object.values(bestOf)
const petSnake = L.petsData.find((p) => p.name === '鸣蛇')

function rawVal(h, row) {
  const f = (h.force[0] + h.force[1]) / 2, i = (h.iq[0] + h.iq[1]) / 2
  return row === 'front' ? f * 1.5 : row === 'mid' ? f + i : i
}
const iqVal = (h) => (h.iq[0] + h.iq[1]) / 2
const pools = {}
pools.back = pool.slice().sort((a, b) => iqVal(b) - iqVal(a)).slice(0, 150)
;['front', 'mid'].forEach((row) => { pools[row] = pool.slice().sort((a, b) => rawVal(b, row) - rawVal(a, row)).slice(0, 150) })

const ROW_IDX = { back: 0, mid: 6, front: 12 }
const PET_SLOT = 11
function buildSlots(state) {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => state[row].forEach((h, i) => {
    const idx = ROW_IDX[row] + i
    if (idx === PET_SLOT) return
    slots[idx].unit = L.heroCard(h)
  }))
  slots[PET_SLOT].unit = L.petCard(petSnake)
  return slots
}
function evaluate(state) {
  const model = { ours: { slots: buildSlots(state) }, enemy: { slots: L.makeSlots() } }
  const r = L.calcAll(model)
  const t = r.ours.total
  const totalMid = (t.min + t.max) / 2
  const backMid = (r.ours.rows.back.min + r.ours.rows.back.max) / 2
  const sg = schemeGain(backMid)
  return { score: totalMid + sg.gain, totalMid, backMid, sg, min: t.min, max: t.max, res: r }
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
      used.add(bn); s[row].push(h)
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
      used.add(bn); s[row].push(c)
    }
  })
  return s
}
function localSearch(state, label) {
  const cur = JSON.parse(JSON.stringify(state))
  let best = evaluate(cur).score
  let improved = true, sweep = 0
  while (improved && sweep < 10) {
    improved = false; sweep++
    ;['front', 'mid', 'back'].forEach((row) => {
      const need = row === 'mid' ? 5 : 6
      for (let si = 0; si < need; si++) {
        const oldHero = cur[row][si]
        const used = usedSet(cur, oldHero)
        let bestSwap = null
        for (const cand of pools[row]) {
          if (cand === oldHero || used.has(baseName(cand.name))) continue
          cur[row][si] = cand
          const v = evaluate(cur)
          if (v.score > best + 0.01 && (!bestSwap || v.score > bestSwap.score)) bestSwap = { hero: cand, score: v.score }
        }
        if (bestSwap) { cur[row][si] = bestSwap.hero; best = bestSwap.score; improved = true }
        else cur[row][si] = oldHero
      }
    })
    console.log(`  [${label}] 第${sweep}轮，最优分 ${best.toFixed(0)}`)
  }
  return { state: cur, score: best }
}

const runs = [['贪心', greedyStart()], ['随机1', randomStart()], ['随机2', randomStart()]]
const results = []
runs.forEach(([label, st]) => {
  console.log(`=== ${label} ===`)
  const r = localSearch(st, label)
  results.push({ label, ...evaluate(r.state), state: r.state })
})
results.sort((a, b) => b.score - a.score)
const best = results[0]

console.log('\n================ 军师技特化阵容（鸣蛇90级） ================')
const st = best.state
;['front', 'mid', 'back'].forEach((row) => {
  const cn = { front: '前排', mid: '中排', back: '后排' }[row]
  console.log(`${cn}: ${st[row].map((h) => h.name).join('、')}${row === 'mid' ? ' + 🐲鸣蛇(中排第6格)' : ''}`)
})
console.log(`总战力: ${best.min} ~ ${best.max}   后排智: ${Math.round(best.backMid)}`)
console.log(`参考对手(后排智1500)下的军师技: Lv${best.sg.lv} ${best.sg.name || ''} 期望削益 ≈ ${Math.round(best.sg.gain)}`)
const d = best.res.ours.detail
console.log('阵营效果:', JSON.stringify(d.eraBuffs))
console.log('阵营技能:', JSON.stringify(d.eraSkills))
console.log('羁绊:', (d.fetters || []).map((x) => x.name).join('、'))
console.log('未量化:', JSON.stringify(d.unq))
// 对不同对手后排出档
console.log('\n面对不同对手后排的军师技档位:')
;[800, 1200, 1500, 2000, 2833].forEach((opp) => {
  if (best.backMid <= opp) { console.log(`  对手后排智${opp}: 对方发动（我方后排不占优）`); return }
  const ratio = Math.round((opp / best.backMid) * 1000)
  const sc = SCHEME.find((s) => ratio >= s.cond[0] && ratio < s.cond[1]) || SCHEME[7]
  console.log(`  对手后排智${opp}: Lv${sc.lv} ${sc.name}（${sc.i ? '全体-' + sc.i + '%' : '前排武-' + sc.f + '%'}）`)
})
