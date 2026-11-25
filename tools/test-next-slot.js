// 验证「下一位置」类技能：号位 +1（1号位 buff 2号位）；18号位无下一位置（实测不回到 1号位）
// 号位映射：前排 1/4/7/10/13/16、中排 2/5/8/11/14/17、后排 3/6/9/12/15/18
global.wx = {
  _s: {},
  setStorageSync(k, v) { this._s[k] = v },
  getStorageSync(k) { return this._s[k] },
  createSelectorQuery() { return { selectAll: () => ({ fields: () => ({}) }), exec: () => {} } },
}
const pages = []
global.Page = (c) => pages.push(c)
require('../xiaobing-data/pages/lineup/lineup.js')
const cfg = pages[0]
const H = require('../xiaobing-data/data/heroes.js')

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅', name, extra !== undefined ? '| ' + JSON.stringify(extra) : '') }
  else { fail++; console.log('  ❌', name, extra !== undefined ? '| ' + JSON.stringify(extra) : '') }
}

// 槽位 idx：back=0..5(mid? no) —— COLS 顺序 [back, mid, front]
const idxOf = (no) => {
  const rank = Math.floor((no - 1) / 3), col = (no - 1) % 3
  return col === 0 ? 12 + rank : col === 1 ? 6 + rank : rank
}
const hcard = (id) => {
  const h = H[id], f = h.force, i = h.iq
  return { kind: 'hero', id: h.id, name: h.name, qcolor: '#ccc', quality: h.quality, forceMin: f[0], forceMax: f[1], iqMin: i[0], iqMax: i[1], force: (f[0] + f[1]) / 2, iq: (i[0] + i[1]) / 2 }
}
const mk = () => {
  wx._s = {}
  const p = Object.create(cfg)
  p.data = JSON.parse(JSON.stringify(cfg.data))
  p.setData = function (o) { Object.assign(this.data, o) }
  p.onLoad()
  return p
}
const place = (p, side, no, id) => {
  const s = p.model[side].slots.slice()
  s[idxOf(no)] = { ...s[idxOf(no)], unit: hcard(id) }
  p.setData({ side })
  p.commitSlots(s)
}
const JICHANG = 800036 // 助战：我方下一位置 武力+20%
const WEIQING = 800118 // 测试靶：武[82,87] 智[58,68]
const HUATUO = 800136 // 止戈：敌方下一位置 武力-20%
const SIMAYI = 800162 // 鬼谋：敌方下一位置 技能无效
const XUSHiji = 800532 // 戏魂·徐世勣：我方下一位置 免疫负面
const ZHAOYUN = 800470 // 黄金甲·赵云：自身武力+10%

console.log('\n=== 1. 助战：1号位 → 2号位（跨排 front→mid） ===')
const a1 = mk(); place(a1, 'ours', 1, JICHANG); place(a1, 'ours', 2, WEIQING)
const base1 = mk(); place(base1, 'ours', 1, JICHANG); place(base1, 'ours', 3, WEIQING) // 3号位=后排，武力不计
// 卫青在 2号位(mid)=武+智；1号位姬昌前排=武×1.5
// 加 20%：82*1.2+58=156.4 ; 87*1.2+68=172.4 → 姬昌(23~33)*1.5=34.5~49.5 → 总 191~222（×2 主战/防守后 382~444）
ok('姬昌1号位 → 卫青2号位获得 +20%（382~444）', a1.data.compare.ours.total.min === 382 && a1.data.compare.ours.total.max === 444, a1.data.compare.ours.total)

console.log('\n=== 2. 不命中相邻格：1号位姬昌 → 4号位卫青 无加成 ===')
const a2 = mk(); place(a2, 'ours', 1, JICHANG); place(a2, 'ours', 4, WEIQING)
// 卫青 4号位(front)=82*1.5=123~130.5；姬昌 34.5~49.5 → 158~180（×2 后 315~360）
ok('4号位不被 buff（315~360）', a2.data.compare.ours.total.min === 315 && a2.data.compare.ours.total.max === 360, a2.data.compare.ours.total)

