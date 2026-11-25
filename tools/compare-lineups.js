// 当前阵容 vs 推荐阵容 同口径对决（模拟器真引擎，1级口径，含羁绊/阵营/技能/90级鸣蛇）
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }

const LINEUP_PATH = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
let src = fs.readFileSync(LINEUP_PATH, 'utf8')
const PATCH_FROM = '!x.ul || x.ul === 1'
const PATCH_TO = "(!x.ul || (x.ul === 1 && ['涸泽之咒','旱气鞭笞'].indexOf(x.n) < 0) || (x.n === '涸泽之咒' && x.ul === 85) || (x.n === '旱气鞭笞' && x.ul === 90) || (x.n === '龟裂禁域' && x.ul === 50))"
src = src.replace(PATCH_FROM, PATCH_TO)
const code = src + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('lineup-under-test')
m.filename = LINEUP_PATH
m.paths = Module._nodeModulePaths(path.dirname(LINEUP_PATH))
m._compile(code, LINEUP_PATH)
const L = m.exports

const byName = {}
Object.values(L.heroesMap).forEach((h) => { byName[h.name] = h })
const petSnake = L.petsData.find((p) => p.name === '鸣蛇')

// 当前阵容（截图）：中排第1格是鸣蛇；前排第6格为空
const CURRENT = {
  back: ['巴寡妇清', '霍光', '商鞅', '妈祖', '吕不韦', '李斯'],
  mid: ['飞仙·黄帝', '昊天大帝', '蒙恬', '嬴政', '黄金甲·王贲'], // 鸣蛇占中排第1格(idx6)
  front: ['王翦', '陈胜', '李自成', '蚩尤', '洪秀全'],
  petFirst: true,
}
// 推荐阵容（搜索结果）：鸣蛇占中排第6格(idx11)
const RECO = {
  back: ['戏魂·姜子牙', '飞仙·褒姒', '伏羲', '月老', '飞仙·李白', '飞仙·花蕊夫人'],
  mid: ['飞仙·黄帝', '飞仙·女娲', '戏魂·蒙恬', '戏魂·昊天大帝', '妈祖'],
  front: ['孙悟空', '飞仙·哪吒', '蚩尤', '戏魂·李存孝', '黄金甲·盘古', '黄金甲·王贲'],
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
  // 鸣蛇：当前阵容占中排第1格，推荐阵容占中排第6格
  slots[cfg.petFirst ? 6 : 11].unit = L.petCard(petSnake)
  return slots
}

const model = { ours: { slots: buildSide(RECO) }, enemy: { slots: buildSide(CURRENT) } }
const r = L.calcAll(model)
const fmt = (t) => `${Math.round(t.min)} ~ ${Math.round(t.max)}`

function report(label, side) {
  const d = side.detail
  console.log(`\n----- ${label} -----`)
  console.log('总战力:', fmt(side.total), ' rows:', JSON.stringify(side.rows))
  console.log('阵营效果:', JSON.stringify(d.eraBuffs))
  console.log('阵营技能:', JSON.stringify(d.eraSkills))
  console.log('羁绊 ' + (d.fetters || []).length + ' 条:', (d.fetters || []).map((x) => x.name).join('、'))
  console.log('军师技:', JSON.stringify(d.scheme))
  console.log('未量化:', JSON.stringify(d.unq))
}
console.log('===== 同口径单边对比（1级基础 + 全部加成，已含主战/防守+100%口径）=====')
report('当前阵容（秦阵营 16 英雄 + 鸣蛇，前排空1格）', r.enemy)
report('推荐阵容（搜索最优 17 英雄 + 鸣蛇）', r.ours)
console.log('\n===== 正面交锋（推荐=先手我方，当前=后手敌方）=====')
console.log('我方(推荐):', fmt(r.ours.total), ' 敌方(当前):', fmt(r.enemy.total))
console.log('判定:', r.verdict)
console.log('军师技: 我方', JSON.stringify(r.ours.detail.scheme), ' 敌方', JSON.stringify(r.enemy.detail.scheme))
