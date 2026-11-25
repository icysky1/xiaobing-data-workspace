const heroesMap = require('../../data/heroes.js')
const petsData = require('../../data/pets.js')
const teamBuffData = require('../../data/teamBuff.js')
const eraSkillData = require('../../data/eraSkill.js')
const formationCode = require('../../utils/formationCode.js')
const lineupOptimizer = require('../../utils/lineupOptimizer.js')
const battleSim = require('../../utils/battleSim.js')
const { canViewModule } = require('../../utils/settings')

const Q_COLOR = { 1: '#9aa0a6', 2: '#2e9dbe', 3: '#a058c8', 4: '#e0913c', 5: '#c85f50', 6: '#e0417a' }
// 神兽品质配色（与游戏一致）
const PET_Q_COLOR = ['#9e9e9e', '#6fae4e', '#3d9bd1', '#9a5fd0', '#e0862c', '#d94f43', '#d9528f', '#5c6bc0', '#3a343c']

// 时代页签，与游戏内选将界面一致
const ERAS = ['巅峰', '夏', '商', '周', '春秋', '战国', '秦', '西汉', '东汉', '三国', '晋', '十六国', '南北朝', '隋', '唐', '五代十国', '北宋', '南宋', '元', '明', '清', '义军', '外族', '侠']
const PET_POS = ['前排', '中排', '后排']
const ROW_MAP = { 前排: 'front', 中排: 'mid', 后排: 'back' }

// 只保留可上阵英雄：排除异族入侵怪（era 神话）、妖魔鬼怪与小兵（品质1，不能上阵）
const all = Object.keys(heroesMap)
  .map((k) => heroesMap[k])
  .filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1)
  .sort((a, b) => (b.quality || 0) - (a.quality || 0) || a.id - b.id)

const petAll = petsData
  .slice()
  .sort((a, b) => (b.q || 0) - (a.q || 0) || a.id - b.id)

// ============ 神兽等级 → 技能档位 ============
// 实战记录核对：神兽技能不是恒按 1 级，而是按「神兽实际等级落到的那一档」生效。
// pets.js 的 skills 里同名连续条目 = 该技能的 1..N 档，ul = 该档需要的神兽等级
// （如穷奇「凶神临」：ul 1/10/20/30/40/55/70/85/95/105 → 武力 +9% … +60%）。
const PET_LV_MIN = 1
const PET_LV_MAX = 110
let PET_LV = PET_LV_MAX

function normPetLv(v) {
  const n = Math.round(Number(v) || 0)
  return Math.max(PET_LV_MIN, Math.min(PET_LV_MAX, n || PET_LV_MIN))
}

// 按神兽等级取每个技能当前生效的那一档（未解锁的技能不返回）
function petSkillTiers(p, lv) {
  const list = (p && p.skills) || []
  const L = normPetLv(lv)
  const groups = []
  list.forEach((s) => {
    const last = groups[groups.length - 1]
    if (last && last.name === s.n) last.items.push(s)
    else groups.push({ name: s.n, items: [s] })
  })
  const out = []
  groups.forEach((g) => {
    let idx = -1
    g.items.forEach((it, i) => { if ((it.ul || 1) <= L) idx = i })
    if (idx < 0) return
    out.push({
      name: g.name,
      tier: idx + 1,
      tiers: g.items.length,
      need: g.items[idx].ul || 1,
      text: g.items[idx].n + '：' + g.items[idx].d,
    })
  })
  return out
}

function petSkillText(p, lv) {
  return petSkillTiers(p, lv).map((t) => t.text).join('\n')
}

// 三排各 6 格，英雄/神兽自由搭配；众生平等口径：英雄 1 级基础值（神兽自身也按图鉴基础值，
// 但神兽技能按「神兽等级」取档 —— 见 petSkillTiers）
const COLS = [
  { key: 'back', label: '后排 · 智', formula: '后排战力 = 智力(1级)' },
  { key: 'mid', label: '中排 · 合', formula: '中排战力 = 武力+智力(1级)' },
  { key: 'front', label: '前排 · 武', formula: '前排战力 = 武力×1.5(1级)' },
]

function makeSlots() {
  const slots = []
  COLS.forEach((c, ci) => {
    for (let i = 0; i < 6; i++) slots.push({ idx: ci * 6 + i, col: c.key, unit: null })
  })
  return slots
}

// 槽位附加游戏内号位（前排 1/4/7/10/13/16，中排 2/5/8/11/14/17，后排 3/6/9/12/15/18）
const ROW_RANK = { front: 0, mid: 1, back: 2 }
function slotNoOf(idx, col) {
  return (idx % 6) * 3 + (ROW_RANK[col] || 0) + 1
}
function withSlotNo(slots) {
  return slots.map((s) => ({ ...s, no: slotNoOf(s.idx, s.col) }))
}

function heroCard(h) {
  // 众生平等：1 级基础区间（数组两位 = 区间上下限），显示区间、计算取中点（期望值）
  const fMin = h.force ? h.force[0] : 0
  const fMax = h.force ? h.force[1] : 0
  const iMin = h.iq ? h.iq[0] : 0
  const iMax = h.iq ? h.iq[1] : 0
  return {
    kind: 'hero',
    id: h.id,
    name: h.name,
    qcolor: Q_COLOR[h.quality] || '#9c8a70',
    quality: h.quality,
    forceMin: fMin,
    forceMax: fMax,
    iqMin: iMin,
    iqMax: iMax,
    force: (fMin + fMax) / 2,
    iq: (iMin + iMax) / 2,
  }
}

function petCard(p) {
  // 神兽：1 级基础区间。神兽继承不再固定加值——按客户端口径在 collectSide 里
  // 以「同排英雄(基础+羁绊) × petInherit‰」结算（game.js caculateHeroInheritBattleNum）
  const fMin = p.fp ? p.fp[0] : 0
  const fMax = p.fp ? p.fp[1] : 0
  const iMin = p.sp ? p.sp[0] : 0
  const iMax = p.sp ? p.sp[1] : 0
  return {
    kind: 'pet',
    id: p.id,
    name: p.name,
    qcolor: PET_Q_COLOR[p.q] || '#9c8a70',
    quality: p.q,
    forceMin: fMin,
    forceMax: fMax,
    iqMin: iMin,
    iqMax: iMax,
    force: (fMin + fMax) / 2,
    iq: (iMin + iMax) / 2,
    inheritF: p.inherit ? p.inherit.force : 0,
    inheritI: p.inherit ? p.inherit.iq : 0,
  }
}

// 进化前缀英雄（飞仙·/戏魂·/黄金甲·/赛博·）计入羁绊：按基础名匹配
const EVOLVE_PREFIX = ['飞仙·', '戏魂·', '黄金甲·', '赛博·']
function isEvolved(name) {
  for (let i = 0; i < EVOLVE_PREFIX.length; i++) {
    if (name.indexOf(EVOLVE_PREFIX[i]) === 0) return true
  }
  return false
}
function nameBase(n) {
  for (let i = 0; i < EVOLVE_PREFIX.length; i++) {
    if (n.indexOf(EVOLVE_PREFIX[i]) === 0) return n.slice(EVOLVE_PREFIX[i].length)
  }
  return n
}
const heroByBase = {}
const heroByName = {} // 完整名 → 英雄（区分「黄金甲·盘古」与「盘古」，两者羁绊数值不同）
Object.keys(heroesMap).forEach((k) => {
  const h = heroesMap[k]
  heroByName[h.name] = h
  const bn = nameBase(h.name)
  if (!heroByBase[bn] || h.name === bn) heroByBase[bn] = h
})
function baseQuality(bn) {
  const h = heroByBase[bn]
  return h ? h.quality : 0
}
// 共鸣（crossFetter，cf=1）：羁绊可跨阵容激活（二/三/四阵均可上阵搭档），
// 实战中通常按满羁绊计算 → 拥有共鸣标志的英雄，其羁绊一律视为激活
function fetterActive(ft, ownerBase, bases, ownerCf) {
  if (ownerCf) return true
  if (ft.heroes && ft.heroes.length) {
    return ft.heroes.every((n) => bases.indexOf(n) >= 0)
  }
  if (ft.number) {
    const cnt = bases.filter((b) => b !== ownerBase && baseQuality(b) === 5).length
    return cnt >= ft.number
  }
  return false
}
// 当前已激活的羁绊（明细）
// 客户端口径（game.js caculateFetter）：羁绊挂在拥有者卡面上，激活后加成归拥有者自己；
// 互为搭档的英雄各自持有一条同名羁绊 → 双方都吃到。按（英雄, 羁绊id）逐条返回，不去重。
function activeFetters(names) {
  const bases = names.map(nameBase)
  const act = []
  // 按「完整名」取英雄自身版本的羁绊表（黄金甲/飞仙等异画版本的羁绊数值高于普通版）
  names.forEach((full) => {
    const bn = nameBase(full)
    const h = heroByName[full] || heroByBase[bn]
    if (!h) return
    const seenH = {}
    ;(h.fetters || []).forEach((ft) => {
      if (!fetterActive(ft, bn, bases, h.cf)) return
      if (seenH[ft.id]) return
      seenH[ft.id] = 1
      act.push({ id: ft.id, name: ft.name, members: ft.heroes && ft.heroes.length ? ft.heroes : null, holder: bn, effect: ft.effect || '' })
    })
  })
  return act
}

// 阵营效果（teamBuff 表）：同阵营 n 人 → 全体上阵英雄武力智力 +pct，封顶10人，多阵营叠加
// 表内 pct 0.4~1.8 的实际含义是 4%~18%（游戏内截图/规则：3人4%…6人7%、7人9%、8人12%、9人15%、10人18%）
const BUFF = {}
teamBuffData.forEach((t) => { BUFF[t.n] = t.pct / 10 })
function eraBuffPct(cnt) {
  if (cnt < 3) return 0
  return BUFF[Math.min(cnt, 10)] || 0
}

// ============ 技能文本效果解析引擎 ============
// 可量化（确定性）：
//   1) 数值增减："我方后排:智力+8%"、"敌军男性英雄:武力智力-7%"、"60%概率自身:武力+3"
//   2) 端点钉选："我方武力最高的3名英雄:武力必定取最大值"、"我军前排英雄武力必定取最大值"
//      → 先把目标区间两端钉到上限（或下限），再叠加其他百分比，得到被压缩后的新区间
//   3) 性别/名次定向："我方异性:…"、"我方武力最高的3名女性:武力+30%"（按区间中点选出目标）
//   4) 数量公式："我方男性武力、智力:增加（4+男性数量*0.3）%"
//   5) 控制类："…:技能无效"（目标技能加成不计）、"…:不受技能负面效果影响"、"受到的技能负面效果-20%"
// 仅以下进入 unq 不计战力：真随机目标（随机N名中的具体命中）、"必定出战"等非数值机制。
// 神兽技能文案会带「技能名：」前缀（如"凶神临：穷奇释放凶兽威压，我军前排…"）。
// 前缀不是作用域，直接剥掉；但"自身:武力+15%"里的"自身"是作用域，不能剥。
const TARGET_KW = /我方|我军|敌方|敌军|自身|自己|全体|全军|所有|随机|前排|中排|后排|号位|下一位置|同位置|最高|最低|男性|女性|异性|同性|拥有/
function stripLabel(t) {
  const m = t.match(/^([^：:]{1,8})[：:]/)
  if (!m) return t
  if (TARGET_KW.test(m[1])) return t
  const rest = t.slice(m[0].length)
  return /我方|我军|敌方|敌军|自身|武力|智力|前排|中排|后排|随机|号位|下一位置|同位置|拥有|男性|女性/.test(rest) ? rest : t
}

function parseDesc(text) {
  const out = []
  const unq = []
  if (!text) return { out, unq }
  String(text).split(/[\n;；]/).forEach((line) => {
    if (!line.trim()) return
    // 整句解析：游戏文案里"随机N名敌方英雄""我方随机3名"这类限定词必须与作用域同句，
    // 否则拆分后阵营/随机性会丢失（全库 723 行中无一行真的包含两个并列作用域）
    const sub = stripLabel(line.trim())
    const eff = parseClause(sub)
    if (eff) {
      eff.raw = sub
      out.push(eff)
    } else if (/武力|智力/.test(sub)) {
      unq.push(sub)
    }
  })
  return { out, unq }
}