console.log('\n=== 3. 18号位无下一位置（不回到 1号位） ===')
const a3 = mk(); place(a3, 'ours', 18, JICHANG); place(a3, 'ours', 1, WEIQING)
// 姬昌 18号位(back)=智83~93；卫青 1号位(front)=123~130.5 → 206~223.5
// 若回卷到 1号位则会变成 82*1.2*1.5=147.6 → 230+
ok('1号位未被 buff（412~447）', a3.data.compare.ours.total.min === 412 && a3.data.compare.ours.total.max === 447, a3.data.compare.ours.total)

console.log('\n=== 4. 止戈：敌方华佗1号位 → 我方2号位卫青 武力-20% ===')
const b1 = mk(); place(b1, 'ours', 2, WEIQING); place(b1, 'enemy', 1, HUATUO)
// 82*0.8+58=123.6 ; 87*0.8+68=137.6 → 124~138
ok('我方2号位被削（247~275）', b1.data.compare.ours.total.min === 247 && b1.data.compare.ours.total.max === 275, b1.data.compare.ours.total)
ok('减益已记入明细', b1.data.compare.ours.detail.enemyDebuffs.some((x) => x.indexOf('下一位置') >= 0), b1.data.compare.ours.detail.enemyDebuffs)
const b2 = mk(); place(b2, 'ours', 2, WEIQING); place(b2, 'enemy', 2, HUATUO)
ok('敌方华佗错位(2号位→3号位)不影响我方2号位（280~310）', b2.data.compare.ours.total.min === 280 && b2.data.compare.ours.total.max === 310, b2.data.compare.ours.total)

console.log('\n=== 5. 鬼谋：敌方司马懿1号位 → 我方2号位赵云技能无效 ===')
const c1 = mk(); place(c1, 'ours', 2, ZHAOYUN)
const c2 = mk(); place(c2, 'ours', 2, ZHAOYUN); place(c2, 'enemy', 1, SIMAYI)
// 赵云 2号位 mid：无沉默 129*1.1+42=183.9~139*1.1+52=204.9 → 184~205
// 沉默后 129+42=171 ~ 139+52=191
ok('无沉默 368~410', c1.data.compare.ours.total.min === 368 && c1.data.compare.ours.total.max === 410, c1.data.compare.ours.total)
ok('被沉默 342~382（自身+10%失效）', c2.data.compare.ours.total.min === 342 && c2.data.compare.ours.total.max === 382, c2.data.compare.ours.total)
ok('沉默已记入控制明细', c2.data.compare.ours.detail.ctrlTags.some((x) => x.indexOf('技能无效') >= 0), c2.data.compare.ours.detail.ctrlTags)

console.log('\n=== 6. 免疫：徐世勣1号位 → 我方2号位卫青不吃敌方华佗 -20% ===')
const d1 = mk(); place(d1, 'ours', 1, XUSHiji); place(d1, 'ours', 2, WEIQING); place(d1, 'enemy', 1, HUATUO)
const dOnly = mk(); place(dOnly, 'ours', 1, XUSHiji); place(dOnly, 'enemy', 1, HUATUO)
const dContribution = {
  min: d1.data.compare.ours.total.min - dOnly.data.compare.ours.total.min,
  max: d1.data.compare.ours.total.max - dOnly.data.compare.ours.total.max,
}
ok('卫青贡献 280~310（未被削）', dContribution.min === 280 && dContribution.max === 310, dContribution)

console.log('\n=== 7. 明细标注号位映射 ===')
const e1 = mk(); place(e1, 'ours', 1, JICHANG)
ok('技能明细含「1号位 → 2号位」', e1.data.compare.ours.detail.skillLabels.some((x) => x.indexOf('1号位 → 2号位') >= 0), e1.data.compare.ours.detail.skillLabels)
const e2 = mk(); place(e2, 'ours', 18, JICHANG)
ok('18号位标注「无下一位置」', e2.data.compare.ours.detail.skillLabels.some((x) => x.indexOf('无下一位置') >= 0), e2.data.compare.ours.detail.skillLabels)
ok('下一位置不再进未量化清单', e1.data.compare.ours.detail.unq.filter((x) => x.indexOf('下一位置') >= 0).length === 0, e1.data.compare.ours.detail.unq)

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败')
if (fail) process.exit(1)
