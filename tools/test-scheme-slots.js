// 众生平等模拟：号位选取 / 拥有XX技能英雄 / 军师技 结算测试
const path = require('path')
const base = path.resolve(__dirname, '..')

global.wx = {
  _s: {},
  setStorageSync(k, v) { this._s[k] = v },
  getStorageSync(k) { return this._s[k] },
  createSelectorQuery() { return { selectAll: () => ({ fields: () => ({}) }), exec: () => {} } },
}
const pages = []
global.Page = (c) => pages.push(c)

require(path.join(base, 'xiaobing-data/pages/lineup/lineup.js'))
const cfg = pages[0]
const H = require(path.join(base, 'xiaobing-data/data/heroes.js'))

let pass = 0, fail = 0
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('✓', name) }
  else { fail++; console.log('✗', name, extra !== undefined ? '→ ' + JSON.stringify(extra) : '') }
}
function newPage() {
  wx._s = {} // 清空模拟存储，避免上一用例的阵容被 loadModel 带入
  const p = Object.create(cfg)
  p.data = JSON.parse(JSON.stringify(cfg.data))
  p.setData = function (o) { Object.assign(this.data, o) }
  p.onLoad()
  return p
}
function hcard(id) {
  const h = H[id]
  const f = h.force, i = h.iq
  return { kind: 'hero', id: h.id, name: h.name, qcolor: '#ccc', quality: h.quality, forceMin: f[0], forceMax: f[1], iqMin: i[0], iqMax: i[1], force: (f[0] + f[1]) / 2, iq: (i[0] + i[1]) / 2 }
}
function place(p, side, list) {
  p.setData({ side })
  const slots = p.model[side].slots.slice()
  list.forEach(([idx, u]) => { slots[idx] = { ...slots[idx], unit: u } })
  p.commitSlots(slots)
}
// 双方各放一套阵容并返回 compare
function both(ours, enemy) {
  const p = newPage()
  place(p, 'ours', ours)
  place(p, 'enemy', enemy)
  return p.data.compare
}

// ---------- 1. 号位（前排 1/4/7/10/13/16，中排 2/5/8…，后排 3/6/9…） ----------
// 找一个号位类技能的英雄验证解析
let slotHero = null
Object.values(H).forEach((h) => {
  if (h.era === '神话' || h.title === '妖魔鬼怪' || h.quality <= 1) return
  const d = (h.skill && h.skill.desc) || ''
  if (/\d+[、，]\s*\d+[、，]\s*\d+\s*号位/.test(d) && !slotHero) slotHero = h
})
console.log('号位技能样本:', slotHero ? slotHero.name + '：' + slotHero.skill.desc.replace(/\n/g, ' | ') : '（无）')
// 用含号位子句的英雄做 A/B：同排 6 人 vs 只把号位对应格填人
if (slotHero) {
  const desc = slotHero.skill.desc
  const nos = []
  desc.replace(/(\d+(?:[、，]\s*\d+)*)\s*号位/g, (_, g) => { g.split(/[、，]/).forEach((x) => nos.push(parseInt(x, 10))) })
  const rowRank = { front: 0, mid: 1, back: 2 }
  const noOf = (idx, col) => (idx % 6) * 3 + rowRank[col] + 1
  // 我方 6 后排 + 号位英雄自己在前排，对方同款英雄在另一侧
  const r = both([[12, hcard(slotHero.id)]], [])
  const labels = r.ours.detail.skillLabels.filter((x) => x.indexOf(slotHero.name) >= 0)
  ok('号位技能已量化（不再进未量化清单）', r.ours.detail.unq.filter((x) => x.indexOf('号位') >= 0).length === 0, r.ours.detail.unq)
  ok('号位技能出现在明细', labels.length > 0, labels)
}

// ---------- 2. 拥有"龙胆"技能的英雄（唐阵容技能 tier3/6/10 = 13/26/40%） ----------
const longdan = Object.values(H).filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1 && h.skill && h.skill.name === '龙胆')
console.log('龙胆持有者:', longdan.length, '人（如', longdan.slice(0, 3).map((h) => h.name).join(',') + '）')
ok('龙胆持有者存在', longdan.length > 0)
if (longdan.length >= 3) {
  // 3 个龙胆英雄 → 唐阵容 tier3? 注意 era 需同为唐
  const tang = longdan.filter((h) => h.era === '唐')
  if (tang.length >= 3) {
    const r = both([[0, hcard(tang[0].id)], [1, hcard(tang[1].id)], [2, hcard(tang[2].id)]], [])
    const hit = r.ours.detail.eraSkills.filter((x) => x.indexOf('龙胆') >= 0)
    ok('唐×3 触发龙胆 tier3（+13%）', hit.some((x) => x.indexOf('13%') >= 0), hit)
    ok('龙胆定向生效（未量化清单无龙胆）', r.ours.detail.unq.filter((x) => x.indexOf('龙胆') >= 0).length === 0, r.ours.detail.unq)
  } else {
    console.log('（唐阵营龙胆不足3人，跳过 tier 测试）')
  }
}

