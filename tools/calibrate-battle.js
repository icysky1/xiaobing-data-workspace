// 用 3 场实战（6 个观测值）校准逐回合推演引擎
// 用法：node tools/calibrate-battle.js grid | node tools/calibrate-battle.js detail 0.03 0.2
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.wx = { setStorageSync() {}, getStorageSync() { return null } }
global.Page = () => {}
const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports = { buildBattleSides, makeSlots, heroCard, petCard, heroesMap, petsData, calcAll }', P)
const X = L.exports
const sim = require('../xiaobing-data/utils/battleSim.js')
const fc = require('./formation-code.js')

const NO2IDX = {}
for (let i = 0; i < 6; i++) { NO2IDX[3 + i * 3] = i; NO2IDX[2 + i * 3] = 6 + i; NO2IDX[1 + i * 3] = 12 + i }
function build(code) {
  const d = fc.decode(code)
  const slots = X.makeSlots()
  d.heroes.forEach((e) => {
    if (e.heroId >= 900000) {
      const p = X.petsData.filter((x) => x.id === e.heroId)[0]
      if (p) slots[NO2IDX[e.position]].unit = X.petCard(p)
    } else if (X.heroesMap[e.heroId]) {
      slots[NO2IDX[e.position]].unit = X.heroCard(X.heroesMap[e.heroId])
    }
  })
  return slots
}

const CODE = {
  A: 'Z3-__GNMAqAmOYAEOcACOWDkMyAsDoPSAoAiPfvK4gxdek',
  B: 'Z33__EDCDeKiPOM-KmOEDQAIDGOGKoDEDMOmDTvLqAhicy',
  C: 'Z3-__GPYCIDiDmACOoDuPMMCDkM8DwDoCOCKCDvK5gid-o',
}
const S = { A: build(CODE.A), B: build(CODE.B), C: build(CODE.C) }

// 实战观测（三排之和，来自结算截图）；winner = 该场实际胜方
const OBS = [
  { name: 'B1 A攻B', atk: 'A', def: 'B', atkPow: 8122, defPow: 8470, winner: 'atk' },
  { name: 'B2 B攻C', atk: 'B', def: 'C', atkPow: 11939, defPow: 9183, winner: 'atk' },
  { name: 'B3 C攻B', atk: 'C', def: 'B', atkPow: 19230, defPow: 14432, winner: 'atk' },
]

function run(atk, def, opt, sims) {
  const sides = X.buildBattleSides(S[atk], S[def])
  const job = sim.createJob({ ours: sides.ours, enemy: sides.enemy, sims: sims || 300, opt })
  return job.step(1e9).stats
}

function evalOpt(opt, sims) {
  let err = 0
  let miss = 0
  const rows = []
  OBS.forEach((b) => {
    const r = run(b.atk, b.def, opt, sims)
    const e1 = Math.abs(r.ours.total - b.atkPow) / b.atkPow
    const e2 = Math.abs(r.enemy.total - b.defPow) / b.defPow
    err += e1 + e2
    const wr = b.winner === 'atk' ? r.winRate : r.loseRate
    if (wr < 0.5) miss++
    rows.push({ b, r, e1, e2, wr })
  })
  return { err: err / OBS.length, miss, rows }
}

function show(opt, sims) {
  const d = evalOpt(opt, sims)
  console.log('参数:', JSON.stringify(opt))
  d.rows.forEach((x) => {
    console.log(
      `  ${x.b.name}: 实战 ${x.b.atkPow}/${x.b.defPow} → 推演 ${x.r.ours.total}/${x.r.enemy.total}` +
      ` [排 ${x.r.ours.front}/${x.r.ours.mid}/${x.r.ours.back} vs ${x.r.enemy.front}/${x.r.enemy.mid}/${x.r.enemy.back}]` +
      ` 区间 ${x.r.ours.min}~${x.r.ours.max} 回合${x.r.avgRounds.toFixed(1)} 命中胜方概率${(x.wr * 100).toFixed(0)}%` +
      ` 误差 ${(x.e1 * 100).toFixed(0)}%/${(x.e2 * 100).toFixed(0)}%`
    )
  })
  console.log(`  平均相对误差 ${(d.err * 100).toFixed(1)}% · 胜负错判 ${d.miss}/3`)
  return d
}

if (require.main === module) {
  const mode = process.argv[2] || 'grid'
  if (mode === 'grid') {
    const out = []
    for (const k of [0.03, 0.045, 0.06]) {
      for (const gr of [0.02, 0.03, 0.045]) {
        for (const bias of [0, 1, 2, 3]) {
          const opt = { damageRatio: k, procRate: 0, growth: gr, growthBias: bias, maxRounds: 22, minRounds: 14, stackScale: 1, stacking: 'mul' }
          const r = evalOpt(opt, 200)
          out.push({ opt, err: r.err, miss: r.miss, rows: r.rows })
        }
      }
    }
    out.sort((a, b) => (a.miss - b.miss) || (a.err - b.err))
    out.slice(0, 8).forEach((x) => {
      console.log(
        `K=${x.opt.damageRatio} g=${x.opt.growth} bias=${x.opt.growthBias} → 误差 ${(x.err * 100).toFixed(1)}% 错判${x.miss} | ` +
        x.rows.map((y) => `${y.b.name}:${y.r.ours.total}/${y.r.enemy.total}(实${y.b.atkPow}/${y.b.defPow})`).join('  ')
      )
    })
    return
  }
  const opt = {
    damageRatio: Number(process.argv[3] || 0.045),
    procRate: 0, growthBias: Number(process.argv[4] || 0),
    growth: Number(process.argv[5] || 0),
    maxRounds: 18,
    stackScale: 1,
    stacking: 'add',
  }
  show(opt, 800)
}
module.exports = { evalOpt, show, OBS, S, build }
