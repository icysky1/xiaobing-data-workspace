// 实战推演（实战流程版）
// ---------------------------------------------------------------------------
// 流程口径来自解包客户端 game.js 的 battleDetail 回放（attack() 编排）：
//   0) 先手判定：attackFlow.power >= defenseFlow.power → 攻方先手
//      （power = 不含技能、含羁绊的基础战力；相等/更高的一方先手）
//   0.5) 秒杀判定 checkQuick：min(power)/max(power) <= InstantKillRatio/1000
//        （游戏内说明：一方战力是对方 2 倍 → 秒杀，直接结算）
//   1) 被动：阵营效果 + 英雄羁绊，进场即生效（不占号位、不可被沉默）
//      → 结束后快照「进场值」f0/i0（客户端 preparePower 口径）
//   2) 重置技能（钉选类：必定取最大/最小值）：号位 1→18 交替，先手方同号位先放
//   3) 普通技能（增减益/控制）：号位 1→18 交替，先手方同号位先放
//      增量 = 目标进场值 ×pct（314458 实测定案：吴刚/花蕊夫人同为+20% → 增量完全相同）
//   4) 阵营技能（时代技能）：先手方按号位顺序全部放完 → 后手方全部放
//      增量 = 阶段开始快照 ×pct（同阶段互不叠加：破军40%×2003、骁勇13%×2003）
//   5) 军师技：比较双方后排智力（技能结算后），只有胜方发动（档位按倍率，见 lineup.js）
//      增量 = 发动时当前值 ×pct（历史修正 -306 = 10%×3062）
//   6) 单挑：50% 概率触发，双方前排武力最高者对决，败者武力 -50%
//   7) 终局：全军冲锋比战力，高者胜（叠加小幅战斗浮动，否则同分全平）
//
// 增量总口径：进场态 = (底数+被动固定值)×(1+羁绊加算)×阵营乘算；战斗技能 = 绝对增量叠加。
//
// 不建模项（众生平等口径，经玩家实测确认）：
//   - 兵书（TeamCounter/MilitaryBook，日志中显示为「阵营克制」）：普通称王战计入，
//     众生平等模式不计入 → 本引擎一律不模拟。
//   - 助战 gatherPower：不在众生平等战场，不参与推演。
//   - 势力（王座）加成：势力界面明示持有王座一方防守 +20%，opt.throneEnemy 计入
//     终局胜负判定（不改变三排战力、先手与秒杀判定）；lineup.js 默认 20。
//
// 连携（replaceSkill，赛博系）：带 rs 的英雄与进化英雄号位相邻（同行±3 / 同列±1）
// → 技能替换为强化版（1.5 倍），由 lineup.js sidePackets 预先缩放报文增量（lx 标记）。
//
// 输入 side 结构（由 lineup.js 的 buildBattleSides 构造）：
//   {
//     label, finalMult,
//     power: 基础战力（不含技能、含羁绊）——先手/秒杀判定用，
//     units: [{ name, row, slot, baseFmin..baseImax }],
//     skills: [{
//       from: unitIndex | -1, slot, kind: 'buff'|'silence'|'pin',
//       phase: 'passive'|'reset'|'slot'|'era'|'scheme',   // 缺省按 from/kind 推断
//       p, own[], foe[], hits[], tag
//     }]
//   }
// ---------------------------------------------------------------------------

const DEFAULTS = {
  noise: 0.02, // 终局比拼的战斗内浮动（±2%）
  finalMult: 2, // 主战/防守 +100%（与静态战力同口径）
  instantRatio: 0.5, // 秒杀线：弱方 power / 强方 power ≤ 0.5（2 倍）即秒杀
}

function rnd() {
  return Math.random()
}

// 钉选：取最大值 → 下限抬到上限附近；取最小值反之（与静态结算同一公式）
function pinRange(lo0, hi0, mode, p) {
  const t = p === undefined ? 1 : Math.max(0, Math.min(1, p))
  if (mode === 'max') return [lo0 + (hi0 - lo0) * t, hi0]
  if (mode === 'min') return [lo0, hi0 - (hi0 - lo0) * t]
  return [lo0, hi0]
}