function sideOf(s) {
  if (/双方/.test(s)) return 'both'
  return /(敌方|敌军)/.test(s) ? 'enemy' : 'own'
}
// 属性口径：出现"武力+智力"（或"武力、智力"/"武力智力"）= fi
function attrOf(s) {
  const f = /武力/.test(s)
  const i = /智力/.test(s)
  if (f && i) return 'fi'
  return i ? 'i' : f ? 'f' : 'fi'
}
function scopeOf(s) {
  const ci = s.search(/[:：]/)
  return ci >= 0 ? s.slice(0, ci) : s
}
function attrPartOf(s) {
  const ci = s.search(/[:：]/)
  return ci >= 0 ? s.slice(ci + 1) : s
}
// 作用域 → 选取方式（性别、名次、排、全体等可组合）
function parseSel(scopePart) {
  let row = null
  const rm = scopePart.match(/(前排|中排|后排)/)
  if (rm) row = ROW_MAP[rm[1]]
  let gender = null
  const gm = scopePart.match(/(男性|女性|异性|同性)/)
  if (gm) gender = gm[1] === '男性' ? 1 : gm[1] === '女性' ? 2 : gm[1] === '异性' ? 'opp' : 'same'
  let m
  if (/自身|自己/.test(scopePart)) return { kind: 'self' }
  if ((m = scopePart.match(/最(?:高|低)的?\s*(\d+)\s*[名位]/))) {
    const attrText = scopePart.replace(/最(?:高|低)的?\s*\d+\s*[名位]/, '')
    return {
      kind: 'top',
      attr: attrOf(attrText),
      n: parseInt(m[1], 10),
      gender: gender === 'opp' || gender === 'same' ? null : gender,
      row,
      low: /最低/.test(scopePart),
    }
  }
  // 未写数量的"武力最高的英雄"= 单名
  if (/最(?:高|低)的?(?:英雄|武将)/.test(scopePart)) {
    return {
      kind: 'top',
      attr: attrOf(scopePart.replace(/最(?:高|低)的?(?:英雄|武将)/, '')),
      n: 1,
      gender: gender === 'opp' || gender === 'same' ? null : gender,
      row,
      low: /最低/.test(scopePart),
    }
  }
  // 下一位置 = 号位 +1（实测：1号位 buff 2号位；18号位无下一位置，不回到 1号位）
  if (/下一位置/.test(scopePart)) return { kind: 'next', gender }
  if ((m = scopePart.match(/随机\s*(\d+)\s*[名位]/))) return { kind: 'random', n: parseInt(m[1], 10), row, gender }
  // 号位：截图规则 前排=1,4,7,10,13,16 / 中排=2,5,8,11,14,17 / 后排=3,6,9,12,15,18（每竖列 3 个号位）
  const sm2 = scopePart.match(/(\d+(?:\s*[、，,]\s*\d+)+|\d+)\s*号位/)
  if (sm2) {
    const nos = sm2[1].split(/[、，,\s]+/).map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= 18)
    if (nos.length) return { kind: 'slots', nos, gender }
  }
  // 拥有"XX"技能的英雄（军师技系列：龙胆/统帅/涅槃/隐刃等，按英雄技能名判定）
  const km = scopePart.match(/拥有[“"']?([^”"'：:的]{1,6})[”"']?(?:技能)?的英雄/)
  if (km) return { kind: 'skillName', sname: km[1], gender }
  if (/同位置/.test(scopePart)) return { kind: 'holderRow', gender }
  if (/全体|全军|所有/.test(scopePart)) return { kind: 'all', gender }
  if (gender !== null) return { kind: 'gender', g: gender }
  if (row) return { kind: 'row', row }
  return { kind: 'plain' } // 无作用域（如羁绊 "武力+40%"，由羁绊成员解析时指定目标）
}

// 端点钉选：必定取最大值 / 最小值（把目标区间压成单点，再叠加其他百分比）
function parsePin(s, side, prob) {
  const mode = /必定取最大值/.test(s) ? 'max' : 'min'
  return { type: 'pin', side, sel: parseSel(scopeOf(s)), mode, attrs: [{ a: attrOf(attrPartOf(s)) }], prob }
}

function parseClause(sub) {
  let s = sub
  let prob = 1
  const pm = s.match(/^(\d+(?:\.\d+)?)%概率/)
  if (pm) { prob = parseFloat(pm[1]) / 100; s = s.slice(pm[0].length) }
  const side = sideOf(s)
  // 1) 端点钉选
  if (/必定取最[大小]值/.test(s)) return parsePin(s, side, prob)
  // 2) 技能无效（目标英雄的技能加成不计）；随机N名按命中概率折算（期望值），无作用域才无法定位
  if (/技能无效/.test(s)) {
    const sel = parseSel(scopeOf(s))
    if (sel.kind === 'plain') return null
    return { type: 'silence', side, sel, prob }
  }
  // 3) 负面效果免疫 / 减免
  if (/不受.{0,10}负面效果影响/.test(s)) {
    const sel = parseSel(scopeOf(s))
    if (sel.kind === 'plain') return null
    return { type: 'immune', side, sel, prob }
  }
  // 3b) 受到（所有）技能加成/负面效果 ±X%：增益放大/衰减、负面加重/减免
  const amp = s.match(/受到(?:所有)?技能(加成|负面)效果\s*([+\-＋−])\s*(\d+(?:\.\d+)?)\s*%/)
  if (amp) {
    const sel = parseSel(scopeOf(s))
    if (sel.kind === 'plain') return null
    const v = ((amp[2] === '+' || amp[2] === '＋') ? 1 : -1) * parseFloat(amp[3]) / 100
    return { type: 'amp', side, sel, prob, amp: amp[1] === '加成' ? 'buff' : 'neg', v }
  }
  const rs = s.match(/受到的?技能负面效果\s*([+\-＋−])\s*(\d+(?:\.\d+)?)\s*%/)
  if (rs) {
    const sel = parseSel(scopeOf(s))
    if (sel.kind === 'plain') return null
    const v = parseFloat(rs[2]) / 100
    if (rs[1] === '+' || rs[1] === '＋') {
      // 受到负面效果 +X%：等于削弱，按减益处理
      return { type: 'buff', side, sel, prob, attrs: [{ a: 'fi', v: -v, pct: true }] }
    }
    return { type: 'resist', side, sel, v, prob }
  }
  // 4) 数量公式："增加（4+男性数量*0.3）%"
  const dm = s.match(/[（(]\s*(\d+(?:\.\d+)?)\s*\+\s*(男性|女性|异性)数量\s*[*×]\s*(\d+(?:\.\d+)?)\s*[）)]\s*%/)
  if (dm) {
    const sign = /减少|降低/.test(s) ? -1 : 1
    return {
      type: 'buff',
      side,
      sel: parseSel(scopeOf(s)),
      prob,
      attrs: [{ a: 'fi', v: 0, pct: true }],
      dyn: { base: parseFloat(dm[1]), gender: dm[2] === '男性' ? 1 : dm[2] === '女性' ? 2 : 'opp', k: parseFloat(dm[3]), sign },
    }
  }
  // 6) 军师技相关（众生平等计入军师技：等级由双方后排智力比值决定）
  const ab = s.match(/我方军师技[::]?\s*效果\s*\+\s*(\d+(?:\.\d+)?)\s*%/)
  if (ab) return { type: 'schemeBoost', side: 'own', v: parseFloat(ab[1]) / 100, prob, sel: { kind: 'none' } }
  const wk = s.match(/敌军的?军师技效果\s*-\s*(\d+(?:\.\d+)?)\s*%/)
  if (wk) return { type: 'schemeWeaken', side: 'enemy', v: parseFloat(wk[1]) / 100, prob, sel: { kind: 'none' } }
  if (/无视敌军的?军师技/.test(s)) {
    const sel = parseSel(scopeOf(s))
    // 无作用域 = 仅持有者自身免疫
    return { type: 'schemeImmune', side: 'own', sel: sel.kind === 'plain' ? { kind: 'self' } : sel, prob }
  }
  // 7) 常规数值增减
  const sel = parseSel(scopeOf(s))
  const attrs = []
  const re = /(武力和智力|武力、智力|武力智力|智力|武力)\s*([+＋\-−])\s*(\d+(?:\.\d+)?)\s*(%?)/g
  const attrPart = attrPartOf(s)
  let am
  while ((am = re.exec(attrPart)) !== null) {
    const tok = am[1]
    const a = tok.indexOf('智力') >= 0 && tok.indexOf('武力') >= 0 ? 'fi' : tok.indexOf('智力') >= 0 ? 'i' : 'f'
    let v = parseFloat(am[3])
    if (am[4]) v = v / 100
    if (am[2] === '-' || am[2] === '−') v = -v
    attrs.push({ a, v, pct: !!am[4] })
  }
  if (!attrs.length) return null
  return { type: 'buff', side, sel, attrs, prob }
}

const avgF = (u) => (u.baseFmin + u.baseFmax) / 2
const avgI = (u) => (u.baseImin + u.baseImax) / 2

// 把效果的作用域解析为具体单位集合；随机选取返回覆盖比例 scale（按期望折算）
function resolvePool(eff, units, holderUnit) {
  if (eff.forceTargets) return { pool: eff.forceTargets.slice(), scale: 1 }
  const heroes = units.filter((u) => u.kind === 'hero')
  const sel = eff.sel || { kind: 'plain' }
  const gf = (arr) => {
    if (sel.gender === undefined || sel.gender === null) return arr
    if (sel.gender === 'opp' || sel.gender === 'same') {
      if (!holderUnit || !holderUnit.gender) return []
      return arr.filter((u) => (sel.gender === 'opp' ? u.gender !== holderUnit.gender : u.gender === holderUnit.gender))
    }
    return arr.filter((u) => u.gender === sel.gender)
  }
  const byRow = (arr) => (sel.row ? arr.filter((u) => u.row === sel.row) : arr)
  if (sel.kind === 'self') return { pool: holderUnit ? [holderUnit] : [], scale: 1 }
  if (sel.kind === 'holderRow') return { pool: gf(holderUnit && holderUnit.kind === 'hero' ? heroes.filter((u) => u.row === holderUnit.row) : heroes), scale: 1 }
  if (sel.kind === 'all') return { pool: gf(eff.includePet ? units : heroes), scale: 1 }
  if (sel.kind === 'row') return { pool: gf(heroes.filter((u) => u.row === sel.row)), scale: 1 }
  // 号位 → 槽位（号位 1/4/7…=前排、2/5/8…=中排、3/6/9…=后排）
  if (sel.kind === 'slots') {
    return { pool: gf(heroes.filter((u) => sel.nos.indexOf(slotNoOf(u.slotIdx, u.row)) >= 0)), scale: 1 }
  }
  // 下一位置：持有者号位 +1 的那一格（1→2→3 横向跨排；18号位无下一位置，实测不回到 1号位）
  if (sel.kind === 'next') {
    if (!holderUnit || holderUnit.slotIdx === undefined || holderUnit.slotIdx === null) return { pool: [], scale: 1 }
    const no = slotNoOf(holderUnit.slotIdx, holderUnit.row) + 1
    if (no > 18) return { pool: [], scale: 1 }
    return { pool: gf(heroes.filter((u) => slotNoOf(u.slotIdx, u.row) === no)), scale: 1 }
  }
  // 拥有"XX"技能的英雄（按英雄技能名匹配）
  if (sel.kind === 'skillName') {
    return {
      pool: gf(heroes.filter((u) => {
        const h = heroesMap[u.id]
        const sn = (h && h.skill && h.skill.name) || ''
        return sn.indexOf(sel.sname) >= 0
      })),
      scale: 1,
    }
  }
  if (sel.kind === 'gender') {
    if (sel.g === 'opp' || sel.g === 'same') {
      if (!holderUnit || !holderUnit.gender) return { pool: [], scale: 1 }
      return { pool: heroes.filter((u) => (sel.g === 'opp' ? u.gender !== holderUnit.gender : u.gender === holderUnit.gender)), scale: 1 }
    }
    return { pool: heroes.filter((u) => u.gender === sel.g), scale: 1 }
  }
  if (sel.kind === 'top') {
    const arr = gf(byRow(heroes))
    const key = sel.attr === 'f' ? avgF : sel.attr === 'i' ? avgI : (u) => avgF(u) + avgI(u)
    arr.sort((a, b) => (sel.low ? key(a) - key(b) : key(b) - key(a)))
    return { pool: arr.slice(0, sel.n), scale: 1 }
  }
  if (sel.kind === 'random') {
    const scope = gf(byRow(heroes))
    if (!scope.length) return { pool: [], scale: 1 }
    return { pool: scope, scale: Math.min(1, sel.n / scope.length) }
  }
  return { pool: [], scale: 1 }
}

// "4+男性数量*0.3" 这类随人数变化的百分比
function dynValue(dyn, units, holderUnit) {
  let list = units.filter((u) => u.kind === 'hero')
  if (dyn.gender === 'opp') {
    if (!holderUnit || !holderUnit.gender) return 0
    list = list.filter((u) => u.gender !== holderUnit.gender)
  } else {
    list = list.filter((u) => u.gender === dyn.gender)
  }
  return (dyn.sign * (dyn.base + list.length * dyn.k)) / 100
}

