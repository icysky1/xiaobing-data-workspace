// 反制阵容搜索器（给定敌方布阵，搜我方 16 英雄 + 1 神兽，使净胜差最大）
// 设计要点：
//  1) 依赖注入 calcAll/makeSlots/heroCard/petCard/heroesMap，避免与页面文件循环依赖；
//  2) 计算按 step(budgetMs) 分片执行，调用方用 setTimeout 驱动，避免卡住小程序 UI；
//  3) 算法：多种子骨架（数值/削弱/阵营）→ 逐格局部精修。
//     骨架补位顺序为 后排 → 前排 → 中排：后排先挑高智力（决定军师技归属），再挑前排武力，
//     否则高智英雄会被中排先抢走，导致军师技打不过对面。
// 号位规则沿用客户端：前排[1,4,7,10,13,16] 中排[2,5,8,11,14,17] 后排[3,6,9,12,15,18]
const EVO_RE = /^(飞仙|戏魂|黄金甲)·/
const ROWS = { back: [0, 1, 2, 3, 4, 5], mid: [6, 7, 8, 9, 10, 11], front: [12, 13, 14, 15, 16, 17] }
const ROW_OF = {}
Object.keys(ROWS).forEach((r) => ROWS[r].forEach((i) => { ROW_OF[i] = r }))
const QUOTA = { back: 5, front: 6, mid: 5 } // 5+6+5=16 英雄，后排第 6 格留空
const PET_SLOT = 11 // 17 号位：中排第 6 列
const MAX_HEROES = 16
// 神兽只有一只（面板单选），但放在哪个号位仍然影响出手顺序与三排战力，
// 所以收尾固定做一轮「1 只 × 18 格」精扫；若将来恢复多兽候选，候选过多时先粗筛。
const PET_SCREEN_MIN = 12
const PET_SCREEN_TOP = 10

function baseName(n) {
  return String(n || '').replace(EVO_RE, '')
}
function avg(v) {
  return v && v.length ? (v[0] + v[1]) / 2 : 0
}