function unitPower(u, fm) {
  const fr = pinRange(u.baseFmin, u.baseFmax, u.pinF, u.pinFp)
  const ir = pinRange(u.baseImin, u.baseImax, u.pinI, u.pinIp)
  // 进场态 = (钉选区间中值+被动固定值)×被动层（羁绊加算×阵营乘算×被动减益乘算）
  // 战斗技能增量 = 绝对增量（参考值×pct + 固定值），直接加在进场态之上（314458 全技能日志定案）
  const dfm = u.dfm === undefined ? 1 : u.dfm
  const dim = u.dim === undefined ? 1 : u.dim
  const pfm = u.pfm === undefined ? 1 : u.pfm
  const pim = u.pim === undefined ? 1 : u.pim
  let f = Math.max(0, ((fr[0] + fr[1]) / 2 + u.df) * (1 + u.pf) * pfm * dfm + (u.addF || 0))
  let i = Math.max(0, ((ir[0] + ir[1]) / 2 + u.di) * (1 + u.pi) * pim * dim + (u.addI || 0))
  if (u.halfF) f *= 0.5 // 单挑败者：武力 -50%
  const p = u.row === 'front' ? f * 1.5 : u.row === 'mid' ? f + i : i
  return Math.max(0, p) * fm
}

function curForce(u) {
  const fr = pinRange(u.baseFmin, u.baseFmax, u.pinF, u.pinFp)
  const dfm = u.dfm === undefined ? 1 : u.dfm
  const pfm = u.pfm === undefined ? 1 : u.pfm
  let f = Math.max(0, ((fr[0] + fr[1]) / 2 + u.df) * (1 + u.pf) * pfm * dfm + (u.addF || 0))
  if (u.halfF) f *= 0.5
  return f
}

function rowsOf(side, fm) {
  const acc = { front: 0, mid: 0, back: 0 }
  for (let i = 0; i < side.units.length; i++) {
    const u = side.units[i]
    acc[u.row] += unitPower(u, fm)
  }
  return {
    front: Math.round(acc.front),
    mid: Math.round(acc.mid),
    back: Math.round(acc.back),
    total: Math.round(acc.front + acc.mid + acc.back),
  }
}

function totalOf(side, fm) {
  let s = 0
  for (let i = 0; i < side.units.length; i++) s += unitPower(side.units[i], fm)
  return s
}

// ---------- 预处理（每套阵容只做一次） ----------
function phaseOf(sk, from) {
  if (sk.phase) return sk.phase
  if (from < 0) return 'passive' // 阵营效果 / 羁绊等开场被动
  if (sk.kind === 'pin') return 'reset' // 钉选类 = 客户端的「重置技能」
  return 'slot' // 普通技能
}

function prepare(side) {
  const units = (side.units || []).map((u) => ({
    name: u.name,
    kind: u.kind,
    row: u.row,
    slot: u.slot,
    baseFmin: u.baseFmin,
    baseFmax: u.baseFmax,
    baseImin: u.baseImin,
    baseImax: u.baseImax,
    inheritF: u.inheritF || 0,
    inheritI: u.inheritI || 0,
    dfm: 1,
    dim: 1,
    pfm: 1,
    pim: 1,
  }))
  const bySlot = {}
  units.forEach((u, i) => {
    if (u.slot >= 1 && u.slot <= 18) bySlot[u.slot] = i
  })
  const byUnit = [] // reset/slot 阶段：按持有者分组
  const eras = [] // 阵容技能：先手方全放 → 后手方全放（按号位升序）
  const passives = [] // 阵营效果 + 羁绊
  const schemes = [] // 军师技（只有胜方有一条）
  ;(side.skills || []).forEach((sk) => {
    const from = sk.from
    const phase = phaseOf(sk, from === undefined || from === null ? -1 : from)
    const item = { sk: sk, slot: sk.slot || 0 }
    if (phase === 'passive') passives.push(item)
    else if (phase === 'era') eras.push(item)
    else if (phase === 'scheme') schemes.push(item)
    else {
      if (!byUnit[from]) byUnit[from] = []
      byUnit[from].push({ sk: sk, phase: phase })
    }
  })
  eras.sort((a, b) => a.slot - b.slot)
  return {
    label: side.label || '',
    units,
    bySlot,
    byUnit,
    passives,
    eras,
    schemes,
    power: side.power || 0, // 基础战力（先手/秒杀判定），缺省用场上底子合计
    finalMult: side.finalMult,
  }
}

