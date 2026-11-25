// 验证：推演场次默认 100、可手动切换（预设 chip / 手输），且实际跑的场次与设置一致
const fs = require('fs')
const path = require('path')
const Module = require('module')

const store = {}
const toasts = []
global.wx = {
  setStorageSync(k, v) { store[k] = v },
  getStorageSync(k) { return store[k] === undefined ? '' : store[k] },
  showToast(o) { toasts.push(o && o.title) },
  createSelectorQuery() { return { selectAll: () => ({ fields: () => {} }), exec: () => {} } },
}
let pageCfg = null
global.Page = (cfg) => { pageCfg = cfg }

const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports = { makeSlots, heroCard, petCard, heroesMap }', P)
const X = L.exports
const fc = require('./formation-code.js')
const pets = require('../xiaobing-data/data/pets.js')

const NO2IDX = {}
for (let i = 0; i < 6; i++) { NO2IDX[3 + i * 3] = i; NO2IDX[2 + i * 3] = 6 + i; NO2IDX[1 + i * 3] = 12 + i }
function build(code) {
  const d = fc.decode(code)
  const slots = X.makeSlots()
  d.heroes.forEach((e) => {
    if (e.heroId >= 900000) {
      const p = pets.filter((x) => x.id === e.heroId)[0]
      if (p) slots[NO2IDX[e.position]].unit = X.petCard(p)
    } else if (X.heroesMap[e.heroId]) {
      slots[NO2IDX[e.position]].unit = X.heroCard(X.heroesMap[e.heroId])
    }
  })
  return slots
}

function newPage() {
  const pg = Object.create(pageCfg)
  pg.data = JSON.parse(JSON.stringify(pageCfg.data))
  pg.setData = function (o) { Object.assign(this.data, o) }
  pg.onLoad()
  pg.model.ours.slots = build('Z3-__GPYCIDiDmACOoDuPMMCDkM8DwDoCOCKCDvK5gid-o')
  pg.model.enemy.slots = build('Z33__EDCDeKiPOM-KmOEDQAIDGOGKoDEDMOmDTvLqAhicy')
  pg.recalc()
  return pg
}

function run(pg) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    pg.runBattleSim()
    const timer = setInterval(() => {
      if (pg.data.battleRunning) return
      clearInterval(timer)
      resolve({ res: pg.data.battleRes, ms: Date.now() - t0 })
    }, 20)
  })
}

function tap(pg, v) {
  pg.pickBattleSims({ currentTarget: { dataset: { v: v } } })
}
function type(pg, v) {
  pg.onBattleSimsInput({ detail: { value: String(v) } })
}

;(async () => {
  let ok = true
  const chk = (cond, msg) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + msg)
    if (!cond) ok = false
  }

  // 1) 无存储 → 默认 100
  delete store['xb-battle-sims']
  let pg = newPage()
  console.log('① 首次进入')
  chk(pg.data.battleSims === 100, '默认 100 场（实际 ' + pg.data.battleSims + '）')
  chk(pg.data.battleSimPresets.join('/') === '50/100/200/500/1000', '预设档位 50/100/200/500/1000')

  // 2) 预设切换 + 持久化
  console.log('② 点预设 500')
  tap(pg, 500)
  chk(pg.data.battleSims === 500, '切到 500')
  chk(store['xb-battle-sims'] === 500, '已写入存储 xb-battle-sims=500')

  // 3) 重进页面沿用
  console.log('③ 重进页面')
  let pg2 = newPage()
  chk(pg2.data.battleSims === 500, '沿用上次的 500（实际 ' + pg2.data.battleSims + '）')

  // 4) 手输
  console.log('④ 手输 120')
  type(pg2, 120)
  chk(pg2.data.battleSims === 120, '手输 120 生效')
  console.log('⑤ 手输越界 5000 / 空值 / 乱码')
  type(pg2, 5000)
  chk(pg2.data.battleSims === 2000, '5000 夹到 2000')
  type(pg2, 'abc')
  chk(pg2.data.battleSims === 100, '乱码回落默认 100')
  type(pg2, '')
  chk(pg2.data.battleSims === 100, '空值不改动')
  chk(toasts.filter((t) => t === '场次取 10~2000').length >= 2, '越界有提示')

  // 5) 实际跑的场次与设置一致
  console.log('⑥ 实际推演：设 150 场')
  type(pg2, 150)
  const r1 = await run(pg2)
  chk(r1.res && r1.res.n === 150, '跑了 150 场（实际 ' + (r1.res && r1.res.n) + '）')
  console.log('   耗时 ' + r1.ms + 'ms（150 场）｜胜率 ' + (r1.res && r1.res.winPct) + '% 平 ' + (r1.res && r1.res.drawPct) + '%')

  console.log('⑦ 实际推演：设 1000 场（看耗时线性）')
  type(pg2, 1000)
  const r2 = await run(pg2)
  chk(r2.res && r2.res.n === 1000, '跑了 1000 场（实际 ' + (r2.res && r2.res.n) + '）')
  console.log('   耗时 ' + r2.ms + 'ms（1000 场）｜胜率 ' + (r2.res && r2.res.winPct) + '%')
  chk(Math.abs(r2.res.winPct - r1.res.winPct) < 8, '1000 场与 150 场胜率同量级（' + r2.res.winPct + '% vs ' + r1.res.winPct + '%）')

  // 6) 输入框没失焦就点开战：以输入框内容为准
  console.log('⑧ 输入 250 后不失焦直接点开战')
  const pg4 = newPage()
  pg4.onBattleSimsTyping({ detail: { value: '250' } })
  const r4 = await run(pg4)
  chk(r4.res && r4.res.n === 250, '跑了 250 场（实际 ' + (r4.res && r4.res.n) + '）')
  chk(pg4.data.battleSims === 250, '按钮文案同步为 250')

  // 7) 默认 100 场实际跑一次
  console.log('⑨ 默认档：100 场')
  delete store['xb-battle-sims']
  const pg5 = newPage()
  const r3 = await run(pg5)
  chk(r3.res && r3.res.n === 100, '默认跑 100 场（实际 ' + (r3.res && r3.res.n) + '）')
  console.log('   耗时 ' + r3.ms + 'ms｜胜率 ' + r3.res.winPct + '%')

  console.log(ok ? '\n✅ 全部通过' : '\n❌ 有失败项')
  process.exit(ok ? 0 : 1)
})()
