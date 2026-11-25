// 诊断 7：号位（出手顺序）在当前模型里的权重
// 问题：用户给的战斗日志是「先手方1号位 → 后手方1号位 → 先手方2号位 …」交替释放，
//       那么同一排内换列（号位变化）会不会影响战力/胜率？先手方互换会不会影响结果？
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = () => {}
global.wx = { setStorageSync() {}, getStorageSync() { return '' } }
const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData, buildBattleSides }', P)
const X = L.exports
const sim = require('../xiaobing-data/utils/battleSim.js')
const pets = require('../xiaobing-data/data/pets.js')

const byName = {}
Object.values(X.heroesMap).forEach((h) => { byName[h.name] = h })
const petByName = {}
pets.forEach((p) => { petByName[p.name] = p })

// 一套真实阵容（11-01 实战我方）
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
const IDX_ROW = (i) => (i < 6 ? 'back' : i < 12 ? 'mid' : 'front')
const NO = (idx) => (idx % 6) * 3 + { front: 0, mid: 1, back: 2 }[IDX_ROW(idx)] + 1

function build(cfg) {
  const slots = X.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    ;(cfg[row] || []).forEach((name, i) => {
      const h = byName[name]
      if (h) slots[ROW_IDX[row] + i].unit = X.heroCard(h)
    })
  })
  if (cfg.petMid) slots[6 + 5].unit = X.petCard(petByName[cfg.petMid])
  if (cfg.petBack) slots[0 + 5].unit = X.petCard(petByName[cfg.petBack])
  return slots
}

function stat(oursSlots, enemySlots) {
  const r = X.calcAll({ ours: { slots: oursSlots }, enemy: { slots: enemySlots } })
  const mid = (t) => Math.round((t.min + t.max) / 2)
  const sx = X.buildBattleSides(oursSlots, enemySlots)
  const st = sim.createJob({ ours: sx.ours, enemy: sx.enemy, sims: 200, opt: {} }).step(1e9).stats
  return { o: mid(r.ours.total), e: mid(r.enemy.total), win: st.winRate, draw: st.drawRate }
}

const base = build(OURS)
const enemy = build(ENEMY)
const b0 = stat(base, enemy)
console.log('基准（我方原阵容）:', JSON.stringify(b0))

console.log('\n【A】前排 6 个英雄在 6 个格子间轮转（改变 1/4/7/10/13/16 号位的归属）')
const frontUnits = []
for (let i = 12; i < 18; i++) frontUnits.push(base[i].unit)
for (let k = 1; k <= 5; k++) {
  const slots = base.map((s) => ({ ...s }))
  for (let i = 0; i < 6; i++) {
    slots[12 + i] = { ...slots[12 + i], unit: frontUnits[(i + k) % 6] }
  }
  const s = stat(slots, enemy)
  console.log(
    `  轮转 ${k} 格: 我方 ${s.o} (${s.o - b0.o >= 0 ? '+' : ''}${s.o - b0.o})  胜率 ${(s.win * 100).toFixed(1)}%  平 ${(s.draw * 100).toFixed(1)}%`
  )
}

console.log('\n【B】把「先手号位」换成另一个英雄：前排 1 号位(王翦) 与 13 号位(洪秀全) 对调')
const swapped = base.map((s) => ({ ...s }))
const a = swapped[12].unit, b = swapped[16].unit
swapped[12] = { ...swapped[12], unit: b }
swapped[16] = { ...swapped[16], unit: a }
console.log('  对调后 1 号位 =', b.name, ' 13 号位 =', a.name, '→', JSON.stringify(stat(swapped, enemy)))

console.log('\n【C】交换先手方（谁先动）：battleSim 是否接受先手参数')
console.log('  createJob 入参键:', Object.keys(sim.createJob({ ours: {}, enemy: {}, sims: 1 }).stats || {}).join(',') || '(无先手字段)')
console.log('  battleSim.DEFAULTS:', JSON.stringify(sim.DEFAULTS))

console.log('\n【D】号位是否出现在推演输入里')
const sx = X.buildBattleSides(base, enemy)
console.log('  推演单位字段:', Object.keys(sx.ours.units[0]).join(','))
console.log('  → 号位/列序是否传递:', Object.keys(sx.ours.units[0]).indexOf('slotIdx') >= 0 ? '是' : '否')
console.log('  前 3 个单位（顺序=units 数组顺序）:', sx.ours.units.slice(0, 3).map((u) => u.name + '@' + u.row).join(' / '))