// 应用效果：pin 先改端点；incoming=true 时按免疫/减免削弱敌方负面
// mult：效果强度系数（被"技能无效"命中的技能按残留概率折算）
function applyEffect(eff, units, holderUnit, incoming, mult) {
  if (!eff) return
  const m = mult === undefined ? 1 : mult
  if (eff.type === 'pin') {
    const { pool } = resolvePool(eff, units, holderUnit)
    // 只记录"要取哪一端"+强度（概率型禁用时按残留概率做端点插值），结算时基于原始区间
    pool.forEach((u) => {
      eff.attrs.forEach((at) => {
        if (at.a !== 'i') { u.pinF = eff.mode; u.pinFp = m }
        if (at.a !== 'f') { u.pinI = eff.mode; u.pinIp = m }
      })
    })
    return
  }
  if (eff.type === 'resist') {
    const { pool, scale } = resolvePool(eff, units, holderUnit)
    const cov = eff.prob * (scale === undefined ? 1 : scale) * m
    if (cov <= 0) return
    pool.forEach((u) => { u.negResist = Math.max(u.negResist || 0, eff.v * cov) })
    return
  }
  // 受到技能加成/负面效果 ±X%：随机N名按覆盖比例折算成该英雄整体的放大/衰减系数
  if (eff.type === 'amp') {
    const { pool, scale } = resolvePool(eff, units, holderUnit)
    const cov = eff.prob * (scale === undefined ? 1 : scale) * m
    if (cov <= 0) return
    pool.forEach((u) => {
      if (eff.amp === 'buff') u.buffAmp = Math.max(0.1, (u.buffAmp === undefined ? 1 : u.buffAmp) + eff.v * cov)
      else u.negTaken = (u.negTaken || 0) + eff.v * cov
    })
    return
  }
  if (eff.type === 'immune') {
    // 概率/随机命中 → 按免疫概率折算（不再是布尔全免疫）
    const { pool, scale } = resolvePool(eff, units, holderUnit)
    const cov = Math.min(1, eff.prob * (scale === undefined ? 1 : scale) * m)
    if (cov <= 0) return
    pool.forEach((u) => { u.immuneNeg = Math.max(u.immuneNeg || 0, cov) })
    return
  }
  if (eff.type === 'schemeImmune') {
    const { pool, scale } = resolvePool(eff, units, holderUnit)
    // 随机N名按期望覆盖比例折算（scale = N/总数）
    const cov = eff.prob * (scale === undefined ? 1 : scale) * m
    if (cov <= 0) return
    pool.forEach((u) => { u.schemeImmune = Math.max(u.schemeImmune || 0, cov) })
    return
  }
  if (eff.type === 'silence') return // 在 computeSide 中统一处理
  if (eff.type === 'schemeBoost' || eff.type === 'schemeWeaken') return // 在 buildScheme 中统一结算
  const { pool, scale } = resolvePool(eff, units, holderUnit)
  if (!pool.length) return
  pool.forEach((u) => {
    eff.attrs.forEach((at) => {
      let v = eff.dyn ? dynValue(eff.dyn, units, holderUnit) : at.v
      v = v * scale * eff.prob * m
      if (incoming && v < 0) {
        // 免负面只挡「英雄技能」负面（314458 实测：大音希声免伤的盘古仍被军师技历史修正命中 -306）
        if (u.immuneNeg && eff.holder && eff.holder.kind !== 'pet') v = v * (1 - u.immuneNeg)
        v = v * (1 - (u.negResist || 0))
        v = v * (1 + (u.negTaken || 0))
        if (eff.fromScheme && u.schemeImmune) v = v * (1 - u.schemeImmune) // 无视敌军军师技效果
      }
      if (!incoming && v > 0 && u.buffAmp !== undefined) v = v * u.buffAmp // 受到技能加成效果±X%
      if (at.pct) {
        // 效果分两类（314458 全技能日志 18 图逐项定案）：
        //   被动（羁绊/阵营效果，无 holder 或 src=阵营效果）：构成「进场态」。
        //     羁绊正pct→pf 加算（盘古4条+50/+50/+60/+70% 加算3.30×，连乘6.12×实测否定）；
        //     阵营效果正pct→pfm 乘算（×1.207）；负面→dfm/dim 乘算。
        //   战斗技能（英雄/神兽/阵容/军师技）：增量 = 参考值×pct 的【绝对增量】，
        //     参考值按阶段：英雄/神兽技=目标进场值（吴刚/花蕊同为+20%→同+125，铁证）；
        //     阵营技=阶段开始快照（破军40%×2003、骁勇13%×2003 互不叠加）；军师技=当前值（-306=10%×3062）。
        //     这里只累加 raw pct 到 apF/apI，参考值由结算端（静态 eff 公式 / battleSim）按阶段取。
        // 被动 = 羁绊（无 holder/src）与阵营效果（src=阵营效果）；阵容技能(src=阵容技能)/军师技(fromScheme)/英雄神兽技(holder) 都是 active
        const passive = !eff.holder && !eff.fromScheme && (!eff.src || eff.src === '阵营效果')
        if (!passive) {
          if (at.a !== 'i') u.apF = (u.apF || 0) + v
          if (at.a !== 'f') u.apI = (u.apI || 0) + v
        } else if (v < 0) {
          if (at.a !== 'i') u.dfm = (u.dfm === undefined ? 1 : u.dfm) * Math.max(0, 1 + v)
          if (at.a !== 'f') u.dim = (u.dim === undefined ? 1 : u.dim) * Math.max(0, 1 + v)
        } else if (eff.src === '阵营效果') {
          if (at.a !== 'f') u.pim = (u.pim === undefined ? 1 : u.pim) * Math.max(0, 1 + v)
          if (at.a !== 'i') u.pfm = (u.pfm === undefined ? 1 : u.pfm) * Math.max(0, 1 + v)
        } else {
          // 羁绊正百分比：同英雄内「加算」合并成一乘数（进场态实测定案）
          if (at.a !== 'i') u.pf += v
          if (at.a !== 'f') u.pi += v
        }
      } else {
        // 固定值：被动（羁绊）进进场层内；战斗技能为绝对增量
        const passive = !eff.holder && !eff.fromScheme && (!eff.src || eff.src === '阵营效果')
        if (passive) {
          if (at.a !== 'i') u.df += v
          if (at.a !== 'f') u.di += v
        } else {
          if (at.a !== 'i') u.afF = (u.afF || 0) + v
          if (at.a !== 'f') u.afI = (u.afI || 0) + v
        }
      }
    })
  })
}

// ============ 单侧阵容的完整收集与计算 ============
function collectSide(slots, petLv) {
  const units = []
  slots.forEach((s) => {
    if (!s.unit) return
    const u = s.unit
    const fMin = u.forceMin !== undefined ? u.forceMin : u.force
    const fMax = u.forceMax !== undefined ? u.forceMax : u.force
    const iMin = u.iqMin !== undefined ? u.iqMin : u.iq
    const iMax = u.iqMax !== undefined ? u.iqMax : u.iq
    if (u.kind === 'pet') {
      units.push({ kind: 'pet', id: u.id, name: u.name, row: s.col, slotIdx: s.idx, baseFmin: fMin, baseFmax: fMax, baseImin: iMin, baseImax: iMax, gender: 0, era: '', pf: 0, pi: 0, df: 0, di: 0, inheritF: u.inheritF || 0, inheritI: u.inheritI || 0 })
    } else {
      const h = heroesMap[u.id]
      units.push({ kind: 'hero', id: u.id, name: u.name, row: s.col, slotIdx: s.idx, baseFmin: fMin, baseFmax: fMax, baseImin: iMin, baseImax: iMax, gender: h ? h.gender : 0, era: h ? h.era : '', pf: 0, pi: 0, df: 0, di: 0 })
    }
  })
  const heroUnits = units.filter((u) => u.kind === 'hero')
  const effects = []
  const detail = { fetters: [], eraBuffs: [], eraSkills: [], skillLabels: [], petLabels: [], petSkillTiers: [], petLv: 0, petName: '', enemyDebuffs: [], unq: [], pinTags: [], ctrlTags: [] }

  const pushUnq = (tag) => {
    if (detail.unq.indexOf(tag) < 0 && detail.unq.length < 30) detail.unq.push(tag)
  }
  // 英雄技能（plain 类无作用域 → 记为未量化）
  heroUnits.forEach((u) => {
    const h = heroesMap[u.id]
    const r = parseDesc(h && h.skill && h.skill.desc)
    r.out.forEach((e) => {
      if (!e.sel) e.sel = { kind: 'plain' }
      if (e.sel.kind === 'plain') { pushUnq(u.name + '：' + e.raw); return }
      e.holder = u
      effects.push(e)
      let tag = u.name + '：' + e.raw
      // 下一位置类：标注实际命中的号位（号位+1；18号位无下一位置），便于核对
      if (e.sel.kind === 'next') {
        const myNo = slotNoOf(u.slotIdx, u.row)
        tag += myNo >= 18 ? '（' + myNo + '号位 · 无下一位置）' : '（' + myNo + '号位 → ' + (myNo + 1) + '号位）'
      }
      // 随机 N 名：按期望值折算（不是未量化）
      if (e.sel.kind === 'random') tag += '（随机' + e.sel.n + '名 · 按期望折算）'
      if (detail.skillLabels.indexOf(tag) < 0 && detail.skillLabels.length < 20) detail.skillLabels.push(tag)
    })
    r.unq.forEach((t) => pushUnq(u.name + '：' + t))
  })
  // 神兽技能
  const petUnit = units.filter((u) => u.kind === 'pet')[0]
  if (petUnit) {
    const p = petAll.filter((x) => x.id === petUnit.id)[0]
    // 口径：按神兽实际等级取技能档位；我方/敌方等级分开设置（PET_LV = 我方默认值）
    const plv = petLv === undefined ? PET_LV : normPetLv(petLv)
    const tiers = petSkillTiers(p, plv)
    const text = tiers.map((t) => t.text).join('\n')
    const r = parseDesc(text)
    r.out.forEach((e) => {
      if ((e.sel || {}).kind === 'plain') { pushUnq(petUnit.name + '：' + e.raw); return }
      e.holder = petUnit
      effects.push(e)
      const tag = petUnit.name + ' Lv' + plv + '：' + e.raw + (e.sel.kind === 'random' ? '（随机' + e.sel.n + '名 · 按期望折算）' : '')
      if (detail.petLabels.indexOf(tag) < 0 && detail.petLabels.length < 10) detail.petLabels.push(tag)
    })
    r.unq.forEach((t) => pushUnq(petUnit.name + '：' + t))
    detail.petLv = plv
    detail.petName = petUnit.name
    detail.petSkillTiers = tiers.map((t) => ({ name: t.name, label: 'Lv' + t.tier + '/' + t.tiers, need: t.need, text: t.text }))
  }
  // 羁绊（客户端口径：加给羁绊拥有者自己，搭档全部在场才激活；互为搭档的双方各自持有一条、各自吃到）
  const act = activeFetters(heroUnits.map((u) => u.name))
  const fetterPct = {} // nameBase → {f,i} 该英雄身上激活羁绊的百分比合计（神兽继承要用）
  const ftSeen = {}
  act.forEach((ft) => {
    const holderU = heroUnits.filter((u) => nameBase(u.name) === ft.holder)[0]
    if (!holderU) return
    const cfHolder = !!((heroByName[ft.holder] || heroByBase[ft.holder] || {}).cf)
    const dKey = ft.name + '|' + ft.effect
    if (!ftSeen[dKey]) {
      ftSeen[dKey] = 1
      detail.fetters.push({ name: ft.name, members: ft.members ? '与' + ft.members.join('、') : '', effect: ft.effect, holders: ft.holder + (cfHolder ? '（共鸣·满羁绊）' : '') })
    } else {
      detail.fetters.forEach((d) => { if (d.name === ft.name && d.effect === ft.effect) d.holders += '、' + ft.holder + (cfHolder ? '（共鸣·满羁绊）' : '') })
    }
    const r = parseDesc(ft.effect)
    let fp = 0, ip = 0
    r.out.forEach((e2) => {
      ;(e2.attrs || []).forEach((a) => {
        if (!a.pct || !a.v) return
        if (a.a !== 'i') fp += a.v
        if (a.a !== 'f') ip += a.v
      })
    })
    if (fp || ip) {
      fetterPct[ft.holder] = fetterPct[ft.holder] || { f: 0, i: 0 }
      fetterPct[ft.holder].f += fp
      fetterPct[ft.holder].i += ip
    }
    r.out.forEach((e2) => {
      e2.forceTargets = [holderU]
      e2.fetter = true // 羁绊：同英雄多条之间按「加算」合并（见 applyEffect）
      effects.push(e2)
    })
    r.unq.forEach((t) => pushUnq('羁绊·' + ft.name + '：' + t))
  })
  // 神兽继承（官方规则截图 + 实战对账定案）：
  //   武力继承 = 同排英雄武力之和 × 宠物武力继承系数；智力同理。
  //   神兽自身【没有】武力智力（用户确认），完全来自继承；系数 = inherit/100（帝江/饕餮均 85/28）。
  //   314458 反推验证：防守前排 13743 = 1.5 × (Σ前排英雄终局 4952 + 0.85×4952) × 1.2(王座)，误差 0.01%。
  //   池 = 同排英雄【终局】武力（含羁绊/阵营/技能与减益后的当前值），故在 computeSide 效果结算完后执行。
  // 阵营效果 + 阵容技能（时代技能）
  // 客户端权威实现（game.js caculateZhenYingBuff + findMainEra）：
  //   1) 巅峰英雄（内部枚举 westernChu）单独分组，不直接参与计数；
  //   2) findMainEra：并入人数最多的非巅峰阵营；平局时按号位 1→18 顺序扫描（slotIdx 升序），
  //      第一个属于平局阵营的英雄所在阵营胜出（314458 实测：商[华胥氏后1] 胜 五代十国[蚩尤前6] → 商×3 惑心 ✓）；
  //   3) 合并后按「合并人数」取 buff 档位与技能档位（eraBuffRecords.get(合并数)、最大 tier≤人数）：
  //      314458 防守方 隋6+巅峰4=隋×10 → 破军 tier10 +40%（实测 +801=40%×2003 ✓）。
  const rawEra = {}
  heroUnits.forEach((u) => { (rawEra[u.era] = rawEra[u.era] || []).push(u) })
  const peakList = rawEra['巅峰'] || []
  delete rawEra['巅峰']
  const eraCnt = {}
  Object.keys(rawEra).forEach((e) => { eraCnt[e] = rawEra[e].length })
  if (peakList.length && Object.keys(rawEra).length > 0) {
    let best = 0
    const tied = []
    Object.keys(rawEra).forEach((e) => {
      const c = rawEra[e].length
      if (c > best) { best = c; tied.length = 0; tied.push(e) }
      else if (c === best) tied.push(e)
    })
    let mainEra = null
    if (tied.length === 1) mainEra = tied[0]
    else {
      const byPos = heroUnits.slice().sort((a, b) => a.slotIdx - b.slotIdx)
      for (const u of byPos) {
        if (u.era !== '巅峰' && tied.indexOf(u.era) >= 0) { mainEra = u.era; break }
      }
      if (!mainEra) mainEra = tied[0]
    }
    eraCnt[mainEra] += peakList.length
    detail.eraPeakMerge = '巅峰×' + peakList.length + ' 并入 ' + mainEra + ' → ' + mainEra + '×' + eraCnt[mainEra] +
      (tied.length > 1 ? '（平局按号位先后判定）' : '')
  }
  let totalBuff = 0
  const eraLines = []
  const eraSkillObjs = []
  Object.keys(eraCnt).sort((a, b) => eraCnt[b] - eraCnt[a]).forEach((e) => {
    const c = eraCnt[e]
    if (c < 3) return
    const pct = eraBuffPct(c)
    if (pct > 0) {
      detail.eraBuffs.push(e + '×' + c + '：全体武力智力+' + Math.round(pct * 100) + '%')
      eraLines.push({ era: e, n: c, pct: Math.round(pct * 100), note: '' })
      totalBuff += pct
      // 阵营效果实际计入战力（含神兽）
      effects.push({ side: 'own', sel: { kind: 'all' }, includePet: true, attrs: [{ a: 'fi', v: pct, pct: true }], prob: 1, holder: null, raw: e + '阵营×' + c + '：全体+' + Math.round(pct * 100) + '%', src: '阵营效果' })
    }
    const tiers = [10, 6, 3]
    for (let i = 0; i < tiers.length; i++) {
      if (c >= tiers[i]) {
        const sk = eraSkillData.filter((s) => s.era === e && s.tier === tiers[i])[0]
        if (sk) {
          detail.eraSkills.push(e + '×' + c + ' ' + sk.name + '：' + sk.desc)
          eraSkillObjs.push({ label: e + '×' + c + ' ' + sk.name, desc: sk.desc })
          const r = parseDesc(sk.desc)
          r.out.forEach((eff) => {
            if ((eff.sel || {}).kind === 'plain') { pushUnq('阵容技能·' + sk.name + '：' + eff.raw); return }
            eff.holder = null
            eff.src = '阵容技能' // 实战流程：阵容技能在号位技能之后、先手方先全部释放
            effects.push(eff)
          })
          r.unq.forEach((t) => pushUnq('阵容技能·' + sk.name + '：' + t))
        }
        break
      }
    }
  })
  detail.eraLines = eraLines
  detail.totalBuffPct = Math.round(totalBuff * 100)
  detail.eraSkillObjs = eraSkillObjs
  return { units, heroUnits, petUnit, effects, detail, eraCnt }
}

