// 随机目标类技能的处理口径：**按期望值折算**（不是未量化）
//  - 随机N名英雄：作用于整片范围，但每个目标只拿 N/范围内人数 的份量（期望精确）
//  - 随机N名 + 概率：命中概率 = 概率 × N/人数，控制类按命中概率线性折算
//  - 受到技能加成/负面效果 ±X%：折算成该英雄整体放大/衰减系数
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
const idxOf = (no) => { const rank = Math.floor((no - 1) / 3), col = (no - 1) % 3; return col === 0 ? 12 + rank : col === 1 ? 6 + rank : rank }
const hcard = (id) => { const h = H[id], f = h.force, i = h.iq; return { kind: 'hero', id: h.id, name: h.name, qcolor: '#ccc', quality: h.quality, forceMin: f[0], forceMax: f[1], iqMin: i[0], iqMax: i[1], force: (f[0] + f[1]) / 2, iq: (i[0] + i[1]) / 2 } }
const mk = () => { wx._s = {}; const p = Object.create(cfg); p.data = JSON.parse(JSON.stringify(cfg.data)); p.setData = function (o) { Object.assign(this.data, o) }; p.onLoad(); return p }
const place = (p, side, no, id) => { const s = p.model[side].slots.slice(); s[idxOf(no)] = { ...s[idxOf(no)], unit: hcard(id) }; p.setData({ side }); p.commitSlots(s) }

const WEIQING = 800118     // 武[82,87] 智[58,68]
const LONGJI = 800037      // 我方前排随机1名英雄:武力+15%
const MENGJIANG = 800107   // 70%概率随机2名敌方英雄:技能无效
const ZHAOYUN = 800470     // 自身武力+10% + 敌方同位置武力-20%
const ZHANGHENG = 800130   // 我方随机2位英雄:不受所有技能负面效果影响
const HUATUO = 800136      // 敌方下一位置英雄:武力-20%

console.log('\n=== 1. 随机1名前排 +15% → 3名前排各得 5%（期望值精确） ===')
const base3 = mk(); [1, 4, 7].forEach((no) => place(base3, 'ours', no, WEIQING))
const withRnd = mk(); [1, 4, 7].forEach((no) => place(withRnd, 'ours', no, WEIQING)); place(withRnd, 'ours', 2, LONGJI)
const b = base3.data.compare.ours, r = withRnd.data.compare.ours
const ratioMin = r.front.min / b.front.min, ratioMax = r.front.max / b.front.max
ok('前排战力整体放大 5%（= 15% × 1/3）', Math.abs(ratioMin - 1.05) < 0.005 && Math.abs(ratioMax - 1.05) < 0.005, { ratioMin: +ratioMin.toFixed(4), ratioMax: +ratioMax.toFixed(4) })
ok('技能明细标注「按期望折算」', r.detail.skillLabels.some((x) => x.indexOf('按期望折算') >= 0), r.detail.skillLabels.filter((x) => x.indexOf('随机') >= 0))

console.log('\n=== 2. 随机 2 名 + 70% 概率的技能无效 → 命中率 0.7×2/4 = 35% ===')
// 我方 4 人上阵（赵云 + 3 卫青），敌方孟姜女「70%概率随机2名敌方英雄:技能无效」
const mkOurs4 = (p) => { place(p, 'ours', 2, ZHAOYUN); [1, 4, 7].forEach((no) => place(p, 'ours', no, WEIQING)) }
const zhaoAlone = mk(); mkOurs4(zhaoAlone)
const zhaoRnd = mk(); mkOurs4(zhaoRnd); place(zhaoRnd, 'enemy', 10, MENGJIANG)
// 下限：司马懿「使敌方下一位置的英雄:技能无效」（100% 全禁，命中 2号位赵云）
const zhaoFull = mk(); mkOurs4(zhaoFull); place(zhaoFull, 'enemy', 1, 800162)
const a1 = zhaoAlone.data.compare.ours.total, a2 = zhaoRnd.data.compare.ours.total, a3 = zhaoFull.data.compare.ours.total
ok('随机命中削弱赵云自身 +10%（严格介于「全禁」与「不禁」之间）', a3.min < a2.min && a2.min < a1.min, { 全禁: a3.min, 随机命中: a2.min, 不禁: a1.min })
// 赵云自身 +10% ≈ 129×0.1 = 12.9 战力；随机命中 35% → 只削掉约 4.5（×2 主战/防守后 ≈ 9）
ok('被削幅度 ≈ 命中率 35% × 12.9 × 2 ≈ 9', Math.abs((a1.min - a2.min) - 9) <= 3, { 削弱: a1.min - a2.min, 全禁削弱: a1.min - a3.min })
ok('技能无效进入控制明细', zhaoRnd.data.compare.ours.detail.ctrlTags.some((x) => x.indexOf('技能无效') >= 0), zhaoRnd.data.compare.ours.detail.ctrlTags)

console.log('\n=== 3. 随机 2 名免疫负面（4 人上阵 → 覆盖 50%），敌方华佗 -20% 只吃一半 ===')
const noImm = mk(); place(noImm, 'ours', 2, ZHAOYUN); place(noImm, 'enemy', 1, HUATUO)
const withImm = mk(); place(withImm, 'ours', 2, ZHAOYUN); place(withImm, 'ours', 5, ZHANGHENG); place(withImm, 'enemy', 1, HUATUO)
const n1 = noImm.data.compare.ours.total, w1 = withImm.data.compare.ours.total
// 张衡自身也算上榜（前排），所以只比较赵云被削幅度：用张衡单独上阵做基线
const onlyZhang = mk(); place(onlyZhang, 'ours', 5, ZHANGHENG); place(onlyZhang, 'enemy', 1, HUATUO)
const o1 = onlyZhang.data.compare.ours.total
const zhaoCutNoImm = n1.min                       // 赵云单上阵（被削）
const zhaoCutWithImm = w1.min - o1.min             // 有张衡时赵云贡献
ok('随机免疫让赵云的减益变轻（贡献高于纯被削）', zhaoCutWithImm > zhaoCutNoImm, { 无免疫: zhaoCutNoImm, 随机免疫后: zhaoCutWithImm })

console.log('\n=== 4. 受到技能负面效果 -50%：负面减半 ===')
const negFull = mk(); place(negFull, 'ours', 2, ZHAOYUN); place(negFull, 'enemy', 1, HUATUO)
const negHalf = mk(); place(negHalf, 'ours', 2, ZHAOYUN); place(negHalf, 'ours', 1, 800209); place(negHalf, 'enemy', 1, 800273)
ok('极简校验：不崩溃且有数值', negFull.data.compare.ours.total.min > 0 && negHalf.data.compare.ours.total.min > 0, [negFull.data.compare.ours.total, negHalf.data.compare.ours.total])

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败')
if (fail) process.exit(1)
