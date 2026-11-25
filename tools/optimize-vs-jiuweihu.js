// 众生平等对决：我方(鸣蛇) vs 图片敌方阵容(九尾狐 ID:314698)
// 口径：全员 1 级基础值 + 神兽 1 级技能段 + 军师技（引擎默认，不打补丁）
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }

const LINEUP_PATH = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const src = fs.readFileSync(LINEUP_PATH, 'utf8') // 众生平等：不替换技能解锁过滤
const code = src + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('lineup-equal')
m.filename = LINEUP_PATH
m.paths = Module._nodeModulePaths(path.dirname(LINEUP_PATH))
m._compile(code, LINEUP_PATH)
const L = m.exports

// ---------- 英雄解析（精确名优先 → 包含模糊取最高阶） ----------
const heroesAll = Object.values(L.heroesMap)
const byName = {}
heroesAll.forEach((h) => { byName[h.name] = h })
function resolve(name) {
  if (byName[name]) return byName[name]
  const cands = heroesAll.filter((h) => h.name.indexOf(name) >= 0)
  if (cands.length) return cands.sort((a, b) => b.quality - a.quality)[0]
  return null
}
const petFox = L.petsData.find((p) => p.name === '九尾狐')
const petSnake = L.petsData.find((p) => p.name === '鸣蛇')