// 主战/防守 +100%：实战核验（ID:314438，我方 8615 / 敌方 7381）反推，
// 游戏最终显示战力 = 技能结算后战力 × 2。军师技比值用双方后排中值，同乘不影响分档。
const FINAL_MULT = 2

// opt.trace：把每条效果「实际加到每个单位身上的增量」记下来（出手顺序推演要用）。
// 开 trace 时不再按「被沉默残留概率」打折己方技能 —— 沉默改由推演按号位顺序动态判定，
// 否则增量里会提前扣掉一次，推演里再扣一次。
function computeSide(collect, oppEffects, opt) {
  const { units, effects, detail, petUnit } = collect
  const inc = oppEffects || []
  const TRACE = opt && opt.trace
  const snapStates = () => units.map((u) => [u.pf, u.pi, u.df, u.di, u.dfm === undefined ? 1 : u.dfm, u.dim === undefined ? 1 : u.dim, u.pfm === undefined ? 1 : u.pfm, u.pim === undefined ? 1 : u.pim, u.apF || 0, u.apI || 0, u.afF || 0, u.afI || 0])
  const pushTrace = (e, before, incoming) => {
    const d = []
    units.forEach((u, i) => {
      const b = before[i]
      const bf = u.dfm === undefined ? 1 : u.dfm
      const bi = u.dim === undefined ? 1 : u.dim
      const bpf = u.pfm === undefined ? 1 : u.pfm
      const bpi = u.pim === undefined ? 1 : u.pim
      const it = { t: i, pf: u.pf - b[0], pi: u.pi - b[1], df: u.df - b[2], di: u.di - b[3], dfm: bf / b[4], dim: bi / b[5], pfm: bpf / b[6], pim: bpi / b[7], apF: (u.apF || 0) - b[8], apI: (u.apI || 0) - b[9], afF: (u.afF || 0) - b[10], afI: (u.afI || 0) - b[11] }
      if (it.pf || it.pi || it.df || it.di || Math.abs(it.dfm - 1) > 1e-9 || Math.abs(it.dim - 1) > 1e-9 || Math.abs(it.pfm - 1) > 1e-9 || Math.abs(it.pim - 1) > 1e-9 || it.apF || it.apI || it.afF || it.afI) d.push(it)
    })
    if (d.length) TRACE.push({ e: e, d: d, incoming: !!incoming })
  }
  // 对方「技能无效」：命中者自身技能按残留概率折算（随机N名 → 命中概率 = 概率 × n/该排人数）
  inc.forEach((e) => {
    if (e.type !== 'silence') return
    if (e.side !== 'enemy' && e.side !== 'both') return
    const r = resolvePool(e, units, e.holder)
    const cov = Math.min(1, e.prob * (r.scale === undefined ? 1 : r.scale))
    if (cov <= 0) return
    r.pool.forEach((u) => {
      u.silenced = true
      u.silenceProb = Math.max(u.silenceProb || 0, cov)
    })
  })
  // 己方增益（羁绊 forceTargets 直通；其余按 sel 解析）；被沉默者的技能按残留概率计
  effects.forEach((e) => {
    if (e.side !== 'own' && e.side !== 'both') return
    let mult = 1
    if ((!TRACE || (opt && opt.keepSilence)) && e.holder && e.holder.silenced) {
      mult = 1 - (e.holder.silenceProb || 1)
      if (mult <= 0) return
    }
    const before = TRACE ? snapStates() : null
    // 记录增量时按「命中后」的满额算：概率留给推演每场独立 roll，否则会乘两次 p
    const pSave = e.prob
    if (TRACE && (!e.type || e.type === 'buff')) e.prob = 1
    applyEffect(e, units, e.holder, false, mult)
    if (TRACE && (!e.type || e.type === 'buff')) e.prob = pSave
    if (TRACE) pushTrace(e, before, false)
  })
  // 对方效果作用到我方（减益按免疫/减免折算；对方钉选也会压我方区间）
  detail.enemyDebuffs = []
  const snap = () => units.map((u) => u.pf + ':' + u.pi + ':' + u.pinF + ':' + u.pinI).join('|')
  inc.forEach((e) => {
    if (e.side !== 'enemy' && e.side !== 'both') return
    const before = snap()
    const beforeStates = TRACE ? snapStates() : null
    const pSave2 = e.prob
    if (TRACE && (!e.type || e.type === 'buff')) e.prob = 1
    applyEffect(e, units, e.holder, true)
    if (TRACE && (!e.type || e.type === 'buff')) e.prob = pSave2
    if (TRACE) pushTrace(e, beforeStates, true)
    const after = snap()
    if (before !== after && e.raw && detail.enemyDebuffs.indexOf(e.raw) < 0 && detail.enemyDebuffs.length < 12) detail.enemyDebuffs.push(e.raw)
  })
  // 明细：已按确定性量化计入的钉选 / 控制类效果
  const pinTags = []
  const ctrlTags = []
  const take = (list, wantOwn) => list.forEach((e) => {
    const isOwn = e.side === 'own' || e.side === 'both'
    const isInc = e.side === 'enemy' || e.side === 'both'
    if (wantOwn ? !isOwn : !isInc) return
    if (!e.raw) return
    if (e.type === 'pin' && pinTags.indexOf(e.raw) < 0) pinTags.push(e.raw)
    if ((e.type === 'silence' || e.type === 'immune' || e.type === 'resist' || e.type === 'amp' || e.type === 'schemeImmune') && ctrlTags.indexOf(e.raw) < 0) ctrlTags.push(e.raw)
  })
  take(effects, true)
  take(inc, false)
  detail.pinTags = pinTags
  detail.ctrlTags = ctrlTags
  // 生效区间与三排战力区间
  // 钉选：取最大值 → 上限锁死、下限按强度向最大值靠拢；取最小值反之
  units.forEach((u) => {
    // 进场态 E = (钉选区间 + 被动固定值) × 被动层；战斗技能增量 = E×Σpct + Σ固定值（绝对增量）
    const kf = (1 + u.pf) * (u.pfm === undefined ? 1 : u.pfm) * (u.dfm === undefined ? 1 : u.dfm)
    const ki = (1 + u.pi) * (u.pim === undefined ? 1 : u.pim) * (u.dim === undefined ? 1 : u.dim)
    const pinRange = (lo0, hi0, mode, p) => {
      const t = p === undefined ? 1 : Math.max(0, Math.min(1, p))
      if (mode === 'max') return [lo0 + (hi0 - lo0) * t, hi0]
      if (mode === 'min') return [lo0, hi0 - (hi0 - lo0) * t]
      return [lo0, hi0]
    }
    const fr = pinRange(u.baseFmin, u.baseFmax, u.pinF, u.pinFp)
    const ir = pinRange(u.baseImin, u.baseImax, u.pinI, u.pinIp)
    const kfA = Math.max(0, 1 + (u.apF || 0))
    const kiA = Math.max(0, 1 + (u.apI || 0))
    const cF1 = (fr[0] + u.df) * kf * kfA + (u.afF || 0)
    const cF2 = (fr[1] + u.df) * kf * kfA + (u.afF || 0)
    u.effFmin = Math.max(0, Math.min(cF1, cF2))
    u.effFmax = Math.max(0, Math.max(cF1, cF2))
    const cI1 = (ir[0] + u.di) * ki * kiA + (u.afI || 0)
    const cI2 = (ir[1] + u.di) * ki * kiA + (u.afI || 0)
    u.effImin = Math.max(0, Math.min(cI1, cI2))
    u.effImax = Math.max(0, Math.max(cI1, cI2))
  })
  // 神兽继承：神兽基础 = 同排英雄终局武力/智力之和 × 系数（inherit/100），覆盖自身底数
  if (petUnit && (petUnit.inheritF || petUnit.inheritI)) {
    const sumRow = (attr, skip) => {
      let sMin = 0, sMax = 0
      units.forEach((u) => {
        if (u === skip || u.row !== skip.row) return
        sMin += u['eff' + attr + 'min']
        sMax += u['eff' + attr + 'max']
      })
      return { min: sMin, max: sMax }
    }
    const fh = sumRow('F', petUnit)
    const ih = sumRow('I', petUnit)
    petUnit.baseFmin = (fh.min * (petUnit.inheritF || 0)) / 100
    petUnit.baseFmax = (fh.max * (petUnit.inheritF || 0)) / 100
    petUnit.baseImin = (ih.min * (petUnit.inheritI || 0)) / 100
    petUnit.baseImax = (ih.max * (petUnit.inheritI || 0)) / 100
    // 用新底数重算神兽的生效区间（它也吃阵营/技能的增减益，比值部分与新底数相乘）
    const kfP = (1 + petUnit.pf) * (petUnit.pfm === undefined ? 1 : petUnit.pfm)
    const kiP = (1 + petUnit.pi) * (petUnit.pim === undefined ? 1 : petUnit.pim)
    const dfmP = petUnit.dfm === undefined ? 1 : petUnit.dfm
    const dimP = petUnit.dim === undefined ? 1 : petUnit.dim
    petUnit.effFmin = Math.max(0, (petUnit.baseFmin + petUnit.df) * kfP * dfmP)
    petUnit.effFmax = Math.max(0, (petUnit.baseFmax + petUnit.df) * kfP * dfmP)
    petUnit.effImin = Math.max(0, (petUnit.baseImin + petUnit.di) * kiP * dimP)
    petUnit.effImax = Math.max(0, (petUnit.baseImax + petUnit.di) * kiP * dimP)
  }
  let fMin = 0, fMax = 0, mMin = 0, mMax = 0, bMin = 0, bMax = 0
  units.forEach((u) => {
    if (u.row === 'front') { fMin += u.effFmin * 1.5; fMax += u.effFmax * 1.5 }
    else if (u.row === 'mid') { mMin += u.effFmin + u.effImin; mMax += u.effFmax + u.effImax }
    else { bMin += u.effImin; bMax += u.effImax }
  })
  return {
    units,
    rows: {
      front: { min: Math.round(fMin * FINAL_MULT), max: Math.round(fMax * FINAL_MULT) },
      mid: { min: Math.round(mMin * FINAL_MULT), max: Math.round(mMax * FINAL_MULT) },
      back: { min: Math.round(bMin * FINAL_MULT), max: Math.round(bMax * FINAL_MULT) },
    },
    total: { min: Math.round((fMin + mMin + bMin) * FINAL_MULT), max: Math.round((fMax + mMax + bMax) * FINAL_MULT) },
    detail,
  }
}

