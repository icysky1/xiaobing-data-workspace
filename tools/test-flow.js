// 实战流程引擎验证：先手按基础战力判定、2 倍秒杀、50% 单挑、阵容技能后置
const sim = require('../xiaobing-data/utils/battleSim.js')

function unit(name, row, slot, f, i) {
  return { name, row, slot, baseFmin: f, baseFmax: f, baseImin: i, baseImax: i }
}
const ok = []
const add = (name, cond) => { ok.push([name, !!cond]); console.log((cond ? '✅' : '❌') + ' ' + name) }

// ---- 场景 1：秒杀（我方基础战力 3 倍） ----
const strong = {
  label: '我方', finalMult: 2,
  units: [unit('猛将', 'front', 1, 3000, 100), unit('肉盾', 'mid', 2, 3000, 100), unit('军师', 'back', 3, 100, 3000)],
  skills: [],
}
const weak = {
  label: '敌方', finalMult: 2,
  units: [unit('小兵', 'front', 1, 500, 100), unit('小兵', 'mid', 2, 500, 100)],
  skills: [{ from: 0, slot: 1, kind: 'buff', p: 1, own: [{ t: 0, apF: 5, apI: 5 }], foe: [], tag: '自身+500%' }],
}
const j1 = sim.createJob({ ours: strong, enemy: weak, sims: 50, opt: {} })
const s1 = j1.step(1e9).stats
add('3 倍基础战力 → 秒杀判定=我方', j1.instant === 'ours')
add('秒杀时我方胜率 100%', s1.winRate === 1)
add('秒杀时敌方技能不放（fired=0）', s1.avgFired === 0)

// ---- 场景 2：先手按基础战力判定（不是发起方） ----
// 敌方基础战力略高（先手），1 号位带大 buff；我方 1 号位沉默 + 2 号位小 buff：
// 敌方先手 → 大 buff 先放出 → 敌方胜；强制我方先手 → 沉默压掉大 buff → 我方胜
const ours2 = {
  label: '我方', finalMult: 2,
  units: [unit('沉默手', 'front', 1, 2200, 100), unit('肉盾', 'mid', 2, 1050, 1050)],
  skills: [
    { from: 0, slot: 1, kind: 'silence', hits: [{ t: 0, p: 1 }], tag: '沉默对方1号位' },
    { from: 1, slot: 2, kind: 'buff', p: 1, own: [{ t: 1, apF: 1, apI: 1 }], foe: [], tag: '自身+100%' },
  ],
}
const enemy2 = {
  label: '敌方', finalMult: 2,
  units: [unit('大核心', 'front', 1, 2200, 100), unit('肉盾', 'mid', 2, 2100, 100)],
  skills: [{ from: 0, slot: 1, kind: 'buff', p: 1, own: [{ t: 0, apF: 9, apI: 9 }], foe: [], tag: '自身+900%' }],
}
const j2 = sim.createJob({ ours: ours2, enemy: enemy2, sims: 300, opt: { noise: 0.001, solo: false } })
const s2 = j2.step(1e9).stats
add('基础战力敌方更高 → 判敌方先手（非发起方我方）', j2.first === 'enemy')
add('敌方先手放大 buff → 我方胜率 < 10%', s2.winRate < 0.1)
const s2f = sim.createJob({ ours: ours2, enemy: enemy2, sims: 300, opt: { noise: 0.001, solo: false, first: 'ours' } }).step(1e9).stats
add('强制我方先手沉默压掉 buff → 我方胜率 > 90%', s2f.winRate > 0.9)

// ---- 场景 3：50% 单挑 ----
// 双方完全对称，唯一变量是单挑：败方前排 -50% 后输 → 胜率应接近 50%，单挑触发约 50%
function mirror(f) {
  return {
    label: f, finalMult: 2,
    units: [unit('猛将' + f, 'front', 1, 1000, 100), unit('肉盾' + f, 'mid', 2, 500, 500)],
    skills: [],
  }
}
const j3 = sim.createJob({ ours: mirror('甲'), enemy: mirror('乙'), sims: 2000, opt: { noise: 0 } })
const s3 = j3.step(1e9).stats
add('对称阵容 + 单挑 → 我方胜率 45~55%', s3.winRate > 0.45 && s3.winRate < 0.55)
add('单挑触发率 45~55%', s3.soloRate > 0.45 && s3.soloRate < 0.55)
const j3n = sim.createJob({ ours: mirror('甲'), enemy: mirror('乙'), sims: 500, opt: { noise: 0, solo: false } })
const s3n = j3n.step(1e9).stats
add('关掉单挑 → 全平局（说明单挑在起作用）', s3n.drawRate === 1)

// ---- 场景 4：阵容技能后置（号位技能放完才轮到阵容技能） ----
// 用 phase 直接构造：我方 1 号位沉默「敌方 18 号位」，敌方 18 号位是阵容技能来源
const ours4 = {
  label: '我方', finalMult: 2,
  units: [unit('沉默手', 'front', 1, 1000, 100), unit('肉盾', 'mid', 2, 800, 800)],
  skills: [{ from: 0, slot: 1, kind: 'silence', hits: [{ t: 0, p: 1 }], tag: '沉默对方1号位' }],
}
const enemy4 = {
  label: '敌方', finalMult: 2,
  units: [unit('肉盾', 'front', 1, 900, 100), unit('后排', 'back', 18, 100, 900)],
  // 敌方 18 号位的普通技能：给我方沉默手沉默标记？不行——用 buff 对比即可：
  skills: [
    { from: 1, slot: 18, kind: 'buff', p: 1, phase: 'slot', own: [{ t: 1, apF: 2, apI: 2 }], foe: [], tag: '18号位自身+200%（普通技能）' },
    { from: -1, slot: 1, kind: 'buff', p: 1, phase: 'era', own: [{ t: 1, apF: 2, apI: 2 }], foe: [], tag: '阵容技能+200%（应照常生效）' },
  ],
}
const j4 = sim.createJob({ ours: ours4, enemy: enemy4, sims: 200, opt: { noise: 0, solo: false, instant: false } })
const s4 = j4.step(1e9).stats
add('场景 4 正常出结果（引擎不崩）', s4.n === 200)

let bad = 0
ok.forEach((it) => { if (!it[1]) bad++ })
console.log(bad ? '\n失败 ' + bad + ' 项' : '\n全部通过')
process.exit(bad ? 1 : 0)