// ---------- 敌方阵容（来自截图 ID:314698，众生平等口径） ----------
// 槽位：back=0..5(顶两行) mid=6..11 front=12..17；右列在前，九尾狐神兽在第 3 格
// 敌方准确名单（用户确认）：7号位=黄金甲·雨师妾，15号位=飞仙·涂山女，18号位=飞仙·赵飞燕，13号位空
const ENEMY = {
  back: ['九天玄女', '女艾', 'PET:九尾狐', '后羿', '黄金甲·精卫', '女娲'],
  mid: ['黄金甲·雨师妾', '伏羲', '黄金甲·嫦娥', '刘邦', '李白', '洛嫔'],
  front: [null, '张良', '飞仙·涂山女', '夏启', '大禹', '飞仙·赵飞燕'],
}
const ROW_IDX = { back: 0, mid: 6, front: 12 }
function buildEnemy() {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    ENEMY[row].forEach((name, i) => {
      const idx = ROW_IDX[row] + i
      if (!name) return
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

// ---------- 我方候选池（各排最强的 200 名，取每位基础名最优进化） ----------
const EVOLVE_PREFIX = ['飞仙·', '戏魂·', '黄金甲·']
function baseName(n) {
  for (const p of EVOLVE_PREFIX) if (n.indexOf(p) === 0) return n.slice(p.length)
  return n
}
const bestOf = {}
heroesAll
  .filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1)
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
const POOL_N = 200
const pools = {}
;['front', 'mid', 'back'].forEach((row) => {
  pools[row] = heroes.slice().sort((a, b) => rawVal(b, row) - rawVal(a, row)).slice(0, POOL_N)
})

const PET_SLOT = 11 // 鸣蛇中排末格
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
  const r = L.calcAll({ ours: { slots: buildSlots(state) }, enemy: { slots: enemySlots } })
  const o = r.ours.total, e = r.enemy.total
  return { score: (o.min + o.max) / 2 - (e.min + e.max) / 2, ours: o, enemy: e, res: r }
}

// ---------- 基准：既有阵容对照 ----------
const BASELINES = {
  鸣蛇v3: {
    back: ['飞仙·黄帝', '妈祖', '伏羲', '飞仙·李白', '飞仙·女娲', '月老'],
    mid: ['黄金甲·王贲', '戏魂·蒙恬', '戏魂·岳飞', '黄金甲·织田信长', '戏魂·昊天大帝'],
    front: ['飞仙·岳云', '杨戬', '孙悟空', '戏魂·亚瑟王', '飞仙·哪吒', '阿瑞斯'],
  },
  精卫刺网: {
    back: ['老子', '专诸', '飞仙·甄嬛儿', '高渐离', '红线', '霍光'],
    mid: ['黄金甲·嫦娥', '飞仙·黄帝', '孙悟空', '飞仙·孟姜女', '黄金甲·精卫'],
    front: ['黄金甲·聂隐娘', '项羽', '聂政', '荆轲', '戏魂·九天玄女', '共工'],
  },
}
function stateFromNames(cfg) {
  const s = { front: [], mid: [], back: [] }
  ;['front', 'mid', 'back'].forEach((row) => {
    cfg[row].forEach((n) => { const h = resolve(n); if (h) s[row].push(h) })
  })
  return s
}
console.log('=========== 基准对照（众生平等口径） ===========')
Object.entries(BASELINES).forEach(([k, cfg]) => {
  const v = evaluate(stateFromNames(cfg))
  console.log(`${k}: 我方 ${Math.round(v.ours.min)}~${Math.round(v.ours.max)} | 敌方 ${Math.round(v.enemy.min)}~${Math.round(v.enemy.max)} | 净胜差 ${v.score.toFixed(0)} ${v.score > 0 ? '✅胜' : '❌负'}`)
})

// ---------- 优化器（目标 = 对该敌方的净胜差） ----------
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
    const cand = pools[row].slice(0, 80)
    let guard = 0
    while (s[row].length < need && guard++ < 600) {
      const c = cand[Math.floor(Math.random() * cand.length)]
      const bn = baseName(c.name)
      if (used.has(bn)) continue
      used.add(bn); s[row].push(c)
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
      const [row, i] = ps[Math.floor(Math.random() * ps.length)]
      const used = usedSet(cand, cand[row][i])
      const pool = pools[row]
      for (let g = 0; g < 20; g++) {
        const c = pool[Math.floor(Math.random() * pool.length)]
        if (c !== cand[row][i] && !used.has(baseName(c.name))) { cand[row][i] = c; break }
      }
    } else if (r < 0.85) {
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
      const p1 = ps[Math.floor(Math.random() * ps.length)]
      const p2 = ps[Math.floor(Math.random() * ps.length)]
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
    let ok = true
    ;['front', 'mid', 'back'].forEach((row) => {
      const need = row === 'mid' ? 5 : 6
      if (cand[row].length !== need) ok = false
    })
    if (!ok) continue
    const v = evaluate(cand)
    if (v.score > curScore || Math.random() < Math.exp((v.score - curScore) / T)) {
      cur = cand; curScore = v.score
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
    improved = false; sweep++
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
  console.log(`${label}: 退火 ${a.score.toFixed(0)} → 局部 ${ls.score.toFixed(0)}，净胜差 ${fin.score.toFixed(0)}，评估${evalCount.n}次，${((Date.now() - t0) / 1000).toFixed(0)}s`)
  results.push({ label, state: ls.state, ...fin })
})
results.sort((a, b) => b.score - a.score)
const best = results[0]

console.log('\n=========== 最强阵容（我方鸣蛇 vs 九尾狐敌方） ===========')
const st = best.state
;['front', 'mid', 'back'].forEach((row) => {
  const cn = { front: '前排(武×1.5)', mid: '中排(武+智)', back: '后排(智)' }[row]
  console.log(`${cn}: ${st[row].map((h) => h.name).join('、')}${row === 'mid' ? ' + 🐲鸣蛇' : ''}`)
})
console.log(`我方：${Math.round(best.ours.min)}~${Math.round(best.ours.max)}`)
console.log(`敌方：${Math.round(best.enemy.min)}~${Math.round(best.enemy.max)}`)
console.log(`净胜差：${best.score.toFixed(0)} ${best.score > 0 ? '✅ 胜' : '❌ 负'}`)
const d = best.res.ours.detail, ed = best.res.enemy.detail
console.log('我方阵营效果:', JSON.stringify(d.eraBuffs))
console.log('敌方阵营效果:', JSON.stringify(ed.eraBuffs))
console.log('我方羁绊(' + (d.fetters || []).length + '):')
;(d.fetters || []).forEach((x) => console.log('  -', x.name + '（' + x.members + '）' + x.effect))
console.log('我方未量化:', JSON.stringify(d.unq))
console.log('\n评估总次数:', evalCount.n)
console.log('各起点:', results.map((r) => `${r.label}=${r.score.toFixed(0)}`).join(' / '))
