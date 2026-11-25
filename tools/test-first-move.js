// 先手机制验证：同号位（1 号位）沉默 vs 1 号位大 buff，交换先手后胜负是否翻转
const sim = require('../xiaobing-data/utils/battleSim.js')

function unit(name, row, slot, f, i) {
  return { name, row, slot, baseFmin: f, baseFmax: f, baseImin: i, baseImax: i }
}
// 我方：1 号位沉默手 + 中排肉盾
const ours = {
  label: '我方',
  finalMult: 2,
  units: [unit('沉默手', 'front', 1, 3000, 3000), unit('肉盾', 'mid', 2, 3000, 3000), unit('后排', 'back', 3, 0, 2000)],
  skills: [{ from: 0, slot: 1, kind: 'silence', hits: [{ t: 0, p: 1 }], tag: '1号位沉默对方1号位' }],
}
// 敌方：1 号位带 +300% 大 buff（同号位，才受先手影响）
const enemy = {
  label: '敌方',
  finalMult: 2,
  units: [unit('先手核心', 'front', 1, 3000, 3000), unit('肉盾', 'mid', 2, 2000, 2000)],
  skills: [{ from: 0, slot: 1, kind: 'buff', p: 1, own: [{ t: 0, pf: 3, pi: 3, df: 0, di: 0 }], foe: [], tag: '自身武力智力+300%' }],
}

function run(first) {
  const j = sim.createJob({ ours, enemy, sims: 300, opt: { first, noise: 0.005, solo: false } })
  return j.step(1e9).stats
}
const a = run('ours')
const b = run('enemy')
console.log('我方先手：我方胜率 ' + (a.winRate * 100).toFixed(1) + '% ，终局 ' + a.ours.total + ' vs ' + a.enemy.total)
console.log('敌方先手：我方胜率 ' + (b.winRate * 100).toFixed(1) + '% ，终局 ' + b.ours.total + ' vs ' + b.enemy.total)
console.log(a.winRate > 0.9 && b.winRate < 0.1 ? '✅ 同号位先手能压掉对方技能（先手价值成立）' : '❌ 先手没有生效')
