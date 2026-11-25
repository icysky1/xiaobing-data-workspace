// 三方对决：鸣蛇v3均衡 vs 鸣蛇v2 vs 精卫核心版
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
const m = new Module('t')
m.filename = LINEUP_PATH
m.paths = Module._nodeModulePaths(path.dirname(LINEUP_PATH))
m._compile(code, LINEUP_PATH)
const L = m.exports
const byName = {}
Object.values(L.heroesMap).forEach((h) => (byName[h.name] = h))
const petByName = {}
L.petsData.forEach((p) => (petByName[p.name] = p))

const LINEUPS = {
  鸣蛇v3: {
    back: ['飞仙·黄帝', '妈祖', '伏羲', '飞仙·李白', '飞仙·女娲', '月老'],
    mid: ['黄金甲·王贲', '戏魂·蒙恬', '戏魂·岳飞', '黄金甲·织田信长', '戏魂·昊天大帝'],
    front: ['飞仙·岳云', '杨戬', '孙悟空', '戏魂·亚瑟王', '飞仙·哪吒', '阿瑞斯'],
    pet: '鸣蛇', petIdx: 11,
  },
  鸣蛇v2: {
    back: ['戏魂·姜子牙', '飞仙·褒姒', '伏羲', '月老', '飞仙·李白', '飞仙·花蕊夫人'],
    mid: ['飞仙·黄帝', '飞仙·女娲', '戏魂·蒙恬', '戏魂·昊天大帝', '妈祖'],
    front: ['孙悟空', '飞仙·哪吒', '蚩尤', '戏魂·李存孝', '黄金甲·盘古', '黄金甲·王贲'],
    pet: '鸣蛇', petIdx: 11,
  },
  精卫核心: {
    back: ['老子', '专诸', '飞仙·甄嬛儿', '高渐离', '红线', '霍光'],
    mid: ['黄金甲·嫦娥', '飞仙·黄帝', '孙悟空', '飞仙·孟姜女', '黄金甲·精卫'],
    front: ['黄金甲·聂隐娘', '项羽', '聂政', '荆轲', '戏魂·九天玄女', '共工'],
    pet: '鸣蛇', petIdx: 11,
  },
}
const ROW_IDX = { back: 0, mid: 6, front: 12 }
function build(cfg) {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    cfg[row].forEach((n, i) => {
      const idx = ROW_IDX[row] + i
      if (idx === cfg.petIdx && cfg.pet) return
      const h = byName[n]
      if (!h) console.log('[缺]', n)
      else slots[idx].unit = L.heroCard(h)
    })
  })
  if (cfg.pet) slots[cfg.petIdx].unit = L.petCard(petByName[cfg.pet])
  return slots
}
const fmt = (t) => Math.round(t.min) + '~' + Math.round(t.max)
const backMid = (s) => Math.round((s.rows.back.min + s.rows.back.max) / 2)
const midMid = (s) => Math.round((s.rows.mid.min + s.rows.mid.max) / 2)
function duel(a, b) {
  const r = L.calcAll({ ours: { slots: build(LINEUPS[a]) }, enemy: { slots: build(LINEUPS[b]) } })
  const sa = r.ours.detail.scheme, sb = r.enemy.detail.scheme
  console.log(`【${a}（先手） vs ${b}（后手）】`)
  console.log(`  ${a}: ${fmt(r.ours.total)}（中排${midMid(r.ours)} 后排${backMid(r.ours)}）   ${b}: ${fmt(r.enemy.total)}（中排${midMid(r.enemy)} 后排${backMid(r.enemy)}）`)
  console.log(`  判定: ${r.verdict}`)
  if (sa.has) console.log(`  军师技: ${a}发动 ${sa.name}Lv${sa.lv}（比值${sa.ratio}）→ ${sa.desc}`)
  else if (sb.has) console.log(`  军师技: ${b}发动 ${sb.name}Lv${sb.lv}（比值${sb.ratio}）→ ${sb.desc}`)
  else console.log('  军师技: 双方均未发动')
  const ed = r.enemy.detail.enemyDebuffs
  if (ed && ed.length) console.log('  对敌方施加削减:', JSON.stringify(ed))
  console.log('')
}
duel('鸣蛇v3', '鸣蛇v2')
duel('鸣蛇v2', '鸣蛇v3')
duel('精卫核心', '鸣蛇v3')
duel('鸣蛇v3', '精卫核心')
duel('鸣蛇v2', '精卫核心')
duel('精卫核心', '鸣蛇v2')