// ============ 军师技（众生平等计入） ============
// 客户端考证（scripts game.js animalAdviser + scheme 表 triggerCodition）：
// 双方各自以后排智力总和（技能结算后）比较，更强的一方发动军师技；
// 等级 = 己方后排智力 / 敌方后排智力（千分比）落入区间：
//   [833,1000]=1级 万箭齐发 … [0,200)=8级 智商碾压（比值越大等级越低、效果越弱）
// 效果为对敌减益（L1-3 前排武力、L4-8 全体武力智力），explainBase/10 = 百分点；
// "我方军师技:效果+X%"增强己方军师技、"敌军的军师技效果-X%"削弱对方军师技、"无视敌军的军师技效果"免疫。
const SCHEME_TABLE = [
  { lv: 1, name: '万箭齐发', cond: [833, 1000], f: 4, i: 0 },
  { lv: 2, name: '赤壁烈焰', cond: [714, 833], f: 5, i: 0 },
  { lv: 3, name: '淝水风声', cond: [526, 714], f: 6, i: 0 },
  { lv: 4, name: '昆阳陨星', cond: [400, 526], f: 7, i: 7 },
  { lv: 5, name: '历史修正', cond: [333, 400], f: 10, i: 10 },
  { lv: 6, name: '长平深渊', cond: [250, 333], f: 15, i: 15 },
  { lv: 7, name: '如来神掌', cond: [200, 250], f: 20, i: 20 },
  { lv: 8, name: '智商碾压', cond: [0, 200], f: 30, i: 30 },
]

function resetUnits(units) {
  units.forEach((u) => {
    u.pf = 0; u.pi = 0; u.df = 0; u.di = 0
    u.dfm = 1; u.dim = 1 // 敌方百分比减益乘数（乘算，见 applyEffect）
    u.pfm = 1; u.pim = 1 // 神兽正百分比增益乘数（乘算，见 applyEffect）
    // 战斗技能增量（active）：pct 累加（增量=参考值×pct）+ 固定值累加（绝对增量）
    u.apF = 0; u.apI = 0; u.afF = 0; u.afI = 0
    u.pinF = undefined; u.pinI = undefined; u.pinFp = undefined; u.pinIp = undefined
    u.silenced = false; u.silenceProb = 0; u.negResist = 0; u.immuneNeg = false; u.schemeImmune = 0
    // 元修正也要清空，否则军师技重算的第二遍会把「增益放大/负面加重」再叠一次
    u.buffAmp = undefined; u.negTaken = 0
  })
}

// side：本方（可能是发动方）；opp：对方。返回 { effect, info }
function buildScheme(sideRes, oppRes, sideCol, oppCol, label) {
  const info = { has: false, label }
  const own = (sideRes.rows.back.min + sideRes.rows.back.max) / 2
  const opp = (oppRes.rows.back.min + oppRes.rows.back.max) / 2
  info.ownBack = Math.round(own)
  info.oppBack = Math.round(opp)
  if (own <= 0 || opp <= 0 || own < opp) return { info } // 后排无人 / 后排更弱 → 不发动
  // 比值 = 敌方后排智力 / 己方后排智力（千分比）：越接近 1000 双方越均势（低档弱效果），
  // 越小则我方碾压程度越高（高档强效果，如 5 倍碾压 → 200 → 8级 智商碾压）
  const ratio = Math.max(1, Math.round((opp / own) * 1000))
  const sc = ratio >= 1000 ? SCHEME_TABLE[0] : SCHEME_TABLE.filter((s) => ratio >= s.cond[0] && ratio < s.cond[1])[0] || SCHEME_TABLE[7]
  info.has = true
  info.lv = sc.lv
  info.name = sc.name
  info.ratio = ratio
  // 军师技效果加成/削弱（百分点）
  let add = 0
  ;(sideCol.effects || []).forEach((e) => {
    if (e.type !== 'schemeBoost' || (e.side !== 'own' && e.side !== 'both')) return
    let m = 1
    if (e.holder && e.holder.silenced) m = 1 - (e.holder.silenceProb || 1)
    add += e.v * e.prob * m
  })
  ;(oppCol.effects || []).forEach((e) => {
    if (e.type !== 'schemeWeaken' || (e.side !== 'enemy' && e.side !== 'both')) return
    add -= e.v * e.prob
  })
  info.addPct = Math.round(add * 100)
  const pf = Math.max(0, sc.f + add * 100)
  const pi = Math.max(0, (sc.i || 0) + add * 100)
  info.pf = Math.round(pf * 10) / 10
  info.pi = Math.round(pi * 10) / 10
  info.desc = '敌方' + (sc.i ? '全体' : '前排') + (sc.i ? '武力智力' : '武力') + '-' + info.pf + '%' + (sc.i && info.pi !== info.pf ? '/' + info.pi + '%' : '')
  if (pf <= 0 && pi <= 0) return { info } // 加成被完全抵消，无实际效果
  const attrs = []
  if (pf > 0) attrs.push({ a: 'f', v: -pf / 100, pct: true })
  if (pi > 0) attrs.push({ a: 'i', v: -pi / 100, pct: true })
  const effect = {
    type: 'buff',
    side: 'enemy',
    sel: sc.i ? { kind: 'all' } : { kind: 'row', row: 'front' },
    attrs,
    prob: 1,
    holder: null,
    raw: label + '军师技「' + sc.name + '」Lv' + sc.lv + '：' + info.desc,
    fromScheme: true,
  }
  return { effect, info }
}

function calcAll(model, petLvOurs, petLvEnemy) {
  // 我方/敌方神兽等级分开（不传时都按 PET_LV，兼容旧测试）
  const oursCol = collectSide(model.ours.slots, petLvOurs)
  const enemyCol = collectSide(model.enemy.slots, petLvEnemy)
  // 第一遍：不含军师技，得到双方后排智力（技能结算后）
  let ours = computeSide(oursCol, enemyCol.effects)
  let enemy = computeSide(enemyCol, oursCol.effects)
  // 军师技：后排智力更强一方发动，等级按比值定档；效果并入双方效果清单后重算
  const sOurs = buildScheme(ours, enemy, oursCol, enemyCol, '我方')
  const sEnemy = buildScheme(enemy, ours, enemyCol, oursCol, '敌方')
  if (sOurs.effect) oursCol.effects.push(sOurs.effect)
  if (sEnemy.effect) enemyCol.effects.push(sEnemy.effect)
  if (sOurs.effect || sEnemy.effect) {
    resetUnits(ours.units)
    resetUnits(enemy.units)
    ours = computeSide(oursCol, enemyCol.effects)
    enemy = computeSide(enemyCol, oursCol.effects)
  }
  ours.detail.scheme = sOurs.info
  enemy.detail.scheme = sEnemy.info
  const has = ours.units.length > 0 || enemy.units.length > 0
  let verdict = ''
  let kind = 'none'
  if (has) {
    if (ours.total.min > enemy.total.max) { verdict = '🛡️ 我方占优（区间不重叠）'; kind = 'ours' }
    else if (ours.total.max < enemy.total.min) { verdict = '⚔️ 敌方占优（区间不重叠）'; kind = 'enemy' }
    else { verdict = '⚖️ 区间重叠 · 互有胜负'; kind = 'overlap' }
  }
  return { ours, enemy, verdict, kind, has }
}

// ---------- 持久化 ----------
const STORE_KEY = 'xb-equal-lineup-v2'
// ============ 实战流程推演（口径来自解包客户端 game.js 的 battleDetail 回放） ============
//   0) 先手 = 基础战力（不含技能、含羁绊）更高的一方，相等才是攻方（我方）先手；
//      一方基础战力 ≥ 对方 2 倍 → 秒杀直接结算；
//   1) 被动：阵营效果 + 英雄羁绊，进场即生效；
//   2) 重置技能（钉选类）：号位 1→18 交替，先手方同号位先放；
//   3) 普通技能（增减益/控制）：号位 1→18 交替；
//   4) 阵容技能（时代技能）：先手方按号位顺序全放 → 后手方全放；
//   5) 军师技：比后排智力（技能结算后），只有胜方发动；
//   6) 单挑：50% 概率，前排武力最高者对决，败者武力 -50%；
//   7) 终局：全军冲锋比战力，高者胜。
// 顺序的意义全在「控制」：低号位先出手，控制（技能无效）打出去之后，
// 还没轮到的单位这一场的技能就放不出来；同号位相遇时，先手方才压得住后手方。
//
// 做法：静态结算时顺手把「每条效果实际加到每个单位身上的 pf/pi/df/di」记下来（trace），
// 战斗中按上面的流程真正发一遍，最后用与静态完全相同的公式算终局战力。
// 增量直接取自静态那一次结算，所以「全员都放出来」时终局战力与静态严格相等。

function idxOf(col, pool) {
  const map = new Map()
  col.units.forEach((u, i) => map.set(u, i))
  const out = []
  pool.forEach((u) => {
    const i = map.get(u)
    if (i !== undefined && out.indexOf(i) < 0) out.push(i)
  })
  return out
}

// trace → Map(effect → 增量数组)，incoming 区分「己方技能加自己」和「对方技能压自己」
function traceMap(trace, incoming) {
  const map = new Map()
  ;(trace || []).forEach((t) => {
    if (!!t.incoming !== !!incoming) return
    map.set(t.e, t.d)
  })
  return map
}

// 把一侧的全部效果整理成「谁的技能、在第几号位放、打到谁身上」
// ownMap: 效果 → 对本方单位的增量；foeMap: 效果 → 对敌方单位的增量（都来自静态 trace）
// 连携增量缩放：d 是静态 trace 的共享数组，复制一份再乘系数
function scaleDeltas(list, mult) {
  if (!mult || mult === 1) return list
  return list.map((d) => {
    const c = Object.assign({}, d)
    if (c.df) c.df *= mult
    if (c.di) c.di *= mult
    if (c.apF) c.apF *= mult
    if (c.apI) c.apI *= mult
    if (c.afF) c.afF *= mult
    if (c.afI) c.afI *= mult
    return c
  })
}

// 连携（replaceSkill）：带 rs 的赛博英雄，号位相邻（同行 |Δ|=3 / 同列 |Δ|=1 且同列）
// 有其他进化英雄（飞仙·/戏魂·/黄金甲·/赛博·）→ 技能替换为强化版（1.5 倍）
function lianXieMapOf(col) {
  const out = {}
  const slots = col.units.map((u) => slotNoOf(u.slotIdx, u.row))
  const evolved = col.units.map((u, i) => (isEvolved(u.name || '') ? slots[i] : 0)).filter(Boolean)
  col.units.forEach((u, i) => {
    if (u.kind !== 'hero') return
    const rec = heroesMap[u.id]
    if (!rec || !rec.rs) return
    const no = slots[i]
    const adj = evolved.some((n) => {
      if (n === no) return false
      const d = Math.abs(n - no)
      return d === 3 || (d === 1 && n % 3 === no % 3)
    })
    if (adj) out[i] = 1.5
  })
  return out
}

function sidePackets(col, foeCol, ownMap, foeMap) {
  const pkts = []
  const noOf = (u) => slotNoOf(u.slotIdx, u.row)
  const holderArg = (e) => {
    if (!e.holder) return null
    const hi = col.units.indexOf(e.holder)
    return hi >= 0 ? col.units[hi] : Object.assign({}, e.holder)
  }
  ;(col.effects || []).forEach((e) => {
    const from = e.holder ? col.units.indexOf(e.holder) : -1
    const slot = from >= 0 ? noOf(col.units[from]) : 0
    // 效果来源：fac=阵营/羁绊（被动）、pet=神兽技能、hero=英雄技能
    // （实战「不受英雄技能负面效果影响」只挡 hero 类，不挡神兽技能）
    const srcKind = !e.holder ? 'fac' : e.holder.kind === 'pet' ? 'pet' : 'hero'
    // 实战流程分相：被动(阵营/羁绊) → 号位钉选 → 号位技能 → 阵容技能 → 军师技
    const phase = e.fromScheme
      ? 'scheme'
      : e.src === '阵容技能'
        ? 'era'
        : e.src === '阵营效果' || from < 0
          ? 'passive'
          : undefined
    const toOwn = e.side === 'own' || e.side === 'both'
    const toFoe = e.side === 'enemy' || e.side === 'both'
    if (!toOwn && !toFoe) return
    // 1) 技能无效（沉默/控制）：命中后对方该单位本场剩余技能全废
    if (e.type === 'silence') {
      if (!toFoe) return
      const r = resolvePool(e, foeCol.units, holderArg(e))
      const hits = idxOf(foeCol, r.pool).map((t) => ({
        t: t,
        p: Math.max(0, Math.min(1, (e.prob === undefined ? 1 : e.prob) * (r.scale === undefined ? 1 : r.scale))),
      }))
      if (hits.length) pkts.push({ from: from, slot: slot, kind: 'silence', phase: phase || 'slot', hits: hits, tag: e.raw || '', srcKind: srcKind })
      return
    }
    // 1.5) 免负面（大音希声类）：命中后不受「英雄技能」负面效果影响（神兽技能负面不挡）
    if (e.type === 'immune') {
      const tgt = toFoe && !toOwn ? foeCol : col
      const r = resolvePool(e, tgt.units, holderArg(e))
      const hits = idxOf(tgt, r.pool).map((t) => ({
        t: t,
        side: toFoe && !toOwn ? 'foe' : 'own',
        p: Math.max(0, Math.min(1, e.prob === undefined ? 1 : e.prob)),
      }))
      if (hits.length) pkts.push({ from: from, slot: slot, kind: 'immune', phase: phase || 'slot', hits: hits, tag: e.raw || '', srcKind: srcKind })
      return
    }
    // 2) 端点钉选（只改区间端点，不产生数值增量）＝ 实战流程里的「重置技能」，最先放
    if (e.type === 'pin') {
      const tgt = toFoe ? foeCol : col
      const r = resolvePool(e, tgt.units, holderArg(e))
      const raw = (e.attrs || []).map((a) => a.a || 'fi').join('')
      const mask = (raw.indexOf('f') >= 0 ? 'f' : '') + (raw.indexOf('i') >= 0 ? 'i' : '')
      const hits = idxOf(tgt, r.pool).map((t) => ({
        t: t,
        side: toFoe ? 'foe' : 'own',
        mode: e.mode,
        attr: mask || 'fi',
        p: e.prob === undefined ? 1 : e.prob,
      }))
      if (hits.length) pkts.push({ from: from, slot: slot, kind: 'pin', phase: phase || 'reset', hits: hits, tag: e.raw || '' })
      return
    }
    // 3) 元修正类（增益放大/免疫/减免/军师技增减）没有数值增量，已体现在别的效果的增量里
    if (e.type && e.type !== 'buff') return
    const p = e.prob === undefined ? 1 : Math.max(0, Math.min(1, e.prob))
    // 连携：持有者的技能在相邻进化英雄旁时替换为强化版（数值 ×1.5）
    const lxMult = from >= 0 ? (col._lx || {})[from] : undefined
    const own = toOwn ? scaleDeltas(ownMap.get(e) || [], lxMult) : []
    const foe = toFoe ? scaleDeltas(foeMap.get(e) || [], lxMult) : []
    if (!own.length && !foe.length) return
    pkts.push({ from: from, slot: slot, kind: 'buff', phase: phase || 'slot', p: p, own: own, foe: foe, tag: e.raw || '', srcKind: srcKind, lx: lxMult ? true : undefined })
  })
  return pkts
}