// 每场的可变状态
function cloneState(p) {
  const units = []
  for (let i = 0; i < p.units.length; i++) {
    const u = p.units[i]
    units.push({
      name: u.name,
      kind: u.kind,
      row: u.row,
      slot: u.slot,
      baseFmin: u.baseFmin,
      baseFmax: u.baseFmax,
      baseImin: u.baseImin,
      baseImax: u.baseImax,
      inheritF: u.inheritF || 0,
      inheritI: u.inheritI || 0,
      df: 0,
      di: 0,
      pf: 0,
      pi: 0,
      dfm: 1,
      dim: 1,
      pfm: 1,
      pim: 1,
      addF: 0, // 战斗技能绝对增量（参考值×pct + 固定值）
      addI: 0,
      f0: 0, // 进场值快照（被动结算后、钉选前），英雄/神兽技能增量的参考值
      i0: 0,
      pinF: undefined,
      pinFp: undefined,
      pinI: undefined,
      pinIp: undefined,
      halfF: false,
      silenced: false,
      negImmune: false,
    })
  }
  return { label: p.label, units, bySlot: p.bySlot, byUnit: p.byUnit }
}

// 神兽继承是【动态】的：神兽自身无武力智力，随时 = 同排英雄当前值 × 继承系数
// （ID:314458 实战：帝江战斗中显示 2688，随英雄被增益同步上涨）
// 每次技能结算后刷新同场双方神兽的底数（覆盖式，神兽自身的 df/pfm 等仍作用在其上）
function updatePets(state) {
  if (!state || !state.units) return
  for (let i = 0; i < state.units.length; i++) {
    const pet = state.units[i]
    if (pet.kind !== 'pet' || (!pet.inheritF && !pet.inheritI)) continue
    let sF = 0, sI = 0
    for (let j = 0; j < state.units.length; j++) {
      const h = state.units[j]
      if (h.row !== pet.row || h.kind === 'pet') continue
      sF += curForce(h)
      sI += curIntel(h)
    }
    pet.baseFmin = pet.baseFmax = (sF * pet.inheritF) / 100
    pet.baseImin = pet.baseImax = (sI * pet.inheritI) / 100
  }
}

function curIntel(u) {
  const ir = pinRange(u.baseImin, u.baseImax, u.pinI, u.pinIp)
  const dim = u.dim === undefined ? 1 : u.dim
  const pim = u.pim === undefined ? 1 : u.pim
  return Math.max(0, ((ir[0] + ir[1]) / 2 + u.di) * (1 + u.pi) * pim * dim + (u.addI || 0))
}

// 把一条技能结算到场上（side = 释放方，foe = 对方）
// ctx：{ own: refSpec, foe: refSpec }，refSpec 指定增量参考值：
//   { mode:'entry' } 目标进场值（英雄/神兽技能，314458 实测：吴刚/花蕊同+20%→同+125）
//   { mode:'snap', F:[], I:[] } 阶段开始快照（阵营技能：破军40%×2003、骁勇13%×2003 互不叠加）
//   { mode:'cur' } 当前值（军师技：-306 = 10%×3062）
//   ctx 为 null → 被动路径（层叠加：pf/pi/df/di/dfm/dim），用于复现进场态
function isNegDelta(d) {
  return d.df < 0 || d.di < 0 || d.pf < 0 || d.pi < 0 || (d.dfm !== undefined && d.dfm < 1) || (d.dim !== undefined && d.dim < 1) ||
    (d.apF !== undefined && d.apF < 0) || (d.apI !== undefined && d.apI < 0) ||
    (d.afF !== undefined && d.afF < 0) || (d.afI !== undefined && d.afI < 0)
}

function refSpecVal(spec, u, t, intel) {
  if (!spec || spec.mode === 'cur') return intel ? curIntel(u) : curForce(u)
  if (spec.mode === 'snap') return (intel ? spec.I : spec.F)[t]
  return intel ? u.i0 : u.f0 // entry
}

function applyActiveDelta(u, d, spec) {
  if (d.df) u.df += d.df
  if (d.di) u.di += d.di
  if (d.apF) u.addF += refSpecVal(spec, u, d.t, false) * d.apF
  if (d.apI) u.addI += refSpecVal(spec, u, d.t, true) * d.apI
  if (d.afF) u.addF += d.afF
  if (d.afI) u.addI += d.afI
}

