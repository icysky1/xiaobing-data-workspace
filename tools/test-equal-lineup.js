// 众生平等模拟 - 页面逻辑 Node 模拟测试（区间口径）
global.wx = {
  _store: {},
  setStorageSync(k, v) { this._store[k] = v },
  getStorageSync(k) { return this._store[k] },
  createSelectorQuery() {
    return { selectAll: () => ({ fields: () => {} }), exec: () => {} }
  },
}
const pages = []
global.Page = (cfg) => pages.push(cfg)

require('../xiaobing-data/pages/lineup/lineup.js')
const cfg = pages[0]
const page = Object.create(cfg)
page.data = JSON.parse(JSON.stringify(cfg.data))
page.setData = function (obj) { Object.assign(this.data, obj) }
page.onLoad()

const heroesMap = require('../xiaobing-data/data/heroes.js')
const petsData = require('../xiaobing-data/data/pets.js')
const hs = Object.values(heroesMap).filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1)
console.log('可上阵英雄数:', hs.length)

// 与页面 heroCard 一致的卡片构造（1级区间）
function card(h) {
  const fMin = h.force[0], fMax = h.force[1], iMin = h.iq[0], iMax = h.iq[1]
  return { kind: 'hero', id: h.id, name: h.name, qcolor: '#c85f50', quality: h.quality, forceMin: fMin, forceMax: fMax, iqMin: iMin, iqMax: iMax, force: (fMin + fMax) / 2, iq: (iMin + iMax) / 2 }
}
function petCard(p) {
  const fMin = p.fp[0] + p.inherit.force, fMax = p.fp[1] + p.inherit.force
  const iMin = p.sp[0] + p.inherit.iq, iMax = p.sp[1] + p.inherit.iq
  return { kind: 'pet', id: p.id, name: p.name, qcolor: '#3d9bd1', quality: p.q, forceMin: fMin, forceMax: fMax, iqMin: iMin, iqMax: iMax, force: (fMin + fMax) / 2, iq: (iMin + iMax) / 2 }
}

// 我方：前排 6 武力最高 + 后排 6 智力最高 + 神兽地精
const front6 = hs.slice().sort((a, b) => b.force[0] - a.force[0]).slice(0, 6)
const back6 = hs.slice().sort((a, b) => b.iq[0] - a.iq[0]).slice(0, 6)
const slots = page.model.ours.slots
front6.forEach((h, i) => { slots[12 + i].unit = card(h) })
back6.forEach((h, i) => { slots[i].unit = card(h) })
slots[6].unit = petCard(petsData.filter((p) => p.name === '地精')[0])
page.commitSlots(slots)

const c1 = page.data.compare.ours
console.log('\n=== 我方单方（区间） ===')
console.log('总战力:', c1.total.min, '~', c1.total.max, '| 前', c1.front.min + '-' + c1.front.max, '中', c1.mid.min + '-' + c1.mid.max, '后', c1.back.min + '-' + c1.back.max)
if (!(c1.total.min <= c1.total.max)) { console.error('❌ 区间上下限反了'); process.exit(1) }
if (c1.total.min === c1.total.max) console.warn('⚠️ 区间宽度为 0，可能未按区间计算')

// 镜像对比：区间应完全一致
const eslots = JSON.parse(JSON.stringify(slots))
page.setData({ side: 'enemy' })
page.commitSlots(eslots)
console.log('\n=== 镜像对比（应区间一致、重叠） ===')
console.log('判定:', page.data.compare.verdict)
console.log('我方', page.data.compare.ours.total.min + '~' + page.data.compare.ours.total.max, '敌方', page.data.compare.enemy.total.min + '~' + page.data.compare.enemy.total.max)
if (page.data.compare.ours.total.min !== page.data.compare.enemy.total.min) { console.error('❌ 镜像区间不一致'); process.exit(1) }

// 拖动换位
page.setData({ side: 'ours' })
page._dragCtx = { from: 0, sx: 0, sy: 0, moved: true, rects: null }
page.setData({ drag: { from: 0, over: 1, x: 0, y: 0 } })
page.cellTouchEnd()
console.log('\n=== 拖动换位 === slot0:', page.data.board[0].unit.name, 'slot1:', page.data.board[1].unit.name, '| 战力:', page.data.compare.ours.total.min + '~' + page.data.compare.ours.total.max)

// 敌方减益
const debuffHero = hs.filter((h) => h.skill && /敌方全体/.test(h.skill.desc))[0]
const es2 = page.model.enemy.slots.slice()
es2[11] = { idx: 11, col: 'mid', unit: card(debuffHero) }
page.setData({ side: 'enemy' })
page.commitSlots(es2)
page.setData({ side: 'ours' })
page.showDetail('ours')
console.log('\n=== 敌方减益（' + debuffHero.name + '） ===')
console.log('我方受到:', page.data.detail.enemyDebuffs.slice(0, 4))
console.log('我方区间:', page.data.compare.ours.total.min + '~' + page.data.compare.ours.total.max)

// 阵营加成量级：6 个商阵营英雄 → 7%
console.log('\n=== 阵营加成量级 + 悬浮面板数据 ===')
;['ours', 'enemy'].forEach((k) => page.model[k].slots.forEach((s) => { s.unit = null }))
const shang = hs.filter((h) => h.era === '商').slice(0, 6)
const sslots = page.model.ours.slots
shang.forEach((h, i) => { sslots[i].unit = card(h) })
page.setData({ side: 'ours' })
page.commitSlots(sslots)
const od = page.data.compare.ours.detail
console.log('eraLines:', JSON.stringify(od.eraLines), '| totalBuffPct:', od.totalBuffPct)
console.log('阵营技能:', JSON.stringify(od.eraSkillObjs))
if (od.totalBuffPct !== 7) { console.error('❌ 阵营加成量级不对'); process.exit(1) }

// 区间宽度来源抽查
const wide = hs.slice().sort((a, b) => (b.force[1] - b.force[0]) - (a.force[1] - a.force[0]))[0]
console.log('\n=== 区间宽度来源抽查 ===')
console.log('差值最大英雄:', wide.name, '武', wide.force, '智', wide.iq)

page.toggleCmpOverlay()
console.log('cmpOverlay:', page.data.cmpOverlay)
console.log('\n✅ 测试完成')