function makeBattleSide(label, res, petBase) {
  return {
    label: label,
    finalMult: FINAL_MULT,
    units: res.units.map((u) => ({
      name: u.name,
      kind: u.kind,
      row: u.row,
      slot: slotNoOf(u.slotIdx, u.row),
      baseFmin: u.kind === 'pet' && petBase ? petBase.baseFmin : u.baseFmin,
      baseFmax: u.kind === 'pet' && petBase ? petBase.baseFmax : u.baseFmax,
      baseImin: u.kind === 'pet' && petBase ? petBase.baseImin : u.baseImin,
      baseImax: u.kind === 'pet' && petBase ? petBase.baseImax : u.baseImax,
      inheritF: u.inheritF || 0,
      inheritI: u.inheritI || 0,
    })),
    skills: [],
  }
}

// 基础战力（实战的 flow.power 口径）：不含任何主动技能，只含阵营效果 + 羁绊被动
// 用于先手判定（power 高者先手）与秒杀判定（2 倍秒杀）
// 同时返回进场态神兽继承底数：战斗开始时神兽 = 同排英雄【进场态】值 × 系数，
// 不能沿用全静态结算的底数（那是被全部技能放大过的英雄值，会让神兽凭空虚高数倍）
function basePowerOf(col) {
  const saved = col.effects
  col.effects = saved.filter((e) => e.forceTargets || e.src === '阵营效果')
  resetUnits(col.units)
  const r = computeSide(col, [])
  const petBase = col.petUnit
    ? { baseFmin: col.petUnit.baseFmin, baseFmax: col.petUnit.baseFmax, baseImin: col.petUnit.baseImin, baseImax: col.petUnit.baseImax }
    : null
  col.effects = saved
  resetUnits(col.units)
  return { power: (r.total.min + r.total.max) / 2, petBase: petBase }
}

function buildBattleSides(oursSlots, enemySlots, petLvOurs, petLvEnemy) {
  const oc = collectSide(oursSlots, petLvOurs)
  const ec = collectSide(enemySlots, petLvEnemy)
  const bpO = basePowerOf(oc)
  const bpE = basePowerOf(ec)
  const powerOurs = bpO.power
  const powerEnemy = bpE.power
  const traceO = []
  const traceE = []
  let oursRes = computeSide(oc, ec.effects, { trace: traceO })
  let enemyRes = computeSide(ec, oc.effects, { trace: traceE })
  const sOurs = buildScheme(oursRes, enemyRes, oc, ec, '我方')
  const sEnemy = buildScheme(enemyRes, oursRes, ec, oc, '敌方')
  if (sOurs.effect) oc.effects.push(sOurs.effect)
  if (sEnemy.effect) ec.effects.push(sEnemy.effect)
  if (sOurs.effect || sEnemy.effect) {
    resetUnits(oursRes.units)
    resetUnits(enemyRes.units)
    traceO.length = 0
    traceE.length = 0
    oursRes = computeSide(oc, ec.effects, { trace: traceO })
    enemyRes = computeSide(ec, oc.effects, { trace: traceE })
  }
  // 本方技能的增量（加自己）= traceO 的非 incoming；压到对方 = traceE 的 incoming
  const ownO = traceMap(traceO, false)
  const foeO = traceMap(traceE, true)
  const ownE = traceMap(traceE, false)
  const foeE = traceMap(traceO, true)

  // 连携判定：赛博系 rs 英雄与进化英雄相邻 → 技能 ×1.5（按本方站位）
  oc._lx = lianXieMapOf(oc)
  ec._lx = lianXieMapOf(ec)

  const ours = makeBattleSide('我方', oursRes, bpO.petBase)
  const enemy = makeBattleSide('敌方', enemyRes, bpE.petBase)
  ours.power = powerOurs
  enemy.power = powerEnemy
  ours.skills = sidePackets(oc, ec, ownO, foeO)
  enemy.skills = sidePackets(ec, oc, ownE, foeE)
  return { ours: ours, enemy: enemy, res: { ours: oursRes, enemy: enemyRes } }
}

function saveModel(model) {
  try {
    const data = { ours: [], enemy: [] }
    ;['ours', 'enemy'].forEach((k) => {
      model[k].slots.forEach((s) => {
        if (s.unit) data[k].push({ idx: s.idx, unit: s.unit })
      })
    })
    wx.setStorageSync(STORE_KEY, data)
  } catch (e) {}
}
function loadModel() {
  try {
    const data = wx.getStorageSync(STORE_KEY)
    if (!data) return null
    const model = { ours: { slots: makeSlots() }, enemy: { slots: makeSlots() } }
    ;['ours', 'enemy'].forEach((k) => {
      ;(data[k] || []).forEach((it) => {
        if (model[k].slots[it.idx] !== undefined) model[k].slots[it.idx].unit = it.unit
      })
    })
    return model
  } catch (e) {
    return null
  }
}