function createJob(opts) {
  const calcAll = opts.calcAll
  const makeSlots = opts.makeSlots
  const heroCard = opts.heroCard
  const petCard = opts.petCard
  const heroesMap = opts.heroesMap
  const enemySlots = opts.enemySlots
  const pet = opts.pet || null
  // 神兽候选（用户勾选已解锁的那些）：英雄搜完后统一择优「换哪只 + 放哪个格」
  const petList = (opts.pets && opts.pets.length ? opts.pets.slice() : (pet ? [pet] : []))
  if (pet && petList.indexOf(pet) < 0) petList.unshift(pet)
  const isPet = (u) => !!u && petList.indexOf(u) >= 0
  let budgetBonus = 0
  const allowEvo = opts.allowEvolution !== false
  // 用户屏蔽的英雄：按精确卡名屏蔽（如「黄金甲·精卫」），不影响同武将的其他卡（如基础「精卫」）
  const bannedNames = {}
  ;(opts.bannedNames || []).forEach((n) => { if (n) bannedNames[n] = 1 })
  const maxEvals = opts.maxEvals || 1100
  const maxPasses = opts.maxPasses || 3

  const enemyModel = { slots: enemySlots }
  const cardCache = {}

  // ---------- 候选池：排除 NPC/神话系与被屏蔽英雄，同名（含进化卡）取品质最高的一张 ----------
  const bestByName = {}
  Object.keys(heroesMap).forEach((k) => {
    const h = heroesMap[k]
    if (!h || !h.name || !h.quality || h.quality <= 1) return
    if (h.era === '神话' || h.title === '妖魔鬼怪') return
    if (!allowEvo && EVO_RE.test(h.name)) return
    const bn = baseName(h.name)
    if (bannedNames[h.name]) return // 精确卡名命中才排除，进化版与基础版互不影响
    const prev = bestByName[bn]
    if (!prev || h.quality > prev.quality) bestByName[bn] = h
  })
  const scored = Object.keys(bestByName).map((bn) => {
    const h = bestByName[bn]
    const f = avg(h.force)
    const i = avg(h.iq)
    const desc = (h.skill && h.skill.desc) || ''
    return { h: h, f: f, i: i, front: f * 1.5, mid: f + i, back: i, util: /(敌方|敌军)/.test(desc) ? 1 : 0 }
  })
  const sortBy = (key) => scored.slice().sort((a, b) => b[key] - a[key]).map((x) => x.h)
  const byFront = sortBy('front')
  const byMid = sortBy('mid')
  const byBack = sortBy('back')
  const utilList = scored.filter((x) => x.util).sort((a, b) => b.mid - a.mid).slice(0, 16).map((x) => x.h)
  function uniq(list) {
    const seen = {}
    const out = []
    list.forEach((h) => {
      if (!h || seen[h.id]) return
      seen[h.id] = 1
      out.push(h)
    })
    return out
  }
  const SHORT = {
    front: uniq(byFront.slice(0, 14).concat(utilList)),
    mid: uniq(byMid.slice(0, 14).concat(utilList)),
    back: uniq(byBack.slice(0, 14).concat(utilList)),
  }

  // ---------- 评估 ----------
  const stats = { evals: 0, pass: 0, stage: '准备' }
  let truncated = false
  function toSlots(state) {
    const slots = makeSlots()
    state.forEach((u, i) => {
      if (!u) return
      let unit
      if (isPet(u)) unit = petCard(u)
      else {
        if (!cardCache[u.id]) cardCache[u.id] = heroCard(u)
        unit = cardCache[u.id]
      }
      slots[i] = Object.assign({}, slots[i], { unit: unit })
    })
    return slots
  }
  function evaluate(state) {
    stats.evals++
    if (stats.evals > maxEvals + budgetBonus) truncated = true
    const r = calcAll({ ours: { slots: toSlots(state) }, enemy: enemyModel })
    const om = (r.ours.total.min + r.ours.total.max) / 2
    const em = (r.enemy.total.min + r.enemy.total.max) / 2
    return { score: om - em, ours: om, enemy: em }
  }

  // ---------- 骨架构造：后排(智) → 前排(武) → 中排(综合) ----------
  const FILL_ORDER = [
    ['back', ROWS.back.slice(0, QUOTA.back)],
    ['front', ROWS.front.slice(0, QUOTA.front)],
    ['mid', ROWS.mid.filter((i) => i !== PET_SLOT).slice(0, QUOTA.mid)],
  ]
  const GREEDY_SLOTS = []
  FILL_ORDER.forEach((it) => it[1].forEach((slot) => GREEDY_SLOTS.push(slot)))

  function assemble(lists) {
    const st = new Array(18).fill(null)
    if (pet) st[PET_SLOT] = pet
    const used = {}
    let n = 0
    FILL_ORDER.forEach((it) => {
      const row = it[0]
      it[1].forEach((slot) => {
        if (n >= MAX_HEROES) return
        const list = lists[row] || []
        for (let k = 0; k < list.length; k++) {
          const h = list[k]
          const bn = baseName(h.name)
          if (used[bn]) continue
          used[bn] = 1
          st[slot] = h
          n++
          break
        }
      })
    })
    return st
  }

  // 阵营骨架：该阵营 + 巅峰（巅峰计入主流阵营人数）里综合最强的 10 人，按各自最强排落位；其余用全库最强补
  function eraSkeleton(era) {
    const st = new Array(18).fill(null)
    if (pet) st[PET_SLOT] = pet
    const free = { front: ROWS.front.slice(), mid: ROWS.mid.filter((i) => i !== PET_SLOT), back: ROWS.back.slice() }
    const cap = { back: QUOTA.back, front: QUOTA.front, mid: QUOTA.mid }
    const used = {}
    let n = 0
    const put = (h, row) => {
      if (!cap[row] || !free[row].length) return false
      st[free[row].shift()] = h
      cap[row]--
      used[baseName(h.name)] = 1
      n++
      return true
    }
    const scoreOf = (h, row) => (row === 'front' ? avg(h.force) * 1.5 : row === 'mid' ? avg(h.force) + avg(h.iq) : avg(h.iq))
    const core = scored
      .filter((x) => x.h.era === era || x.h.era === '巅峰')
      .sort((a, b) => (b.f + b.i) - (a.f + a.i))
      .slice(0, 10)
    core.forEach((x) => {
      const order = ['back', 'front', 'mid'].sort((a, b) => scoreOf(x.h, b) - scoreOf(x.h, a))
      for (let k = 0; k < order.length; k++) if (put(x.h, order[k])) return
    })
    const listOf = { front: byFront, mid: byMid, back: byBack }
    FILL_ORDER.forEach((it) => {
      it[1].forEach((slot) => {
        if (st[slot] || n >= MAX_HEROES) return
        const list = listOf[it[0]]
        for (let k = 0; k < list.length; k++) {
          const h = list[k]
          if (used[baseName(h.name)]) continue
          used[baseName(h.name)] = 1
          st[slot] = h
          n++
          break
        }
      })
    })
    return st
  }

  const utilLists = {
    back: byBack,
    front: uniq(utilList.concat(byFront)),
    mid: uniq(utilList.concat(byMid)),
  }
  const skeletons = [assemble({ back: byBack, front: byFront, mid: byMid }), assemble(utilLists)]
  const eras = {}
  scored.forEach((x) => {
    if (x.h.era && x.h.era !== '神话') eras[x.h.era] = 1
  })
  Object.keys(eras).forEach((era) => skeletons.push(eraSkeleton(era)))

  // ---------- 状态 ----------
  let phase = 'greedy'
  let state = new Array(18).fill(null)
  if (pet) state[PET_SLOT] = pet
  let cur = null
  let bestState = null
  let bestVal = null
  let ski = 0
  let gi = 0
  let cands = null
  let ci = 0
  let candBest = null
  let candBestUnit = null
  let pass = 0
  let moves = []
  let mi = 0
  let moveBest = null
  let moveBestState = null
  let finished = false
  let temp = 200
  let noMove = 0
  // 神兽择优：英雄阵容定型后，对每只候选兽 × 18 个格子各试一次
  let psPet = 0
  let psSlot = 0
  let bestPetVal = null
  let bestPetState = null
  let bestPet = null
  // 候选兽很多时的粗筛（每只先试 1 次，取前 PET_SCREEN_TOP 只再全格精扫）
  let psScreenIdx = 0
  let psScored = []
  let psScreened = false
  let sweepPets = petList

  // 当前状态里神兽所在的格子（没有就返回第一个空格）
  function petSlotOf(st) {
    for (let i = 0; i < 18; i++) if (isPet(st[i])) return i
    return st.indexOf(null)
  }

  // 退火随机动作：换人（80% 用短名单、20% 全库） / 两格互换 / 挪神兽 / 挪空位
  function randomMove() {
    const used = usedNames()
    const occupied = []
    for (let i = 0; i < 18; i++) if (state[i] && !isPet(state[i])) occupied.push(i)
    if (!occupied.length) return null
    const r = Math.random()
    if (r < 0.7) {
      const i = occupied[(Math.random() * occupied.length) | 0]
      const row = ROW_OF[i]
      const wide = Math.random() < 0.2
      const list = wide ? (row === 'front' ? byFront : row === 'mid' ? byMid : byBack) : (SHORT[row] || [])
      const pool = list.filter((h) => !used[baseName(h.name)])
      if (!pool.length) return null
      return { type: 'hero', i: i, unit: pool[(Math.random() * pool.length) | 0] }
    }
    if (r < 0.85) {
      const a = occupied[(Math.random() * occupied.length) | 0]
      const b = occupied[(Math.random() * occupied.length) | 0]
      if (a === b) return null
      const st = state.slice()
      const tmp = st[a]
      st[a] = st[b]
      st[b] = tmp
      return { type: 'swap', a: a, b: b }
    }
    if (r < 0.93 && pet) {
      return { type: 'pet', j: (Math.random() * 18) | 0 }
    }
    const nullIdx = state.indexOf(null)
    if (nullIdx < 0) return null
    return { type: 'null', j: (Math.random() * 18) | 0 }
  }

  function usedNames() {
    const used = {}
    state.forEach((u) => { if (u && !isPet(u)) used[baseName(u.name)] = 1 })
    return used
  }
  function buildMoves() {
    const used = usedNames()
    const list = []
    for (let i = 0; i < 18; i++) {
      const u = state[i]
      if (!u || isPet(u)) continue
      const cands = SHORT[ROW_OF[i]] || []
      for (let k = 0; k < cands.length; k++) {
        const h = cands[k]
        if (used[baseName(h.name)]) continue
        list.push({ type: 'hero', i: i, unit: h })
      }
    }
    if (pet) {
      const curPet = petSlotOf(state)
      for (let j = 0; j < 18; j++) if (j !== curPet) list.push({ type: 'pet', j: j })
    }
    const nullIdx = state.indexOf(null)
    if (nullIdx >= 0) {
      for (let j = 0; j < 18; j++) if (j !== nullIdx) list.push({ type: 'null', j: j })
    }
    return list
  }
  function applyMove(mv) {
    const st = state.slice()
    if (mv.type === 'hero') st[mv.i] = mv.unit
    else if (mv.type === 'pet') {
      const curPet = petSlotOf(state)
      if (curPet < 0) return null
      st[curPet] = st[mv.j]
      st[mv.j] = pet
    } else if (mv.type === 'null') {
      const curNull = state.indexOf(null)
      if (mv.j === curNull) return null
      st[curNull] = st[mv.j]
      st[mv.j] = null
    } else if (mv.type === 'swap') {
      const tmp = st[mv.a]
      st[mv.a] = st[mv.b]
      st[mv.b] = tmp
    }
    return st
  }

  function enterPetSweep() {
    if (sweepPets.length <= 1 || !bestState) {
      finished = true
      return
    }
    phase = 'petsweep'
    psPet = 0
    psSlot = 0
    bestPetVal = null
    bestPetState = null
    bestPet = null
    budgetBonus = sweepPets.length * 18 + 40
    stats.stage = '神兽择优'
  }

  // 进入神兽阶段：候选过多先粗筛（每只 1 次评估），否则直接全格精扫
  function enterPetPhase() {
    if (!bestState) {
      finished = true
      return
    }
    if (petList.length > PET_SCREEN_MIN && !psScreened) {
      phase = 'petscreen'
      psScreenIdx = 0
      psScored = []
      sweepPets = petList
      budgetBonus = petList.length + PET_SCREEN_TOP * 18 + 20
      stats.stage = '神兽粗筛'
      return
    }
    enterPetSweep()
  }

  // 收尾：精扫里已试出的更好神兽配置即使被预算截断也不能丢
  function doneResult() {
    if (bestPetState && bestPetVal && (!bestVal || bestPetVal.score > bestVal.score)) {
      bestState = bestPetState.slice()
      bestVal = bestPetVal
    }
    state = bestState || state
    return { done: true, best: bestVal, state: bestState, stats: stats, pet: bestPet || pet }
  }

  function step(budgetMs) {
    const t0 = Date.now()
    if (finished) return doneResult()
    while (!finished && Date.now() - t0 < budgetMs) {
      if (truncated) { finished = true; break }

      if (phase === 'greedy') {
        if (gi >= GREEDY_SLOTS.length) {
          state = bestState.slice()
          cur = bestVal
          phase = 'anneal'
          temp = Math.max(80, Math.abs(bestVal.score) * 0.3)
          continue
        }
        const slot = GREEDY_SLOTS[gi]
        const row = ROW_OF[slot]
        stats.stage = '组建 ' + (gi + 1) + '/' + GREEDY_SLOTS.length
        if (!cands) {
          const used = usedNames()
          cands = (SHORT[row] || []).filter((h) => !used[baseName(h.name)])
          ci = 0
          candBest = null
          candBestUnit = null
          if (!cands.length) { gi++; cands = null; continue }
        }
        if (ci < cands.length) {
          const st = state.slice()
          st[slot] = cands[ci]
          const v = evaluate(st)
          if (!candBest || v.score > candBest.score) {
            candBest = v
            candBestUnit = cands[ci]
          }
          ci++
          continue
        }
        const st = state.slice()
        if (candBestUnit) st[slot] = candBestUnit
        state = st
        if (!bestVal || (candBest && candBest.score > bestVal.score)) {
          bestVal = candBest || evaluate(st)
          bestState = st.slice()
        }
        gi++
        cands = null
        ci = 0
        continue
      }

      if (phase === 'local') {
        if (mi >= moves.length) {
          if (moveBest && moveBest.score > cur.score && pass < maxPasses) {
            state = moveBestState
            cur = moveBest
            if (cur.score > bestVal.score) {
              bestVal = cur
              bestState = state.slice()
            }
            pass++
            stats.pass = pass
            moves = buildMoves()
            mi = 0
            moveBest = null
            moveBestState = null
            continue
          }
          // 局部精修收敛 → 转入退火
          phase = 'anneal'
          state = bestState.slice()
          cur = bestVal
          temp = Math.max(80, Math.abs(bestVal.score) * 0.3)
          continue
        }
        stats.stage = '精修 ' + (pass + 1) + '/' + maxPasses
        const st = applyMove(moves[mi++])
        const v = evaluate(st)
        if (!moveBest || v.score > moveBest.score) {
          moveBest = v
          moveBestState = st
        }
        continue
      }

      if (phase === 'anneal') {
        stats.stage = '退火寻优'
        const mv = randomMove()
        if (!mv) {
          noMove++
          if (noMove > 300) enterPetPhase()
          continue
        }
        noMove = 0
        const st = applyMove(mv)
        if (!st) continue
        const v = evaluate(st)
        const delta = v.score - cur.score
        if (delta >= 0 || Math.random() < Math.exp(delta / temp)) {
          state = st
          cur = v
          if (v.score > bestVal.score) {
            bestVal = v
            bestState = st.slice()
          }
        }
        temp = Math.max(1, temp * 0.996)
        if (stats.evals >= maxEvals * 0.98) enterPetPhase()
        continue
      }

      // 神兽粗筛：每只候选兽只在当前神兽格试 1 次，取前 N 名进精扫
      if (phase === 'petscreen') {
        if (psScreenIdx >= petList.length) {
          const top = psScored
            .slice()
            .sort((a, b) => b.score - a.score)
            .slice(0, PET_SCREEN_TOP)
            .map((x) => x.pet)
          psScreened = true
          sweepPets = top.length ? top : petList.slice(0, PET_SCREEN_TOP)
          enterPetSweep()
          continue
        }
        stats.stage = '神兽粗筛 ' + (psScreenIdx + 1) + '/' + petList.length
        const candPet = petList[psScreenIdx]
        const st = bestState.slice()
        const pi = petSlotOf(st)
        if (pi >= 0) st[pi] = candPet
        const v = evaluate(st)
        psScored.push({ pet: candPet, score: v.score })
        psScreenIdx++
        continue
      }

      if (phase === 'petsweep') {
        if (psPet >= sweepPets.length) {
          if (bestPetState) {
            bestState = bestPetState.slice()
            bestVal = bestPetVal
          }
          state = bestState.slice()
          finished = true
          continue
        }
        const candPet = sweepPets[psPet]
        if (psSlot >= 18) {
          psPet++
          psSlot = 0
          continue
        }
        stats.stage = '神兽择优 ' + (psPet + 1) + '/' + sweepPets.length
        const st = bestState.slice()
        const petIdx = petSlotOf(st)
        if (petIdx >= 0 && petIdx !== psSlot) {
          const tmp = st[petIdx]
          st[petIdx] = st[psSlot]
          st[psSlot] = tmp
        }
        st[psSlot] = candPet
        const v = evaluate(st)
        if (!bestPetVal || v.score > bestPetVal.score) {
          bestPetVal = v
          bestPetState = st
          bestPet = candPet
        }
        psSlot++
        continue
      }
    }
    return finished
      ? doneResult()
      : { done: false, best: bestVal, state: bestState, stats: stats, pet: bestPet || pet }
  }

  return {
    step: step,
    stats: stats,
    toSlots: toSlots,
    poolSize: scored.length,
    candidateCount: Object.keys(bestByName).length,
    candidateCards: Object.keys(bestByName).map((bn) => bestByName[bn].name),
    isTruncated: function () { return truncated },
  }
}

module.exports = { createJob, baseName, EVO_RE }