function fireRaw(sk, side, foe, tally, ctx) {
  if (sk.kind === 'immune') {
    // 免负面（大音希声类）：命中后不受「英雄技能」负面效果影响（神兽技能负面不挡）
    const hits = sk.hits || []
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i]
      const u = (h.side === 'foe' ? foe : side).units[h.t]
      if (!u || u.negImmune) continue
      if (rnd() > (h.p === undefined ? 1 : h.p)) continue
      u.negImmune = true
      tally.immune++
    }
    return
  }
  if (sk.kind === 'silence') {
    const hits = sk.hits || []
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i]
      const u = foe.units[h.t]
      if (!u || u.silenced) continue
      // 免负面单位不吃「英雄技能」的沉默（神兽技能的技能无效不挡）
      if (u.negImmune && sk.srcKind === 'hero') continue
      if (rnd() > h.p) continue
      u.silenced = true
      tally.silencedFoe++
    }
    return
  }
  if (sk.kind === 'pin') {
    const hits = sk.hits || []
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i]
      const u = (h.side === 'foe' ? foe : side).units[h.t]
      if (!u) continue
      if (rnd() > (h.p === undefined ? 1 : h.p)) continue
      if (h.attr !== 'i') { u.pinF = h.mode; u.pinFp = 1 }
      if (h.attr !== 'f') { u.pinI = h.mode; u.pinIp = 1 }
    }
    return
  }
  // 常规 buff / debuff：整条技能按概率 roll 一次
  if (sk.p !== undefined && sk.p < 1 && rnd() > sk.p) return
  tally.fired++
  if (ctx) {
    // 战斗技能：绝对增量（参考值×pct + 固定值）
    const own = sk.own || []
    for (let i = 0; i < own.length; i++) {
      const d = own[i]
      const u = side.units[d.t]
      if (!u) continue
      applyActiveDelta(u, d, ctx.own)
    }
    const foeD = sk.foe || []
    for (let i = 0; i < foeD.length; i++) {
      const d = foeD[i]
      const u = foe.units[d.t]
      if (!u) continue
      // 免负面：英雄技能的负面增量不生效（阵营/神兽来源不挡）
      if (u.negImmune && sk.srcKind === 'hero' && isNegDelta(d)) continue
      applyActiveDelta(u, d, ctx.foe)
    }
    return
  }
  // 被动路径（阵营效果 + 羁绊）：层叠加，复现进场态
  const own = sk.own || []
  for (let i = 0; i < own.length; i++) {
    const d = own[i]
    const u = side.units[d.t]
    if (!u) continue
    u.df += d.df
    u.di += d.di
    u.pf += d.pf
    u.pi += d.pi
    if (d.dfm && d.dfm !== 1) u.dfm = (u.dfm === undefined ? 1 : u.dfm) * d.dfm
    if (d.dim && d.dim !== 1) u.dim = (u.dim === undefined ? 1 : u.dim) * d.dim
    if (d.pfm && d.pfm !== 1) u.pfm = (u.pfm === undefined ? 1 : u.pfm) * d.pfm
    if (d.pim && d.pim !== 1) u.pim = (u.pim === undefined ? 1 : u.pim) * d.pim
  }
  const foeD = sk.foe || []
  for (let i = 0; i < foeD.length; i++) {
    const d = foeD[i]
    const u = foe.units[d.t]
    if (!u) continue
    // 免负面：英雄技能的负面增量不生效（阵营/神兽来源不挡）
    if (u.negImmune && sk.srcKind === 'hero' && isNegDelta(d)) continue
    u.df += d.df
    u.di += d.di
    u.pf += d.pf
    u.pi += d.pi
    if (d.dfm && d.dfm !== 1) u.dfm = (u.dfm === undefined ? 1 : u.dfm) * d.dfm
    if (d.dim && d.dim !== 1) u.dim = (u.dim === undefined ? 1 : u.dim) * d.dim
    if (d.pfm && d.pfm !== 1) u.pfm = (u.pfm === undefined ? 1 : u.pfm) * d.pfm
    if (d.pim && d.pim !== 1) u.pim = (u.pim === undefined ? 1 : u.pim) * d.pim
  }
}

