// 阵容加成拆解：总战力中 技能 / 羁绊 / 阵营 各贡献多少
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }
const LP = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const code = fs.readFileSync(LP, 'utf8') + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('c')
m.filename = LP
m.paths = Module._nodeModulePaths(path.dirname(LP))
m._compile(code, LP)
const L = m.exports
const byName = {}
Object.values(L.heroesMap).forEach((h) => { byName[h.name] = h })

const LINEUP = {
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
    ;(cfg[row] || []).forEach((n, i) => {
      if (!n) return
      const idx = ROW_IDX[row] + i
      if (n.indexOf('PET:') === 0) {
        const p = L.petsData.find((x) => x.name === n.slice(4))
        if (p) slots[idx].unit = L.petCard(p)
        return
      }
      const h = byName[n]
      if (h) slots[idx].unit = L.heroCard(h)
    })
  })
  if (cfg.pet) slots[cfg.petIdx].unit = L.petCard(L.petsData.find((p) => p.name === cfg.pet))
  return slots
}
const enemySlots = build(ENEMY)
const lineupHeroes = [...LINEUP.front, ...LINEUP.mid, ...LINEUP.back].map((n) => byName[n]).filter(Boolean)

function measure() {
  const r = L.calcAll({ ours: { slots: build(LINEUP) }, enemy: { slots: enemySlots } })
  return {
    total: (r.ours.total.min + r.ours.total.max) / 2,
    min: r.ours.total.min, max: r.ours.total.max,
    enemy: (r.enemy.total.min + r.enemy.total.max) / 2,
    enemyMin: r.enemy.total.min, enemyMax: r.enemy.total.max,
    fetterCnt: r.ours.detail.fetters.length,
    skillCnt: r.ours.detail.skillLabels.length,
    petCnt: r.ours.detail.petLabels.length,
  }
}
const fmt = (v) => Math.round(v).toLocaleString('en-US')

const base = measure()
console.log(`【完整体】我方 ${fmt(base.min)}~${fmt(base.max)}（期望 ${fmt(base.total)}）| 敌方 ${fmt(base.enemyMin)}~${fmt(base.enemyMax)}（${fmt(base.enemy)}）`)
console.log(`  羁绊${base.fetterCnt}条 技能${base.skillCnt}条 神兽${base.petCnt}条`)

// 关技能
const savedSkill = lineupHeroes.map((h) => h.skill)
lineupHeroes.forEach((h) => { h.skill = { name: '', desc: '' } })
const noSkill = measure()
lineupHeroes.forEach((h, i) => { h.skill = savedSkill[i] })

// 关羁绊
const savedFet = lineupHeroes.map((h) => h.fetters)
lineupHeroes.forEach((h) => { h.fetters = [] })
const noFet = measure()
lineupHeroes.forEach((h, i) => { h.fetters = savedFet[i] })

// 同时关
lineupHeroes.forEach((h) => { h.skill = { name: '', desc: '' }; h.fetters = [] })
const noBoth = measure()
lineupHeroes.forEach((h, i) => { h.skill = savedSkill[i]; h.fetters = savedFet[i] })

console.log(`【关英雄技能】我方 ${fmt(noSkill.min)}~${fmt(noSkill.max)}｜敌方 ${fmt(noSkill.enemy)} → 我方技能贡献 +${fmt(base.total - noSkill.total)}，削减敌方 ${fmt(noSkill.enemy - base.enemy)}`)
console.log(`【关羁绊】    我方 ${fmt(noFet.min)}~${fmt(noFet.max)}｜敌方 ${fmt(noFet.enemy)} → 羁绊贡献 +${fmt(base.total - noFet.total)}`)
console.log(`【两者都关】  我方 ${fmt(noBoth.min)}~${fmt(noBoth.max)}｜敌方 ${fmt(noBoth.enemy)} → 合计 +${fmt(base.total - noBoth.total)}，削减敌方 ${fmt(noBoth.enemy - base.enemy)}`)
console.log(`裸值（仅面板+阵营）${fmt(noBoth.total)}，加成倍率 ×${(base.total / noBoth.total).toFixed(2)}`)

// 单英雄技能贡献
console.log('\n【单英雄技能贡献（只关掉该英雄技能后的战力损失 / 对被削敌方的回升）】')
const perHero = []
savedSkill.forEach((sk, idx) => {
  const h = lineupHeroes[idx]
  h.skill = { name: '', desc: '' }
  const v = measure()
  h.skill = sk
  perHero.push({ name: h.name, skillName: (sk && sk.name) || '', loss: base.total - v.total, enemyBack: v.enemy - base.enemy })
})
perHero.sort((a, b) => b.loss - a.loss)
perHero.forEach((x) => console.log(`  ${x.name}（${x.skillName}）：我方 -${fmt(x.loss)}｜敌方 +${fmt(x.enemyBack)}`))

// 单条羁绊价值：全局拆除该羁绊（所有持有者同删）
console.log('\n【单条羁绊价值（全局拆除后的战力损失）】')
const active = base.fetterCnt ? null : null
const bondMap = {}
savedFet.forEach((fets, idx) => fets.forEach((ft) => { if (!bondMap[ft.id]) bondMap[ft.id] = { ft, owners: [] }; bondMap[ft.id].owners.push(idx) }))
const bondRows = []
Object.values(bondMap).forEach(({ ft, owners }) => {
  owners.forEach((i) => { lineupHeroes[i].fetters = lineupHeroes[i].fetters.filter((x) => x.id !== ft.id) })
  const v = measure()
  owners.forEach((i) => { lineupHeroes[i].fetters = savedFet[i] })
  if (v.fetterCnt < base.fetterCnt) bondRows.push({ name: ft.name, effect: ft.effect, loss: base.total - v.total })
})
bondRows.sort((a, b) => b.loss - a.loss)
bondRows.forEach((x) => console.log(`  ${x.name} ${x.effect}：-${fmt(x.loss)}`))
