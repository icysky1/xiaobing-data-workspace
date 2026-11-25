// 众生平等实战对战核验：把 2026-11-01 实战阵容灌入模拟器引擎，对比游戏结算 8615 vs 7381
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }

const LINEUP_PATH = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const src = fs.readFileSync(LINEUP_PATH, 'utf8')
const code = src + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('lineup-under-test')
m.filename = LINEUP_PATH
m.paths = Module._nodeModulePaths(path.dirname(LINEUP_PATH))
m._compile(code, LINEUP_PATH)
const L = m.exports

const byName = {}
Object.values(L.heroesMap).forEach((h) => { byName[h.name] = h })
const petByName = {}
L.petsData.forEach((p) => { petByName[p.name] = p })

// 实战阵容（由对战记录逐页还原）：
// 我方(先手)：前排=王翦/陈胜/李自成/蚩尤/洪秀全，中排=飞仙·黄帝/昊天大帝/蒙恬/嬴政/黄金甲·王贲，后排=巴寡妇清/霍光/商鞅/妈祖/吕不韦/李斯，神兽=鸣蛇(中排)
// 敌方(后手)：后排=洛嫔/黄金甲·嫦娥/张良/王昭君/飞仙·女娲，前排=黄金甲·精卫/九天玄女/后羿/伏羲/刘邦/女艾，中排=老子/司马迁/飞仙·李白/王阳明/太阴星君，神兽=貔貅(后排)
const OURS = {
  back: ['巴寡妇清', '霍光', '商鞅', '妈祖', '吕不韦', '李斯'],
  mid: ['飞仙·黄帝', '昊天大帝', '蒙恬', '嬴政', '黄金甲·王贲'],
  front: ['王翦', '陈胜', '李自成', '蚩尤', '洪秀全'],
  petMid: '鸣蛇',
}
const ENEMY = {
  back: ['洛嫔', '黄金甲·嫦娥', '张良', '王昭君', '飞仙·女娲'],
  mid: ['老子', '司马迁', '飞仙·李白', '王阳明', '太阴星君'],
  front: ['黄金甲·精卫', '九天玄女', '后羿', '伏羲', '刘邦', '女艾'],
  petBack: '貔貅',
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
  if (cfg.petMid) slots[6 + 5].unit = L.petCard(petByName[cfg.petMid])
  if (cfg.petBack) slots[0 + 5].unit = L.petCard(petByName[cfg.petBack])
  return slots
}

const model = { ours: { slots: buildSide(OURS) }, enemy: { slots: buildSide(ENEMY) } }
const r = L.calcAll(model)

const fmt = (t) => (t && t.min !== undefined ? `${Math.round(t.min)} ~ ${Math.round(t.max)}` : JSON.stringify(t))
console.log('===== 模拟器输出 =====')
console.log('我方总战力区间:', fmt(r.ours.total))
console.log('敌方总战力区间:', fmt(r.enemy.total))
console.log('判定:', r.verdict)
console.log('我方 rows:', JSON.stringify(r.ours.rows || r.ours.rowTotal || 'n/a'))
console.log('敌方 rows:', JSON.stringify(r.enemy.rows || r.enemy.rowTotal || 'n/a'))
console.log('我方军师技:', JSON.stringify(r.ours.detail && r.ours.detail.scheme))
console.log('敌方军师技:', JSON.stringify(r.enemy.detail && r.enemy.detail.scheme))
console.log('我方未量化:', JSON.stringify(r.ours.detail && r.ours.detail.unq))
console.log('敌方未量化:', JSON.stringify(r.enemy.detail && r.enemy.detail.unq))
console.log('我方羁绊:', JSON.stringify(r.ours.detail && r.ours.detail.fetters))
console.log('敌方羁绊:', JSON.stringify(r.enemy.detail && r.enemy.detail.fetters))
console.log('我方阵营效果:', JSON.stringify(r.ours.detail && r.ours.detail.eraBuffs))
console.log('敌方阵营效果:', JSON.stringify(r.enemy.detail && r.enemy.detail.eraBuffs))
console.log('我方阵营技能:', JSON.stringify(r.ours.detail && r.ours.detail.eraSkills))
console.log('敌方阵营技能:', JSON.stringify(r.enemy.detail && r.enemy.detail.eraSkills))

// 逐单位最终三维（区间），供与战斗日志反推值对比
function dumpUnits(side, label) {
  console.log(`----- ${label} 单位明细 -----`)
  ;(side.units || []).forEach((u) => {
    const f = u.effFmin !== undefined ? `${u.effFmin.toFixed(0)}~${u.effFmax.toFixed(0)}` : String(u.pf)
    const iq = u.effImin !== undefined ? `${u.effImin.toFixed(0)}~${u.effImax.toFixed(0)}` : String(u.pi)
    console.log(`${u.name} [${u.row}] 武:${f} 智:${iq} (pf=${u.pf && u.pf.toFixed ? u.pf.toFixed(2) : u.pf} pi=${u.pi && u.pi.toFixed ? u.pi.toFixed(2) : u.pi} df=${u.df && u.df.toFixed ? u.df.toFixed(2) : u.df} di=${u.di && u.di.toFixed ? u.di.toFixed(2) : u.di})`)
  })
}
console.log('unit 字段样例:', JSON.stringify((r.ours.units || [])[0]))
dumpUnits(r.ours, '我方')
dumpUnits(r.enemy, '敌方')

console.log('===== 实战结算对比 =====')
console.log('游戏实际: 我方 8615 / 敌方 7381 （主战+100%、防守+100% 显示口径）')
console.log('若 +100% 为结算加倍，则对应基础口径: 我方 4307.5 / 敌方 3690.5')