// fire 后刷新神兽继承底数（同排英雄当前值变化会同步传导给神兽）
function fire(sk, side, foe, tally, ctx) {
  fireRaw(sk, side, foe, tally, ctx)
  updatePets(side)
  updatePets(foe)
}

// 某阶段：号位 1→18 交替，先手方同号位先放；出手前已被控制的单位技能全废
function fireSlotPhase(pA, pB, A, B, order, phase, tally) {
  const sides = [A, B]
  const preps = [pA, pB]
  for (let no = 1; no <= 18; no++) {
    for (let k = 0; k < 2; k++) {
      const s = order[k]
      const side = sides[s]
      const idx = side.bySlot[no]
      if (idx === undefined) continue
      const u = side.units[idx]
      if (u.silenced) continue
      const list = side.byUnit[idx]
      if (!list) continue
      const foe = sides[1 - s]
      for (let i = 0; i < list.length; i++) {
        if (list[i].phase !== phase) continue
        fire(list[i].sk, side, foe, tally, phase === 'passive' ? null : { own: ENTRY_REF, foe: ENTRY_REF })
      }
    }
  }
}

const ENTRY_REF = { mode: 'entry' }
const CUR_REF = { mode: 'cur' }

// 前排武力最高者（单挑选手）
function topFront(S) {
  let best = null
  for (let i = 0; i < S.units.length; i++) {
    const u = S.units[i]
    if (u.row !== 'front') continue
    const f = curForce(u)
    if (!best || f > best.f) best = { u: u, f: f }
  }
  return best
}