Page({
  data: {
    cols: COLS,
    side: 'ours',
    board: withSlotNo(makeSlots()),
    picking: null,
    pool: 'hero',
    keyword: '',
    focusKw: false,
    poolTabs: ERAS,
    petTabs: ['全部'].concat(PET_POS),
    curTab: 0,
    poolList: [],
    compare: { has: false },
    detail: null,
    cmpOverlay: false,
    drag: null,
    codeText: '',
    codeTip: '',
    myCode: '',
    myCodeTip: '',
    myCodeCount: '',
    genRunning: false,
    genProgress: '',
    genTip: '',
    // 屏蔽没有的英雄：点选生成结果里自己没有的武将 → 重搜时排除，直到打赢或确认无解
    genBanned: { open: false, chips: [], names: [], label: '', enemySig: '' },
    petPick: { items: [], id: 0, name: '', qcolor: '', open: true, lv: PET_LV_MAX, cntLabel: '', tierLabel: '', tiers: [] },
    // 神兽等级：我方 / 敌方分开设置（技能档位按等级取，110 = 满档）
    petLvOurs: PET_LV_MAX,
    petLvEnemy: PET_LV_MAX,
    // 神兽等级快捷档（技能档位按等级取，110 = 满档）
    petLvPresets: [1, 30, 60, 90, 110],
    // 敌方王座防守加成 %（势力界面明示持有王座一方防守 +20%，默认计入）
    throneAdd: 20,
    battleRunning: false,
    battleProgress: '',
    battleLxLabel: '',
    battleRes: null,
    // 推演场次：默认 100 场，可手动切换（场次越多越稳，但更慢）
    battleSims: 100,
    battleSimPresets: [50, 100, 200, 500, 1000],
  },

  // 可见性兜底：模块若设为「仅管理员」或「隐藏」，普通用户即使从最近使用进来也会被挡回首页
  checkVisible() {
    canViewModule('众生平等模拟')
      .then((ok) => {
        if (ok) return
        wx.showModal({
          title: '模块维护中',
          content: '众生平等模拟正在校准战斗数据，暂仅管理员可见。',
          showCancel: false,
          success: () => wx.reLaunch({ url: '/pages/index/index' }),
        })
      })
      .catch(() => {})
  },

  onLoad() {
    this.checkVisible()
    this.model = loadModel() || { ours: { slots: makeSlots() }, enemy: { slots: makeSlots() } }
    // 神兽：只上一只 + 我方/敌方等级分开（等级决定技能档位，默认满级 110）
    let savedPetId = 0
    let savedPetLv = 0
    let savedPetLvE = 0
    // 势力（王座）加成：游戏「势力」界面明示持有王座一方防守 +20%，默认计入；
    // 手动改过（存储非空）则以存储值为准
    let savedThrone = 20
    try {
      savedPetId = Number(wx.getStorageSync('xb-pet-sel')) || 0
      savedPetLv = Number(wx.getStorageSync('xb-pet-lv')) || 0
      savedPetLvE = Number(wx.getStorageSync('xb-pet-lv-e')) || 0
      const rawThrone = wx.getStorageSync('xb-throne-add')
      if (rawThrone !== '' && rawThrone !== undefined && rawThrone !== null) savedThrone = Number(rawThrone) || 0
    } catch (e) {}
    PET_LV = normPetLv(savedPetLv || PET_LV_MAX)
    let savedSims = 0
    try {
      savedSims = Number(wx.getStorageSync('xb-battle-sims')) || 0
    } catch (e) {}
    this.setData({
      board: withSlotNo(this.model.ours.slots),
      petPick: this.buildPetPickState(savedPetId, true, PET_LV),
      petLvOurs: PET_LV,
      petLvEnemy: normPetLv(savedPetLvE || PET_LV),
      throneAdd: Math.max(0, Math.min(100, savedThrone)),
      battleSims: this.normBattleSims(savedSims),
    })
    this.recalc()
  },

  // 推演场次：默认 100，允许任意整数，夹在 10~2000 之间
  normBattleSims(v) {
    const n = Math.round(Number(v) || 0)
    if (!n) return 100
    return Math.max(10, Math.min(2000, n))
  },
  pickBattleSims(e) {
    if (this.data.battleRunning) return
    const v = this.normBattleSims(e.currentTarget.dataset.v)
    this.setData({ battleSims: v })
    try {
      wx.setStorageSync('xb-battle-sims', v)
    } catch (err) {}
  },
  // 手输场次：允许任意整数，超范围夹回并提示
  commitBattleSims(raw) {
    const s = String(raw == null ? '' : raw).trim()
    if (!s) return this.data.battleSims
    const v = this.normBattleSims(s)
    if (String(v) !== s) {
      wx.showToast({ title: '场次取 10~2000', icon: 'none' })
    }
    this.setData({ battleSims: v })
    try {
      wx.setStorageSync('xb-battle-sims', v)
    } catch (err) {}
    return v
  },
  onBattleSimsInput(e) {
    if (this.data.battleRunning) return
    this.commitBattleSims(e.detail.value)
  },
  // 只记录输入内容、不 setData（避免覆盖 value 导致光标乱跳）；
  // 用于「输完直接点开战」时 blur 尚未到达的情况
  onBattleSimsTyping(e) {
    this._simsInput = e.detail.value
  },

  // ---------- 双方切换 ----------
  switchSide(e) {
    const side = e.currentTarget.dataset.s
    if (side === this.data.side) return
    this.setData({ side, board: withSlotNo(this.model[side].slots), picking: null, poolList: [], keyword: '' })
    this.showDetail(side)
  },
  showDetail(side) {
    const c = this.data.compare
    if (!c || !c.has) return this.setData({ detail: null })
    this.setData({ detail: side === 'ours' ? c.ours.detail : c.enemy.detail })
  },

  // ---------- 阵容码导入（敌方） ----------
  onCodeInput(e) {
    const text = e.detail.value || ''
    this.setData({ codeText: text })
    // 粘贴/输入后自动解析：检测到完整的合法阵容码就直接摆图，无需再点「导入」
    const t = text.trim()
    if (t.length < 12 || t.slice(0, 2) !== 'Z3') return
    try {
      formationCode.decode(t)
    } catch (err) {
      return // 还在输入中或码有误，等用户点「导入」再给报错
    }
    if (t === this._lastAutoCode) return
    this._lastAutoCode = t
    this.importCode()
  },
  clearCode() {
    this._lastAutoCode = ''
    this.setData({ codeText: '', codeTip: '' })
  },
  pasteCode() {
    wx.getClipboardData({
      success: (r) => {
        const text = (r.data || '').trim()
        if (!text) return wx.showToast({ title: '剪贴板是空的', icon: 'none' })
        this.setData({ codeText: text })
        this.importCode()
      },
      fail: () => wx.showToast({ title: '读取剪贴板失败', icon: 'none' }),
    })
  },
  importCode() {
    const text = this.data.codeText
    if (!text) return wx.showToast({ title: '先粘贴阵容码', icon: 'none' })
    let d
    try {
      d = formationCode.decode(text)
    } catch (err) {
      this.setData({ codeTip: '❌ ' + err.message })
      return wx.showToast({ title: err.message, icon: 'none' })
    }
    const slots = makeSlots()
    const missing = []
    let heroCnt = 0, petCnt = 0
    formationCode.withRowCol(d.heroes).forEach((e) => {
      const idx = e.row === 'back' ? e.col : e.row === 'mid' ? 6 + e.col : 12 + e.col
      if (e.heroId >= formationCode.PET_MIN) {
        const p = petAll.filter((x) => x.id === e.heroId)[0]
        if (!p) return missing.push('神兽#' + e.heroId)
        slots[idx] = { ...slots[idx], unit: petCard(p) }
        petCnt++
      } else {
        const h = heroesMap[e.heroId]
        if (!h) return missing.push('英雄#' + e.heroId)
        slots[idx] = { ...slots[idx], unit: heroCard(h) }
        heroCnt++
      }
    })
    if (heroCnt > 16) {
      const tip = '该码含 ' + heroCnt + ' 名武将，超过上限 16'
      this.setData({ codeTip: '❌ ' + tip })
      return wx.showToast({ title: tip, icon: 'none' })
    }
    if (!heroCnt && !petCnt) {
      this.setData({ codeTip: '❌ 阵容码里没有任何可识别单位' })
      return
    }
    this.model.enemy.slots = slots
    if (this.data.side === 'enemy') this.setData({ board: withSlotNo(slots) })
    this.recalc()
    saveModel(this.model)
    const tip = '✅ 已导入 ' + heroCnt + ' 英雄 + ' + petCnt + ' 神兽' +
      (missing.length ? '；' + missing.length + ' 个新卡不在当前数据包，已跳过（' + missing.join('、') + '）' : '')
    this.setData({ codeTip: tip })
    wx.showToast({ title: '导入成功', icon: 'success' })
  },

  // ---------- 我方阵容码生成 ----------
  // 从当前我方布阵生成阵容码（号位按客户端的列编号规则）
  refreshMyCode() {
    const slots = withSlotNo(this.model.ours.slots)
    const entries = []
    let heroCnt = 0
    let petCnt = 0
    slots.forEach((s) => {
      if (!s.unit) return
      entries.push({ position: s.no, heroId: s.unit.id })
      if (s.unit.kind === 'pet') petCnt++
      else heroCnt++
    })
    if (!entries.length) {
      this.setData({ myCode: '', myCodeCount: '', myCodeTip: '上方布阵后自动生成（支持 16 英雄 + 1 神兽）' })
      return
    }
    try {
      const code = formationCode.encode(entries)
      this.setData({
        myCode: code,
        myCodeCount: heroCnt + ' 英雄' + (petCnt ? ' + ' + petCnt + ' 神兽' : ''),
        myCodeTip: '✅ 共 ' + (heroCnt + petCnt) + ' 个单位 · ' + code.length + ' 字符，复制后可在游戏内导入',
      })
    } catch (err) {
      this.setData({ myCode: '', myCodeCount: heroCnt + ' 英雄' + (petCnt ? ' + ' + petCnt + ' 神兽' : ''), myCodeTip: '❌ ' + err.message })
    }
  },
  copyMyCode() {
    if (!this.data.myCode) {
      this.refreshMyCode()
      if (!this.data.myCode) return wx.showToast({ title: '还没有可复制的阵容码', icon: 'none' })
    }
    wx.setClipboardData({
      data: this.data.myCode,
      success: () => wx.showToast({ title: '已复制阵容码', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' }),
    })
  },

  // ---------- 一键生成克制阵容（依据敌方当前布阵搜索我方最优配置） ----------
  // 敌方阵容签名：换敌人后屏蔽名单自动清空（不同敌人需要的克制不同）
  enemySignature(enemySlots) {
    return enemySlots.map((s) => (s.unit ? s.unit.id : 0)).join(',')
  },
  // 神兽候选（一次只能上一只；等级决定技能档位）
  petPickItems() {
    return petAll.map((p) => ({ id: p.id, name: p.name, q: p.q || 0, qcolor: PET_Q_COLOR[p.q] || '#9c8a70' }))
  },
  // 面板状态：items（全部兽）/ id（当前那只）/ lv / tiers（当前生效的技能档位）
  buildPetPickState(id, open, lv) {
    const items = this.petPickItems()
    const cur = items.filter((i) => i.id === id)[0] || items[0]
    const L = normPetLv(lv)
    const p = petAll.filter((x) => x.id === cur.id)[0]
    const tiers = petSkillTiers(p, L)
    return {
      items: items,
      id: cur.id,
      name: cur.name,
      qcolor: cur.qcolor,
      open: !!open,
      lv: L,
      cntLabel: cur.name + ' · Lv' + L,
      tierLabel: tiers.length ? tiers.map((t) => t.name + ' Lv' + t.tier + '/' + t.tiers).join(' · ') : '该兽无技能',
      tiers: tiers.map((t) => ({ name: t.name, label: 'Lv' + t.tier + '/' + t.tiers, need: t.need, text: t.text })),
    }
  },
  // 当前选定的那一只（生成/推演都用它）
  pickedPets() {
    const id = (this.data.petPick && this.data.petPick.id) || 0
    const p = petAll.filter((x) => x.id === id)[0] || petAll[0]
    return p ? [p] : []
  },
  togglePetPick() {
    const pp = this.data.petPick
    this.setData({ petPick: this.buildPetPickState(pp.id, !pp.open, pp.lv) })
  },
  savePetPick(id, lv) {
    const keepOpen = !!(this.data.petPick && this.data.petPick.open)
    const pp = this.buildPetPickState(id, keepOpen, lv)
    PET_LV = pp.lv
    this.setData({ petPick: pp, petLvOurs: pp.lv })
    try {
      wx.setStorageSync('xb-pet-sel', pp.id)
      wx.setStorageSync('xb-pet-lv', pp.lv)
    } catch (e) {}
    this.recalc()
  },
  petToggle(e) {
    const id = Number(e.currentTarget.dataset.id)
    this.savePetPick(id, this.data.petPick.lv)
  },
  // 我方神兽等级：技能按这一级取档（1~110）
  commitPetLv(raw) {
    const s = String(raw == null ? '' : raw).trim()
    if (!s) return this.data.petPick.lv
    const v = normPetLv(s)
    if (String(v) !== s) wx.showToast({ title: '神兽等级取 1~110', icon: 'none' })
    this.savePetPick(this.data.petPick.id, v)
    return v
  },
  onPetLvInput(e) {
    this.commitPetLv(e.detail.value)
  },
  // 只记录输入、不 setData（避免 value 覆盖导致光标乱跳）
  onPetLvTyping(e) {
    this._petLvInput = e.detail.value
  },
  pickPetLv(e) {
    this.commitPetLv(e.currentTarget.dataset.v)
  },
  // 敌方神兽等级（与我方分开）
  commitPetLvEnemy(raw) {
    const s = String(raw == null ? '' : raw).trim()
    if (!s) return this.data.petLvEnemy
    const v = normPetLv(s)
    if (String(v) !== s) wx.showToast({ title: '神兽等级取 1~110', icon: 'none' })
    this.setData({ petLvEnemy: v })
    try {
      wx.setStorageSync('xb-pet-lv-e', v)
    } catch (e) {}
    this.recalc()
    return v
  },
  onPetLvEnemyInput(e) {
    this.commitPetLvEnemy(e.detail.value)
  },
  onPetLvEnemyTyping(e) {
    this._petLvEnemyInput = e.detail.value
  },
  pickPetLvEnemy(e) {
    this.commitPetLvEnemy(e.currentTarget.dataset.v)
  },
  // 敌方王座防守加成 %（0~100；守王座一方在实战里会多一笔 gatherPower）
  commitThroneAdd(raw) {
    const s = String(raw == null ? '' : raw).trim()
    const v = Math.max(0, Math.min(100, Math.round(Number(s) || 0)))
    if (s && String(v) !== s) wx.showToast({ title: '取 0~100 的整数', icon: 'none' })
    this.setData({ throneAdd: v })
    try {
      wx.setStorageSync('xb-throne-add', v)
    } catch (e) {}
    return v
  },
  onThroneInput(e) {
    this.commitThroneAdd(e.detail.value)
  },
  onThroneTyping(e) {
    this._throneInput = e.detail.value
  },
  pickThrone(e) {
    this.commitThroneAdd(e.currentTarget.dataset.v)
  },
  generateCounter() {
    if (this.data.genRunning) return
    const enemySlots = this.model.enemy.slots
    if (!enemySlots.filter((s) => s.unit).length) {
      return wx.showToast({ title: '先去敌方页签摆好阵容或导入阵容码', icon: 'none' })
    }
    // 神兽：只用当前选定的那一只（等级已在面板里设定）
    const pets = this.pickedPets()
    if (!pets.length) {
      return wx.showToast({ title: '神兽数据为空，无法生成', icon: 'none' })
    }
    // 敌方变了 → 屏蔽名单自动清空
    const sig = this.enemySignature(enemySlots)
    const gb = this.data.genBanned
    const bannedNames = sig === gb.enemySig ? gb.names.slice() : []
    if (sig !== gb.enemySig) {
      this.setData({ genBanned: { open: false, chips: [], names: [], label: '', enemySig: sig } })
    }
    // 起始神兽：沿用我方当前那只（就是同一只），否则用选定那只
    let pet = null
    const curPet = this.model.ours.slots.filter((s) => s.unit && s.unit.kind === 'pet')[0]
    if (curPet) pet = pets.filter((p) => p.id === curPet.unit.id)[0] || null
    if (!pet) pet = pets[0]
    const scope = 'Lv' + this.data.petLvOurs
    let job
    try {
      job = lineupOptimizer.createJob({
        // 我方候选按我方神兽等级、敌方按敌方神兽等级
        calcAll: (model) => calcAll(model, this.data.petLvOurs, this.data.petLvEnemy),
        makeSlots: makeSlots,
        heroCard: heroCard,
        petCard: petCard,
        heroesMap: heroesMap,
        enemySlots: enemySlots,
        pet: pet,
        pets: pets,
        bannedNames: bannedNames,
        maxEvals: 1200,
        maxPasses: 2,
      })
    } catch (e) {
      return wx.showToast({ title: '生成失败：' + e.message, icon: 'none' })
    }
    // 屏蔽后剩余候选不足 16 名英雄 → 已无解
    if (job.candidateCount < 16) {
      this.setData({
        genTip: '❌ 屏蔽 ' + bannedNames.length + ' 名英雄后剩余候选不足 16 名——没有可以战胜该敌方的阵容',
        genRunning: false,
        genProgress: '',
      })
      return wx.showToast({ title: '没有可战胜敌方的阵容', icon: 'none' })
    }
    this.setData({ genRunning: true, genTip: '', genProgress: '正在分析敌方阵容…' })
    const t0 = Date.now()
    let last = 0
    const tick = () => {
      let r
      try {
        r = job.step(40)
      } catch (e) {
        return this.setData({ genRunning: false, genProgress: '', genTip: '❌ 生成失败：' + e.message })
      }
      if (!r.done) {
        const now = Date.now()
        if (now - last > 300) {
          last = now
          this.setData({
            genProgress: '⏳ ' + job.stats.stage + ' · 已评估 ' + job.stats.evals + ' 套（' + Math.round((now - t0) / 1000) + 's）',
          })
        }
        return setTimeout(tick, 0)
      }
      this.applyGenerated(job, r, pet, Date.now() - t0, scope)
    }
    setTimeout(tick, 0)
  },
  applyGenerated(job, r, pet, cost, scope) {
    const slots = job.toSlots(r.state)
    const usedPet = r.pet || pet
    this._prevOurs = this.model.ours.slots.slice()
    this.model.ours.slots = slots
    this.setData({
      board: withSlotNo(slots),
      side: 'ours',
      picking: null,
      poolList: [],
      genRunning: false,
      genProgress: '',
    })
    this.recalc()
    saveModel(this.model)
    const c = this.data.compare
    if (!c || !c.has) return
    const om = (c.ours.total.min + c.ours.total.max) / 2
    const em = (c.enemy.total.min + c.enemy.total.max) / 2
    const gap = Math.round(om - em)
    // 屏蔽面板：展示本次生成阵容里的具体卡（含「黄金甲·」等前缀），用户按卡屏蔽
    const uniqNames = []
    slots
      .map((s) => s.unit)
      .filter((u) => u && u.kind !== 'pet')
      .forEach((u) => {
        const n = String(u.name || '')
        if (uniqNames.indexOf(n) < 0) uniqNames.push(n)
      })
    const gb = this.data.genBanned
    const chips = uniqNames.map((n) => ({ name: n, banned: gb.names.indexOf(n) >= 0 }))
    const head = gap > 0
      ? '✅ 已找到可战胜敌方的阵容！'
      : '⚠️ 仍处下风。若阵容里有你没有的英雄，点开「屏蔽英雄」标记后重试'
    this.setData({
      genTip: head +
        '（' + Math.max(1, Math.round(cost / 1000)) + 's · ' + job.stats.evals + ' 次评估）' +
        '｜我方 ' + Math.round(c.ours.total.min) + '~' + Math.round(c.ours.total.max) +
        ' vs 敌方 ' + Math.round(c.enemy.total.min) + '~' + Math.round(c.enemy.total.max) +
        '，净胜差 ' + gap + ' · 神兽：' + (usedPet ? usedPet.name + ' ' + scope : '无') + (usedPet ? '（技能按该等级取档）' : ''),
      genBanned: { ...gb, chips: chips },
    })
    wx.showToast({ title: gap > 0 ? '已生成克制阵容' : '已生成（仍偏弱）', icon: 'none' })
  },
  // ---------- 屏蔽没有的英雄并重试 ----------
  toggleBanPanel() {
    const gb = this.data.genBanned
    if (!gb.chips.length) {
      return wx.showToast({ title: '先生成一次阵容，再在这里屏蔽没有的英雄', icon: 'none' })
    }
    this.setData({ genBanned: { ...gb, open: !gb.open } })
  },
  toggleBanChip(e) {
    const name = e.currentTarget.dataset.name
    const gb = this.data.genBanned
    const chips = gb.chips.map((c) => (c.name === name ? { ...c, banned: !c.banned } : c))
    const names = gb.names.slice()
    const i = names.indexOf(name)
    const nowBanned = chips.filter((c) => c.name === name)[0].banned
    if (nowBanned && i < 0) names.push(name)
    if (!nowBanned && i >= 0) names.splice(i, 1)
    this.setData({ genBanned: { ...gb, chips: chips, names: names, label: names.join('、') } })
  },
  clearBanned() {
    const gb = this.data.genBanned
    this.setData({
      genBanned: { ...gb, names: [], label: '', chips: gb.chips.map((c) => ({ ...c, banned: false })) },
    })
    wx.showToast({ title: '已清空屏蔽名单', icon: 'none' })
  },
  banAndRegen() {
    const gb = this.data.genBanned
    const newly = gb.chips.filter((c) => c.banned && gb.names.indexOf(c.name) < 0).map((c) => c.name)
    if (newly.length) {
      this.setData({ genBanned: { ...gb, names: gb.names.concat(newly), label: gb.names.concat(newly).join('、') } })
    }
    this.generateCounter()
  },
  undoGenerate() {
    if (!this._prevOurs) return wx.showToast({ title: '没有可撤销的生成结果', icon: 'none' })
    this.model.ours.slots = this._prevOurs
    this._prevOurs = null
    this.setData({ board: withSlotNo(this.model.ours.slots), genTip: '↩ 已撤销，恢复为生成前的阵容' })
    this.recalc()
    saveModel(this.model)
    wx.showToast({ title: '已撤销', icon: 'none' })
  },

  // ---------- 布阵 ----------
  curSlots() {
    return this.model[this.data.side].slots
  },
  cellTap(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const s = this.curSlots()[idx]
    if (s && s.unit) return // 已上阵格子：拖动/点按移除在 touchend 处理
    this.setData({ picking: { slotIdx: idx, pool: 'hero' }, pool: 'hero', keyword: '', curTab: 0 })
    this.renderPool()
  },
  removeUnit(idx) {
    const slots = this.curSlots().slice()
    slots[idx] = { ...slots[idx], unit: null }
    this.commitSlots(slots)
  },
  switchPool(e) {
    const pool = e.currentTarget.dataset.p
    const picking = this.data.picking ? { ...this.data.picking, pool } : null
    this.setData({ pool, picking, keyword: '', curTab: 0 })
    this.renderPool()
  },
  pickEra(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    this.setData({ curTab: idx, keyword: '' })
    this.renderPool()
  },
  renderPool() {
    const p = this.data.picking
    const used = this.usedIds()
    if (!p) return
    if (this.data.pool === 'pet') {
      const t = this.data.curTab
      const pos = t > 0 ? PET_POS[t - 1] : null
      const src = petAll.filter((x) => used.indexOf(x.id) < 0 && (!pos || x.pos === pos))
      this.setData({ poolList: src.slice(0, 40).map((x) => ({ ...petCard(x), kind: 'pet' })) })
      return
    }
    const era = ERAS[this.data.curTab]
    const col = this.curSlots()[p.slotIdx] ? this.curSlots()[p.slotIdx].col : 'mid'
    const val = (h) => {
      const f = (h.force[0] + h.force[1]) / 2
      const i = (h.iq[0] + h.iq[1]) / 2
      return col === 'back' ? i : col === 'front' ? f : f + i
    }
    const hits = all
      .filter((h) => h.era === era && used.indexOf(h.id) < 0)
      .sort((a, b) => val(b) - val(a))
      .slice(0, 40)
      .map(heroCard)
    this.setData({ poolList: hits })
  },
  onInput(e) {
    const kw = (e.detail.value || '').trim()
    this.setData({ keyword: kw })
    const p = this.data.picking
    if (!p || !kw) return this.renderPool()
    const used = this.usedIds()
    if (this.data.pool === 'pet') {
      this.setData({ poolList: petAll.filter((x) => x.name.indexOf(kw) >= 0 && used.indexOf(x.id) < 0).slice(0, 40).map((x) => ({ ...petCard(x), kind: 'pet' })) })
    } else {
      const hits = all
        .filter((h) => (h.name.indexOf(kw) >= 0 || (h.title && h.title.indexOf(kw) >= 0)) && used.indexOf(h.id) < 0)
        .slice(0, 40)
        .map(heroCard)
      this.setData({ poolList: hits })
    }
  },
  clearKeyword() {
    this.setData({ keyword: '', focusKw: true })
    if (this.data.picking) this.renderPool()
  },
  onBlur() {
    this.setData({ focusKw: false })
  },
  usedIds() {
    return this.curSlots().filter((s) => s.unit).map((s) => s.unit.id)
  },
  assign(e) {
    const id = Number(e.currentTarget.dataset.id)
    const p = this.data.picking
    if (!p) return
    const slots = this.curSlots().slice()
    if (this.data.pool === 'pet') {
      const src = petAll.filter((x) => x.id === id)[0]
      const cleaned = slots.map((s) => (s.unit && s.unit.kind === 'pet' ? { ...s, unit: null } : s))
      cleaned[p.slotIdx] = { ...cleaned[p.slotIdx], unit: petCard(src) }
      this.setData({ poolList: [], keyword: '', picking: null })
      this.commitSlots(cleaned)
      return
    }
    slots[p.slotIdx] = { ...slots[p.slotIdx], unit: heroCard(heroesMap[id]) }
    this.setData({ poolList: [], keyword: '', picking: null })
    this.commitSlots(slots)
  },
  commitSlots(slots) {
    this.model[this.data.side].slots = slots
    this.setData({ board: withSlotNo(slots) })
    this.recalc()
    saveModel(this.model)
  },

  // ---------- 拖动换位 ----------
  cellTouchStart(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const s = this.curSlots()[idx]
    if (!s || !s.unit) return
    const t = e.touches[0]
    this._dragCtx = { from: idx, sx: t.clientX, sy: t.clientY, moved: false, rects: null }
    const q = wx.createSelectorQuery()
    q.selectAll('.cell').fields({ rect: true, dataset: true })
    q.exec((res) => {
      if (this._dragCtx) this._dragCtx.rects = (res && res[0]) || null
    })
  },
  cellTouchMove(e) {
    const ctx = this._dragCtx
    if (!ctx) return
    const t = e.touches[0]
    const dx = t.clientX - ctx.sx
    const dy = t.clientY - ctx.sy
    if (!ctx.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    ctx.moved = true
    let over = null
    if (ctx.rects) {
      ctx.rects.forEach((r) => {
        if (t.clientX >= r.left - 6 && t.clientX <= r.right + 6 && t.clientY >= r.top - 6 && t.clientY <= r.bottom + 6) over = Number(r.dataset.idx)
      })
    }
    const d = this.data.drag
    if (!d || d.over !== over || d.x !== t.clientX || d.y !== t.clientY) {
      const unit = this.curSlots()[ctx.from].unit
      this.setData({ drag: { from: ctx.from, over, x: t.clientX, y: t.clientY, name: unit.name, qcolor: unit.qcolor } })
    }
  },
  cellTouchEnd() {
    const ctx = this._dragCtx
    this._dragCtx = null
    const d = this.data.drag
    if (d) this.setData({ drag: null })
    if (!ctx) return
    if (ctx.moved && d && d.over !== null && d.over !== undefined && d.over !== ctx.from) {
      const slots = this.curSlots().slice()
      const tmp = slots[ctx.from].unit
      slots[ctx.from] = { ...slots[ctx.from], unit: slots[d.over].unit }
      slots[d.over] = { ...slots[d.over], unit: tmp }
      this.commitSlots(slots)
    } else if (!ctx.moved) {
      this.removeUnit(ctx.from)
    }
  },

  // ---------- 计算 ----------
  // ---------- 实战推演 ----------
  runBattleSim() {
    if (this.data.battleRunning) return
    const oursSlots = this.model.ours.slots
    const enemySlots = this.model.enemy.slots
    if (!oursSlots.filter((s) => s.unit).length || !enemySlots.filter((s) => s.unit).length) {
      return wx.showToast({ title: '请先摆好我方和敌方阵容', icon: 'none' })
    }
    let sides
    try {
      // 输入框还没失焦就被点「开战」时，以输入内容为准
      if (this._petLvEnemyInput !== undefined && String(this._petLvEnemyInput).trim() !== '') {
        this.commitPetLvEnemy(this._petLvEnemyInput)
      }
      if (this._throneInput !== undefined && String(this._throneInput).trim() !== '') {
        this.commitThroneAdd(this._throneInput)
      }
      this._petLvEnemyInput = ''
      this._throneInput = ''
      sides = buildBattleSides(oursSlots, enemySlots, this.data.petLvOurs, this.data.petLvEnemy)
    } catch (e) {
      return wx.showToast({ title: '推演准备失败：' + e.message, icon: 'none' })
    }
    // 输入框里还没失焦就被点了「开战」时，以输入内容为准
    if (this._simsInput !== undefined && String(this._simsInput).trim() !== '') {
      this.commitBattleSims(this._simsInput)
    }
    this._simsInput = ''
    const SIMS = this.normBattleSims(this.data.battleSims)
    // 连携命中名单（报文里带 lx 标记的释放者）
    const lxNames = (side) => {
      const out = []
      ;(side.skills || []).forEach((sk) => {
        if (!sk.lx || sk.from < 0) return
        const n = side.units[sk.from] && side.units[sk.from].name
        if (n && out.indexOf(n) < 0) out.push(n)
      })
      return out
    }
    const lxOurs = lxNames(sides.ours)
    const lxEnemy = lxNames(sides.enemy)
    const job = battleSim.createJob({ ours: sides.ours, enemy: sides.enemy, sims: SIMS, opt: { throneEnemy: this.data.throneAdd } })
    this.setData({ battleRunning: true, battleProgress: '正在按号位 1→18 推演…', battleRes: null, battleLxLabel: (lxOurs.length || lxEnemy.length) ? ('连携×1.5｜' + [lxOurs.length ? '我方：' + lxOurs.join('、') : '', lxEnemy.length ? '敌方：' + lxEnemy.join('、') : ''].filter(Boolean).join('；')) : '' })
    const t0 = Date.now()
    let last = 0
    const tick = () => {
      let r
      try {
        r = job.step(30)
      } catch (e) {
        return this.setData({ battleRunning: false, battleProgress: '' })
      }
      if (!r.done) {
        const now = Date.now()
        if (now - last > 200) {
          last = now
          this.setData({ battleProgress: '⏳ 已推演 ' + r.stats.n + '/' + SIMS + ' 场（' + Math.round((now - t0) / 1000) + 's）' })
        }
        return setTimeout(tick, 0)
      }
      this.applyBattleRes(r.stats)
    }
    setTimeout(tick, 0)
  },
  applyBattleRes(st) {
    const pct = (v) => Math.round(v * 1000) / 10
    const rows = (o) => `${o.front} / ${o.mid} / ${o.back}（合计 ${o.total}）`
    const lines = [
      { k: '我方', c: '#b03a2e', v: rows(st.ours), r: `区间 ${st.ours.min}~${st.ours.max}` },
      { k: '敌方', c: '#3d6f8e', v: rows(st.enemy), r: `区间 ${st.enemy.min}~${st.enemy.max}` },
    ]
    this.setData({
      battleRunning: false,
      battleProgress: '',
      battleRes: {
        n: st.n,
        winPct: pct(st.winRate),
        losePct: pct(st.loseRate),
        drawPct: pct(st.drawRate),
        firstLabel: st.firstLabel,
        firstBy: st.firstBy,
        throneLabel: st.throneEnemy ? ' · 含敌方王座加成 ' + st.throneEnemy + '%' : '',
        instantKill: st.instantKill,
        soloRate: Math.round(st.soloRate * 100),
        soloOursWinRate: Math.round(st.soloOursWinRate * 100),
        startOurs: st.startOurs,
        startEnemy: st.startEnemy,
        avgSilencedOurs: st.avgSilencedOurs,
        avgSilencedEnemy: st.avgSilencedEnemy,
        lines,
      },
    })
  },

  recalc() {
    const r = calcAll(this.model, this.data.petLvOurs, this.data.petLvEnemy)
    const pack = (k) => ({
      total: r[k].total,
      front: r[k].rows.front,
      mid: r[k].rows.mid,
      back: r[k].rows.back,
      fetterCount: r[k].detail.fetters.length,
      count: r[k].units.length,
      detail: r[k].detail,
    })
    // 三排对比条（按区间中点算宽度，数值显示区间）
    const cmpRows = [['front', '前排'], ['mid', '中排'], ['back', '后排']].map((it) => {
      const o = r.ours.rows[it[0]]
      const e = r.enemy.rows[it[0]]
      const om = (o.min + o.max) / 2
      const em = (e.min + e.max) / 2
      const denom = om + em || 1
      return { label: it[1], oMin: o.min, oMax: o.max, eMin: e.min, eMax: e.max, oPct: Math.round((om * 100) / denom), ePct: 100 - Math.round((om * 100) / denom) }
    })
    const compare = { has: r.has, ours: pack('ours'), enemy: pack('enemy'), verdict: r.verdict, kind: r.kind, rows: cmpRows }
    // 阵容一变，之前的推演结果就作废
    this.setData({ compare, battleRes: null })
    this.showDetail(this.data.side)
    this.refreshMyCode()
  },
  // ---------- 阵营加成悬浮面板 ----------
  toggleCmpOverlay() {
    this.setData({ cmpOverlay: !this.data.cmpOverlay })
  },
  noop() {},
})
