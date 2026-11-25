// 端点钉选 / 性别定向 / 数量公式 / 控制类效果的量化验证（Node mock Page/wx）
global.wx = { _s: {}, setStorageSync(k, v) { this._s[k] = v }, getStorageSync(k) { return this._s[k] }, createSelectorQuery() { return { selectAll: () => ({ fields: () => ({}) }), exec: () => {} } } }
const pages = []
global.Page = (c) => pages.push(c)
require('../xiaobing-data/pages/lineup/lineup.js')
const cfg = pages[0]
const H = require('../xiaobing-data/data/heroes.js')

function newPage() {
  wx._s = {} // 清空模拟存储，避免上一用例阵容残留
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
function pcard(id) {
  const P = require('../xiaobing-data/data/pets.js')
  const x = P.filter((y) => y.id === id)[0]
  const fmin = x.fp[0] + (x.inherit ? x.inherit.force : 0), fmax = x.fp[1] + (x.inherit ? x.inherit.force : 0)
  const imin = x.sp[0] + (x.inherit ? x.inherit.iq : 0), imax = x.sp[1] + (x.inherit ? x.inherit.iq : 0)
  return { kind: 'pet', id: x.id, name: x.name, qcolor: '#ccc', quality: x.q, forceMin: fmin, forceMax: fmax, iqMin: imin, iqMax: imax, force: (fmin + fmax) / 2, iq: (imin + imax) / 2 }
}
// 布阵：side + [[slotIdx, card], ...]
function build(side, list) {
  const p = newPage()
  p.setData({ side })
  const slots = p.model[side].slots.slice()
  list.forEach(([idx, card]) => { slots[idx] = { ...slots[idx], unit: card } })
  p.commitSlots(slots)
  return p
}
function both(oursList, enemyList) {
  const p = build('ours', oursList)
  p.setData({ side: 'enemy' })
  const slots = p.model.enemy.slots.slice()
  enemyList.forEach(([idx, card]) => { slots[idx] = { ...slots[idx], unit: card } })
  p.commitSlots(slots)
  return p.data.compare
}
const ok = (name, cond, extra) => console.log((cond ? '✅ ' : '❌ ') + name + (extra ? '  → ' + extra : ''))

// ---------- 1. 钉选上限：穷奇「我军前排英雄武力必定取最大值」 ----------
let c = both([[12, hcard(800001)], [0, pcard(910901)]], [])
ok('穷奇 前排武力钉到最大值（前排区间压缩为单点）', c.ours.front.min === c.ours.front.max, JSON.stringify(c.ours.front))

// ---------- 2. 钉选下限：敌方卫青「敌方武力最高的3名英雄:武力必定取最小值」 ----------
const base = both([[12, hcard(800001)], [13, hcard(800212)]], [])
const withWei = both([[12, hcard(800001)], [13, hcard(800212)]], [[0, hcard(800118)]])
ok('敌方卫青把目标区间钉到下限（我方前排压缩为单点）', withWei.ours.front.min === withWei.ours.front.max && withWei.ours.front.max < base.ours.front.max, base.ours.front.max + ' → ' + JSON.stringify(withWei.ours.front))

// ---------- 3. 双方生效：九天玄女「双方全体男性：武力-20%,智力-20%」 ----------
const enemyAlone = both([[13, hcard(800118)]], [[12, hcard(800118)]])
const enemyVsNv = both([[0, hcard(800422)], [13, hcard(800118)]], [[12, hcard(800118)]])
ok('双方技能同时削减敌方男性（敌方战力下降）', enemyVsNv.enemy.front.max < enemyAlone.enemy.front.max, enemyAlone.enemy.front.max + ' → ' + enemyVsNv.enemy.front.max)
ok('双方技能同时削减我方男性（我方战力下降）', enemyVsNv.ours.front.max < enemyAlone.ours.front.max, enemyAlone.ours.front.max + ' → ' + enemyVsNv.ours.front.max)

// ---------- 4. 数量公式：女娲「我方男性武力、智力:增加（4+男性数量*0.3）%」 ----------
const dyn = both([[12, hcard(800001)], [13, hcard(800002)], [14, hcard(800118)], [15, hcard(800212)]], [])
ok('数量公式已量化（未进未量化清单）', dyn.ours.detail.unq.filter((x) => x.indexOf('数量') >= 0).length === 0)
ok('女娲技能出现在已计入明细', dyn.ours.detail.skillLabels.some((x) => x.indexOf('女娲') >= 0 && x.indexOf('数量') >= 0), dyn.ours.detail.skillLabels.filter((x) => x.indexOf('女娲') >= 0)[0])

// ---------- 5. 性别+名次：平阳昭公主「我方武力最高的3名女性：武力+30%」 ----------
const topF = both([[12, hcard(800412)], [13, hcard(800001)], [14, hcard(800118)]], [])
const dup = topF.ours.detail.unq.filter((x) => x.indexOf('女性') >= 0)
ok('"最高的3名女性"已量化（不再进未量化）', dup.length === 0, dup.join(' / ') || '无')
ok('该技能已计入', topF.ours.detail.skillLabels.some((x) => x.indexOf('平阳昭公主') >= 0), topF.ours.detail.skillLabels.filter((x) => x.indexOf('平阳') >= 0)[0])

// ---------- 6. 技能无效：敌方共工 70% 概率使武力最高2名技能失效（软钉选按概率插值） ----------
const duo = [[12, hcard(800001)], [13, hcard(800212)]]
const fullPin = both(duo, [])
const unpinned = both(duo, [[0, hcard(800118)]]) // 敌方卫青钉到下限 = 未钉选的下限参考
const withGong = both(duo, [[0, hcard(800006)]])
ok(
  '技能无效已量化（70% 命中 → 钉选按 30% 残留插值）',
  withGong.ours.front.min > unpinned.ours.front.min && withGong.ours.front.min < fullPin.ours.front.min,
  '未钉选 ' + unpinned.ours.front.min + ' < 70%禁用 ' + withGong.ours.front.min + ' < 完整钉选 ' + fullPin.ours.front.min
)
ok('技能无效不再进未量化清单', withGong.ours.detail.unq.filter((x) => x.indexOf('技能无效') >= 0).length === 0)
ok('技能无效出现在控制明细', (withGong.ours.detail.ctrlTags || []).length > 0, (withGong.ours.detail.ctrlTags || []).join(' / '))

// ---------- 7. 残留未量化清单（应只剩真随机 / 必定出战） ----------
const big = both([[12, hcard(800001)], [13, hcard(800118)], [14, hcard(800212)], [15, hcard(800115)], [16, hcard(800006)], [17, hcard(800002)]], [])
console.log('\n当前未量化（本阵容）:', JSON.stringify(big.ours.detail.unq))
console.log('\n钉选明细:', JSON.stringify(big.ours.detail.pinTags))
console.log('控制明细:', JSON.stringify(big.ours.detail.ctrlTags))