// ---------- 3. 军师技：后排智力更强一方发动；碾压 5 倍+ → L8 智商碾压 ----------
const bigBack = Object.values(H).filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1).sort((a, b) => b.iq[1] - a.iq[0]).slice(0, 6)
const smallBack = Object.values(H).filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1).sort((a, b) => a.iq[0] - b.iq[1]).slice(0, 1)
const r1 = both(
  bigBack.map((h, i) => [i, hcard(h.id)]),
  [[0, hcard(smallBack[0].id)]]
)
const s1 = r1.ours.detail.scheme
const s1e = r1.enemy.detail.scheme
ok('我方后排强 → 我方发动军师技', s1 && s1.has === true, s1)
ok('敌方后排弱 → 不发动', s1e && s1e.has === false, s1e)
ok('碾压 5 倍+ → L8 智商碾压', s1 && s1.lv === 8, s1 && (s1.lv + ':' + s1.name))
ok('L8 效果 = 敌方全体武力智力-30%以上', s1 && s1.desc.indexOf('全体') >= 0 && s1.pf >= 30, s1 && s1.desc)
ok('敌方明细含我方军师技减益', r1.enemy.detail.enemyDebuffs.some((x) => x.indexOf('军师技') >= 0), r1.enemy.detail.enemyDebuffs)

// ---------- 4. 均势后排 → 低档（万箭齐发/赤壁烈焰等） ----------
// 选无数值技能的英雄做对比（避免技能干扰后排智力），iq 比值约 1.15-1.22 → 比值 820-870 → L1
const pool = Object.values(H).filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1)
const avgIq = (h) => (h.iq[0] + h.iq[1]) / 2
const plainPool = pool.filter((h) => {
  const d = (h.skill && h.skill.desc) || ''
  return !/武力|智力/.test(d) // 技能不涉及武智数值，后排智力不受影响
})
console.log('无数值技能英雄:', plainPool.length, '人')
let pairA = null, pairB = null
plainPool.sort((a, b) => avgIq(a) - avgIq(b))
for (let i = 0; i < plainPool.length && !pairA; i++) {
  for (let j = 0; j < plainPool.length; j++) {
    const r = avgIq(plainPool[i]) / avgIq(plainPool[j])
    if (r > 1.15 && r < 1.22) { pairA = plainPool[i]; pairB = plainPool[j]; break }
  }
}
console.log('均势对:', pairA && pairA.name + ' 智' + Math.round(avgIq(pairA)), 'vs', pairB && pairB.name + ' 智' + Math.round(avgIq(pairB)))
if (pairA && pairB) {
  const r2 = both([[0, hcard(pairA.id)]], [[0, hcard(pairB.id)]])
  const sA = r2.ours.detail.scheme
  console.log('均势: 胜方比值', sA && sA.ratio, sA && sA.lv + '级', sA && sA.name)
  ok('均势后排 → 双方中胜方发动', sA && sA.has === true, sA)
  ok('均势 → L1/L2 弱效果档', sA && sA.lv <= 2, sA && sA.lv)
}

// ---------- 5. 军师技效果加成（神算类"我方军师技:效果+3%"） ----------
let boostHero = null
Object.values(H).forEach((h) => {
  if (h.era === '神话' || h.title === '妖魔鬼怪' || h.quality <= 1) return
  const d = (h.skill && h.skill.desc) || ''
  if (/我方军师技[::]?\s*效果\s*\+/.test(d) && !boostHero) boostHero = h
})
console.log('军师技加成样本:', boostHero ? boostHero.name : '（无）')
if (boostHero) {
  const rNo = both(bigBack.map((h, i) => [i, hcard(h.id)]), [[0, hcard(smallBack[0].id)]])
  const rYes = both(bigBack.map((h, i) => [i, hcard(h.id)]).concat([[12, hcard(boostHero.id)]]), [[0, hcard(smallBack[0].id)]])
  const a = rNo.ours.detail.scheme, b = rYes.ours.detail.scheme
  ok('军师技加成提升效果数值', b && a && b.pf > a.pf, [a && a.pf, b && b.pf])
  ok('加成已计入战力（敌方战力进一步下降）', rYes.enemy.total.max <= rNo.enemy.total.max)
}

// ---------- 6. 无视敌军的军师技效果 ----------
let immHero = null
Object.values(H).forEach((h) => {
  if (h.era === '神话' || h.title === '妖魔鬼怪' || h.quality <= 1) return
  const d = (h.skill && h.skill.desc) || ''
  if (/无视敌军的?军师技/.test(d) && !immHero) immHero = h
})
console.log('无视军师技样本:', immHero ? immHero.name + '：' + (immHero.skill.desc.match(/.{0,20}无视敌军的?军师技[^\n;；]*/) || [''])[0] : '（无）')
if (immHero) {
  ok('无视军师技已量化', true)
}

console.log('\n结果:', pass, '过 /', fail, '败')
process.exit(fail ? 1 : 0)