// 单场推演
function runOnce(oursSide, enemySide, opt) {
  const pA = oursSide.bySlot ? oursSide : prepare(oursSide)
  const pB = enemySide.bySlot ? enemySide : prepare(enemySide)
  const o = opt || {}
  const noise = o.noise === undefined ? DEFAULTS.noise : o.noise
  const fm = o.finalMult === undefined ? (pA.finalMult || DEFAULTS.finalMult) : o.finalMult
  const A = cloneState(pA)
  const B = cloneState(pB)
  const tally = { fired: 0, silencedFoe: 0, immune: 0 }
  const startOurs = totalOf(A, fm)
  const startEnemy = totalOf(B, fm)

  // 1) 被动：阵营效果 + 羁绊
  for (let i = 0; i < pA.passives.length; i++) fire(pA.passives[i].sk, A, B, tally)
  for (let i = 0; i < pB.passives.length; i++) fire(pB.passives[i].sk, B, A, tally)

  // 进场值快照（客户端 preparePower 口径：被动后、钉选/技能前）
  // 英雄/神兽技能的百分比增量都以此为参考值（314458 实测：增量=进场值×pct，与释放时机无关）
  A.units.forEach((u) => { u.f0 = curForce(u); u.i0 = curIntel(u) })
  B.units.forEach((u) => { u.f0 = curForce(u); u.i0 = curIntel(u) })

  // 基础战力（不含主动技能、含阵营/羁绊被动口径）：调用方给值时以调用方为准
  const po = o.powerOurs || pA.power || powerWithPassives(pA, pB)
  const pe = o.powerEnemy || pB.power || powerWithPassives(pB, pA)

  // 0.5) 秒杀判定：一方是另一方 2 倍 → 直接秒杀结算
  if (o.instant !== false && po > 0 && pe > 0) {
    const weak = Math.min(po, pe)
    const strong = Math.max(po, pe)
    if (weak / strong <= DEFAULTS.instantRatio) {
      return packResult(A, B, {
        winner: po >= pe ? 'ours' : 'enemy',
        instantKill: true,
        startOurs: startOurs,
        startEnemy: startEnemy,
        fm: fm,
        o: o,
        fired: tally.fired,
      })
    }
  }

  // 0) 先手：基础战力高的一方（相等 → 我方 = 攻方先）
  const first = o.first || (po >= pe ? 'ours' : 'enemy')
  const order = first === 'enemy' ? [1, 0] : [0, 1]

  // 2) 重置技能（钉选类）
  fireSlotPhase(pA, pB, A, B, order, 'reset', tally)
  // 3) 普通技能（增减益/控制）
  fireSlotPhase(pA, pB, A, B, order, 'slot', tally)

  // 4) 阵容技能：先手方按号位顺序全放 → 后手方全放
  //    增量参考值 = 阶段开始时的快照（双方同时取一次；阶段内技能互不叠加：
  //    314458 实测破军 40%×2003、骁勇 13%×2003，都按快照算而非当前值）
  const snapF = [A.units.map((u) => curForce(u)), B.units.map((u) => curForce(u))]
  const snapI = [A.units.map((u) => curIntel(u)), B.units.map((u) => curIntel(u))]
  const eraLists = [
    { side: A, foe: B, list: pA.eras, si: 0 },
    { side: B, foe: A, list: pB.eras, si: 1 },
  ]
  for (let k = 0; k < 2; k++) {
    const e = eraLists[order[k]]
    const ctx = {
      own: { mode: 'snap', F: snapF[e.si], I: snapI[e.si] },
      foe: { mode: 'snap', F: snapF[1 - e.si], I: snapI[1 - e.si] },
    }
    for (let i = 0; i < e.list.length; i++) fire(e.list[i].sk, e.side, e.foe, tally, ctx)
  }

  // 5) 军师技：静态已判定胜方与档位，这里只负责在技能之后结算
  //    增量参考值 = 发动时的当前值（314458 实测：历史修正 -306 = 10%×3062）
  for (let i = 0; i < pA.schemes.length; i++) fire(pA.schemes[i].sk, A, B, tally, { own: CUR_REF, foe: CUR_REF })
  for (let i = 0; i < pB.schemes.length; i++) fire(pB.schemes[i].sk, B, A, tally, { own: CUR_REF, foe: CUR_REF })

  // 6) 单挑：50% 概率，双方前排武力最高者对决，败者武力 -50%（同武力攻方胜）
  let solo = null
  if (o.solo !== false && rnd() < 0.5) {
    const pa = topFront(A)
    const pb = topFront(B)
    if (pa && pb) {
      const oursWin = pa.f >= pb.f
      ;(oursWin ? pb : pa).u.halfF = true
      solo = { oursWin: oursWin }
    }
  }

  // 7) 终局：比战力
  const res = packResult(A, B, {
    winner: 'draw',
    startOurs: startOurs,
    startEnemy: startEnemy,
    fm: fm,
    o: o,
    fired: tally.fired,
  })
  // 王座防守加成（opt.throneEnemy %）：守王座一方的 gatherPower 多一笔，
  // 加在终局战力上（对应实战总战 = 三排 + gatherPower，不影响先手/秒杀判定）
  const throne = Math.max(0, Number(o.throneEnemy) || 0) / 100
  const pa2 = res.ours.total * (1 + (rnd() * 2 - 1) * noise)
  const pb2 = res.enemy.total * (1 + throne) * (1 + (rnd() * 2 - 1) * noise)
  res.winner = pa2 > pb2 ? 'ours' : pb2 > pa2 ? 'enemy' : 'draw'
  res.solo = solo
  return res
}

function powerWithPassives(p, foeP) {
  // 缺省 power 时：底子 + 被动（阵营效果 + 羁绊）后的战力
  const A2 = cloneState(p)
  const B2 = cloneState(foeP)
  const tally = { fired: 0, silencedFoe: 0, immune: 0 }
  for (let i = 0; i < p.passives.length; i++) fire(p.passives[i].sk, A2, B2, tally)
  return totalOf(A2, p.finalMult || DEFAULTS.finalMult)
}

function packResult(A, B, x) {
  const ours = rowsOf(A, x.fm)
  const enemy = rowsOf(B, x.fm)
  let silencedOurs = 0
  let silencedEnemy = 0
  for (let i = 0; i < A.units.length; i++) if (A.units[i].silenced) silencedOurs++
  for (let i = 0; i < B.units.length; i++) if (B.units[i].silenced) silencedEnemy++
  return {
    winner: x.winner,
    instantKill: !!x.instantKill,
    ours: ours,
    enemy: enemy,
    startOurs: Math.round(x.startOurs),
    startEnemy: Math.round(x.startEnemy),
    fired: x.fired || 0,
    silencedOurs: silencedOurs,
    silencedEnemy: silencedEnemy,
    units: x.o && x.o.debug ? { ours: A.units.map((u) => ({ name: u.name, f0: Math.round(u.f0), addF: Math.round(u.addF || 0), addI: Math.round(u.addI || 0), df: u.df, pf: u.pf, halfF: u.halfF, silenced: u.silenced, negImmune: u.negImmune })), enemy: B.units.map((u) => ({ name: u.name, f0: Math.round(u.f0), addF: Math.round(u.addF || 0), addI: Math.round(u.addI || 0), df: u.df, pf: u.pf, halfF: u.halfF, silenced: u.silenced })) } : undefined,
  }
}

