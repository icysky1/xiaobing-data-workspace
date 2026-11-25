// 100 级口径对决：双方英雄属性 = 1级基础 + 每级成长×99 + 100级突破加成
// 品质<=5: +50/级, 突破+2900；品质>=6(含神话,取品6档): +65/级, 突破+4000
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
const growth = require('../data/hero_growth.json').tiers
const G = { 5: { per: growth['290001'].growthPerLevel, b100: 2900 }, 6: { per: growth['290006'].growthPerLevel, b100: 4000 } }
function stat100(h) {
  const t = G[h.quality >= 6 ? 6 : 5]
  const add = t.per * 99 + t.b100
  return {
    f0: (h.force ? h.force[0] : 0) + add, f1: (h.force ? h.force[1] : 0) + add,
    i0: (h.iq ? h.iq[0] : 0) + add, i1: (h.iq ? h.iq[1] : 0) + add,
  }
}
const byName = {}
Object.values(L.heroesMap).forEach((h) => { byName[h.name] = h })
const petByName = {}
L.petsData.forEach((p) => { petByName[p.name] = p })

const LINEUPS = {
  均衡版: {
    back: ['戏魂·姜子牙', '飞仙·褒姒', '伏羲', '月老', '飞仙·李白', '飞仙·花蕊夫人'],
    mid: ['飞仙·黄帝', '飞仙·女娲', '戏魂·蒙恬', '戏魂·昊天大帝', '妈祖'],
    front: ['孙悟空', '飞仙·哪吒', '蚩尤', '戏魂·李存孝', '黄金甲·盘古', '黄金甲·王贲'],
    pet: '鸣蛇', petIdx: 11,
  },
  特化版: {
    back: ['飞仙·女娲', '伏羲', '戏魂·姜子牙', '飞仙·李白', '戏魂·张良', '戏魂·华胥氏'],
    mid: ['月老', '飞仙·黄帝', '刘邦', '戏魂·昊天大帝', '妈祖'],
    front: ['飞仙·哪吒', '黄金甲·黄飞虎', '黄金甲·盘古', '孙悟空', '刑天', '蚩尤'],
    pet: '鸣蛇', petIdx: 11,
  },
  实战对手: {
    back: ['洛嫔', '黄金甲·嫦娥', '张良', '王昭君', '飞仙·女娲'],
    mid: ['老子', '司马迁', '飞仙·李白', '王阳明', '太阴星君'],
    front: ['黄金甲·精卫', '九天玄女', '后羿', '伏羲', '刘邦', '女艾'],
    pet: '貔貅', petIdx: 5,
  },
}
const ROW_IDX = { back: 0, mid: 6, front: 12 }
function buildSide(cfg) {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    ;(cfg[row] || []).forEach((name, i) => {
      const h = byName[name]
      if (!h) { console.log('[缺英雄]', name); return }
      const s = stat100(h)
      slots[ROW_IDX[row] + i].unit = Object.assign(L.heroCard(h), {
        forceMin: s.f0, forceMax: s.f1, iqMin: s.i0, iqMax: s.i1,
        force: (s.f0 + s.f1) / 2, iq: (s.i0 + s.i1) / 2,
      })
    })
  })
  const p = petByName[cfg.pet]
  if (p) slots[cfg.petIdx].unit = L.petCard(p)
  return slots
}
const fmt = (t) => `${Math.round(t.min)}~${Math.round(t.max)}`
function duel(a, b, lv) {
  const mk = (cfg) => {
    const slots = L.makeSlots()
    const base = buildSide(cfg)
    base.forEach((s, i) => { slots[i] = s })
    return slots
  }
  const r = L.calcAll({ ours: { slots: buildSide(LINEUPS[a]) }, enemy: { slots: buildSide(LINEUPS[b]) } })
  const sa = r.ours.detail.scheme, sb = r.enemy.detail.scheme
  console.log(`\n【${a}（先手） vs ${b}（后手）】${lv || ''}`)
  console.log(`  ${a}: ${fmt(r.ours.total)}   ${b}: ${fmt(r.enemy.total)}`)
  console.log(`  ${a} 后排智:${Math.round((r.ours.rows.back.min + r.ours.rows.back.max) / 2)}  ${b} 后排智:${Math.round((r.enemy.rows.back.min + r.enemy.rows.back.max) / 2)}`)
  console.log(`  判定: ${r.verdict}`)
  if (sa.has) console.log(`  军师技: ${a}发动 ${sa.name}Lv${sa.lv}（比值${sa.ratio}）→ ${sa.desc}`)
  else if (sb.has) console.log(`  军师技: ${b}发动 ${sb.name}Lv${sb.lv}（比值${sb.ratio}）→ ${sb.desc}`)
  else console.log('  军师技: 双方均未发动')
}
console.log('===== 100级口径 =====')
duel('均衡版', '实战对手', '(全员100级)')
duel('特化版', '实战对手', '(全员100级)')
duel('实战对手', '均衡版', '(全员100级,反向)')
duel('实战对手', '特化版', '(全员100级,反向)')
