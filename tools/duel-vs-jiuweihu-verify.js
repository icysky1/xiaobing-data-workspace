// 验证：众生平等 我方鸣蛇阵容 vs 图片敌方(九尾狐)阵容
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }

const LP = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const code = fs.readFileSync(LP, 'utf8') + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('v')
m.filename = LP
m.paths = Module._nodeModulePaths(path.dirname(LP))
m._compile(code, LP)
const L = m.exports
const byName = {}
Object.values(L.heroesMap).forEach((h) => { byName[h.name] = h })

const OURS = {
  back: ['黄金甲·嫦娥', '飞仙·李白', '太阴星君', '飞仙·苏妲己', '红线', '飞仙·黄帝'],
  mid: ['妇好', '黄金甲·聂隐娘', '戏魂·华胥氏', '黄金甲·精卫', '孙悟空'],
  front: ['黄金甲·邓婵玉', '吴刚', '平阳昭公主', '戏魂·阿青', '戏魂·祝融', '戏魂·九天玄女'],
  pet: '鸣蛇', petIdx: 11,
}
const ENEMY = {
  back: ['九天玄女', '女艾', 'PET:九尾狐', '后羿', '黄金甲·精卫', '女娲'],
  mid: ['黄金甲·雨师妾', '伏羲', '黄金甲·嫦娥', '刘邦', '李白', '洛嫔'],
  front: [null, '张良', '飞仙·涂山女', '夏启', '大禹', '飞仙·赵飞燕'],
}
const ROW_IDX = { back: 0, mid: 6, front: 12 }

function build(cfg) {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    ;(cfg[row] || []).forEach((name, i) => {
      if (!name) return
      const idx = ROW_IDX[row] + i
      if (name.indexOf('PET:') === 0) {
        const p = L.petsData.find((x) => x.name === name.slice(4))
        if (p) slots[idx].unit = L.petCard(p)
        return
      }
      const h = byName[name]
      if (!h) { console.log('[缺英雄]', name); return }
      slots[idx].unit = L.heroCard(h)
    })
  })
  if (cfg.pet) slots[cfg.petIdx].unit = L.petCard(L.petsData.find((p) => p.name === cfg.pet))
  return slots
}
const ours = build(OURS)
const enemy = build(ENEMY)
const fmtT = (t) => `${Math.round(t.min)}~${Math.round(t.max)}`
const mid = (t) => (t.min + t.max) / 2
function show(tag, r) {
  const o = r.ours, e = r.enemy
  console.log(`\n【${tag}】`)
  console.log(`  我方总战力 ${fmtT(o.total)}（前 ${Math.round(o.rows.front.min)}~${Math.round(o.rows.front.max)} 中 ${Math.round(o.rows.mid.min)}~${Math.round(o.rows.mid.max)} 后 ${Math.round(o.rows.back.min)}~${Math.round(o.rows.back.max)}）`)
  console.log(`  敌方总战力 ${fmtT(e.total)}（前 ${Math.round(e.rows.front.min)}~${Math.round(e.rows.front.max)} 中 ${Math.round(e.rows.mid.min)}~${Math.round(e.rows.mid.max)} 后 ${Math.round(e.rows.back.min)}~${Math.round(e.rows.back.max)}）`)
  console.log(`  净胜差 ${(mid(o.total) - mid(e.total)).toFixed(0)}`)
  console.log('  我方阵容加成:', JSON.stringify(o.detail.eraBuffs), '| 阵营技能:', JSON.stringify(o.detail.eraSkills))
  console.log('  我方神兽:', JSON.stringify(o.detail.petLabels))
  console.log('  我方羁绊数:', o.detail.fetters.length)
  console.log('  敌方对我方减益:', JSON.stringify(o.detail.enemyDebuffs))
  console.log('  我方对敌方减益:', JSON.stringify(e.detail.enemyDebuffs))
  console.log('  敌方神兽:', JSON.stringify(e.detail.petLabels))
}
show('先手（我方=ours）', L.calcAll({ ours: { slots: ours }, enemy: { slots: enemy } }))
show('互换（敌方=ours）', L.calcAll({ ours: { slots: enemy }, enemy: { slots: ours } }))

// 对照：旧 v3 阵容（众生平等口径）
const V3 = {
  back: ['飞仙·黄帝', '妈祖', '伏羲', '飞仙·李白', '飞仙·女娲', '月老'],
  mid: ['黄金甲·王贲', '戏魂·蒙恬', '戏魂·岳飞', '黄金甲·织田信长', '戏魂·昊天大帝'],
  front: ['飞仙·岳云', '杨戬', '孙悟空', '戏魂·亚瑟王', '飞仙·哪吒', '阿瑞斯'],
  pet: '鸣蛇', petIdx: 11,
}
const r3 = L.calcAll({ ours: { slots: build(V3) }, enemy: { slots: enemy } })
console.log(`\n【对照 旧v3】我方 ${fmtT(r3.ours.total)} vs 敌方 ${fmtT(r3.enemy.total)}  净胜差 ${(mid(r3.ours.total) - mid(r3.enemy.total)).toFixed(0)}`)