// ---------- 分片任务：跑 N 次并累积统计 ----------
function createJob(opts) {
  const pA = prepare(opts.ours)
  const pB = prepare(opts.enemy)
  const total = opts.sims || 300
  const opt = opts.opt || {}

  // 先手/秒杀只取决于基础战力，整批一致
  const po = opt.powerOurs || pA.power || powerWithPassives(pA, pB)
  const pe = opt.powerEnemy || pB.power || powerWithPassives(pB, pA)
  const instant = opt.instant !== false && po > 0 && pe > 0 && Math.min(po, pe) / Math.max(po, pe) <= DEFAULTS.instantRatio
    ? (po >= pe ? 'ours' : 'enemy')
    : ''
  const first = opt.first || (po >= pe ? 'ours' : 'enemy')

  const acc = {
    n: 0, win: 0, lose: 0, draw: 0, fired: 0,
    solo: 0, soloOurs: 0,
    silencedOurs: 0, silencedEnemy: 0,
    startOurs: 0, startEnemy: 0,
    ours: { front: 0, mid: 0, back: 0, total: 0, min: Infinity, max: -Infinity },
    enemy: { front: 0, mid: 0, back: 0, total: 0, min: Infinity, max: -Infinity },
  }

  function summary() {
    const n = Math.max(1, acc.n)
    const wrap = (o) => ({
      front: Math.round(o.front / n),
      mid: Math.round(o.mid / n),
      back: Math.round(o.back / n),
      total: Math.round(o.total / n),
      min: o.min === Infinity ? 0 : o.min,
      max: o.max === -Infinity ? 0 : o.max,
    })
    return {
      n: acc.n,
      total,
      winRate: acc.win / n,
      loseRate: acc.lose / n,
      drawRate: acc.draw / n,
      firstLabel: first === 'enemy' ? '敌方' : '我方',
      firstBy: opt.first ? '指定' : '基础战力',
      throneEnemy: Math.round((Number(opt.throneEnemy) || 0) * 10) / 10,
      instantKill: instant,
      soloRate: acc.solo / n,
      soloOursWinRate: acc.soloOurs / n,
      startOurs: Math.round(acc.startOurs / n),
      startEnemy: Math.round(acc.startEnemy / n),
      avgFired: Math.round((acc.fired / n) * 10) / 10,
      avgSilencedOurs: Math.round((acc.silencedOurs / n) * 10) / 10,
      avgSilencedEnemy: Math.round((acc.silencedEnemy / n) * 10) / 10,
      ours: wrap(acc.ours),
      enemy: wrap(acc.enemy),
      stage: '被动 → 号位技能 → 阵容技能 → 军师技 → 单挑 → 比拼',
    }
  }

  function step(budgetMs) {
    const t0 = Date.now()
    while (acc.n < total) {
      const r = runOnce(pA, pB, opt)
      acc.n++
      if (r.winner === 'ours') acc.win++
      else if (r.winner === 'enemy') acc.lose++
      else acc.draw++
      if (r.solo) {
        acc.solo++
        if (r.solo.oursWin) acc.soloOurs++
      }
      acc.fired += r.fired
      acc.silencedOurs += r.silencedOurs
      acc.silencedEnemy += r.silencedEnemy
      acc.startOurs += r.startOurs
      acc.startEnemy += r.startEnemy
      ;['ours', 'enemy'].forEach((k) => {
        const a = acc[k]
        const v = r[k]
        a.front += v.front
        a.mid += v.mid
        a.back += v.back
        a.total += v.total
        if (v.total < a.min) a.min = v.total
        if (v.total > a.max) a.max = v.total
      })
      if (Date.now() - t0 > budgetMs) break
    }
    return { done: acc.n >= total, stats: summary() }
  }

  return { step, summary, stats: acc, first: first, instant: instant }
}

module.exports = { createJob, runOnce, prepare, DEFAULTS }
