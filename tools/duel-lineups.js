// 三方对决：原推荐 vs 后排优先变体 vs 用户当前阵容（引擎自动结算军师技）
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
const byName = {}
Object.values(L.heroesMap).forEach((h) => { byName[h.name] = h })
const petSnake = L.petsData.find((p) => p.name === '鸣蛇')

const LINEUPS = {
  原推荐: {
    back: ['戏魂·姜子牙', '飞仙·褒姒', '伏羲', '月老', '飞仙·李白', '飞仙·花蕊夫人'],
    mid: ['飞仙·黄帝', '飞仙·女娲', '戏魂·蒙恬', '戏魂·昊天大帝', '妈祖'],
    front: ['孙悟空', '飞仙·哪吒', '蚩尤', '戏魂·李存孝', '黄金甲·盘古', '黄金甲·王贲'],
  },
  后排优先: {
    back: ['飞仙·女娲', '飞仙·褒姒', '戏魂·姜子牙', '飞仙·李白', '月老', '飞仙·花蕊夫人'],
    mid: ['戏魂·蒙恬', '飞仙·黄帝', '嬴政', '戏魂·昊天大帝', '妈祖'],
    front: ['蚩尤', '黄金甲·王贲', '黄金甲·盘古', '孙悟空', '戏魂·李存孝', '飞仙·哪吒'],
  },
  当前阵容: {
    back: ['巴寡妇清', '霍光', '商鞅', '妈祖', '吕不韦', '李斯'],
    mid: ['飞仙·黄帝', '昊天大帝', '蒙恬', '嬴政', '黄金甲·王贲'],
    front: ['王翦', '陈胜', '李自成', '蚩尤', '洪秀全'],
    petFirst: true,
  },
}
const ROW_IDX = { back: 0, mid: 6, front: 12 }
function buildSide(cfg) {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    ;(cfg[row] || []).forEach((name, i) => {
      const h = byName[name]
      if (!h) { console.log('[缺英雄]', name); return }
      slots[ROW_IDX[row] + i].unit = L.heroCard(h)
    })
  })
  slots[cfg.petFirst ? 6 : 11].unit = L.petCard(petSnake)
  return slots
}
const fmt = (t) => `${Math.round(t.min)}~${Math.round(t.max)}`
function duel(a, b) {
  const r = L.calcAll({ ours: { slots: buildSide(LINEUPS[a]) }, enemy: { slots: buildSide(LINEUPS[b]) } })
  const sa = r.ours.detail.scheme, sb = r.enemy.detail.scheme
  console.log(`\n【${a} vs ${b}】`)
  console.log(`  ${a}: ${fmt(r.ours.total)}   ${b}: ${fmt(r.enemy.total)}   → ${r.verdict}`)
  const who = sa.has ? `${a}发动` : sb.has ? `${b}发动` : '均无'
  const eff = sa.has ? `${sa.name}Lv${sa.lv} ${sa.desc}` : sb.has ? `${sb.name}Lv${sb.lv} ${sb.desc}` : '-'
  console.log(`  军师技: ${who}（后排智 ${sa.ownBack || sb.oppBack} vs ${sb.ownBack || sa.ownBack}）→ ${eff}`)
}
duel('原推荐', '当前阵容')
duel('后排优先', '当前阵容')
duel('后排优先', '原推荐')
duel('当前阵容', '后排优先')
