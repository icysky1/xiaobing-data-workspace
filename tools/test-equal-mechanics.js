#!/usr/bin/env node
// 众生平等模拟新增机制自测：共鸣满羁绊（crossFetter）+ 连携强化（replaceSkill×1.5）+ 势力加成
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.wx = { setStorageSync() {}, getStorageSync() { return '' } }
global.Page = () => {}
global.getApp = () => ({ globalData: { publicConfig: {} } })
// 云 SDK 存根
const cloudPath = path.resolve(__dirname, '../xiaobing-data/utils/cloud.js')
const cm = new Module(cloudPath)
cm.filename = cloudPath
cm.loaded = true
cm.exports = { cloud: {}, publicConfig: {} }
require.cache[cloudPath] = cm

const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports = { makeSlots, heroCard, heroesMap, buildBattleSides, collectSide, activeFetters, slotNoOf }', P)
const X = L.exports
const sim = require('../xiaobing-data/utils/battleSim.js')
const hm = X.heroesMap

let pass = 0, fail = 0
function check(name, cond, extra) {
  if (cond) { pass++; console.log('✅', name, extra !== undefined ? '→ ' + extra : '') }
  else { fail++; console.log('❌', name, extra !== undefined ? '→ ' + extra : '') }
}
function slotsByNo() {
  const s = X.makeSlots()
  const byNo = {}
  s.forEach((x) => { byNo[X.slotNoOf(x.idx, x.col)] = x })
  return { slots: s, byNo }
}

// ---------- 1) 共鸣满羁绊：cf 英雄的羁绊不依赖同阵搭档 ----------
const mengtian = Object.values(hm).find((h) => h.name === '戏魂·蒙恬')
check('戏魂·蒙恬 cf=1', !!mengtian && !!mengtian.cf)
const s1 = slotsByNo()
s1.byNo[1].unit = X.heroCard(mengtian)
const names1 = s1.slots.filter((x) => x.unit).map((u) => u.unit.name)
const ft1 = X.activeFetters(names1).filter((f) => f.holder === '蒙恬')
check('共鸣：单上蒙恬也激活其羁绊（满羁绊口径）', ft1.length > 0, '激活 ' + ft1.length + ' 条: ' + ft1.map((f) => f.name).join('/'))
// 对照：非 cf 英雄的羁绊仍需搭档在场（找一条需要多人的羁绊）
const soloOwner = Object.values(hm).find((h) => !h.cf && (h.fetters || []).some((f) => f.heroes && f.heroes.length > 1))
if (soloOwner) {
  const s2 = slotsByNo()
  s2.byNo[1].unit = X.heroCard(soloOwner)
  const act2 = X.activeFetters([soloOwner.name]).filter((f) => f.holder === (function (n) { const b = n.replace(/^(飞仙·|戏魂·|黄金甲·|赛博·)/, ''); return b })(soloOwner.name))
  check('非共鸣英雄仍需搭档在场', act2.length === 0, soloOwner.name + ' 激活 ' + act2.length + ' 条')
}

// ---------- 2) 连携强化：赛博·张飞与相邻进化英雄 → 技能增量 ×1.5 ----------
const zf = Object.values(hm).find((h) => h.name === '赛博·张飞')
check('赛博·张飞 rs=1', !!zf && !!zf.rs)
const neighbor = Object.values(hm).find((h) => h.name.indexOf('飞仙·') === 0)
check('存在飞仙系列（进化邻居）', !!neighbor)
// 张飞前排（号位 1），邻居放号位 4（同行相邻）；不相邻场景放号位 16（同行远端）
function zfSide(withAdj) {
  const s = slotsByNo()
  s.byNo[1].unit = X.heroCard(zf)
  s.byNo[withAdj ? 4 : 16].unit = X.heroCard(neighbor)
  return s.slots
}
function enemyOne(id, no) {
  const s = slotsByNo()
  s.byNo[no || 3].unit = X.heroCard(hm[id])
  return s.slots
}
const dummyId = Object.keys(hm).find((k) => hm[k].quality === 5 && hm[k].name.indexOf('·') < 0)
// 张飞技能打「敌方同位置」→ 敌人要摆同号位（1）
const adjB = X.buildBattleSides(zfSide(true), enemyOne(dummyId, 1), 110, 110)
const farB = X.buildBattleSides(zfSide(false), enemyOne(dummyId, 1), 110, 110)
function zfPackets(B) {
  return (B.ours.skills || []).filter((sk) => sk.from >= 0 && B.ours.units[sk.from] && B.ours.units[sk.from].name === '赛博·张飞')
}
const adjPk = zfPackets(adjB)
const farPk = zfPackets(farB)
check('相邻时张飞报文带 lx 标记', adjPk.some((s) => s.lx), '报文 ' + adjPk.length + ' 条')
check('不相邻时无 lx 标记', farPk.every((s) => !s.lx))
function totalDelta(pkts) {
  let s = 0
  pkts.forEach((sk) => {
    if (sk.kind !== 'buff') return
    ;(sk.foe || []).forEach((d) => { s += Math.abs(d.apF || 0) + Math.abs(d.afF || 0) + Math.abs(d.apI || 0) + Math.abs(d.afI || 0) })
  })
  return s
}
const dAdj = totalDelta(adjPk), dFar = totalDelta(farPk)
check('连携增量 ≈1.5×', dFar > 0 && Math.abs(dAdj / dFar - 1.5) < 0.02, '相邻 ' + Math.round(dAdj * 1000) / 1000 + ' vs 不相邻 ' + Math.round(dFar * 1000) / 1000)

// ---------- 3) 势力 20% 计入终局 ----------
// 用两个实力接近的赛博英雄对撞（避免触发 2 倍秒杀，秒杀判定不受势力影响）
const zhangfeiId = zf.id
const foeId = Object.keys(hm).find((k) => hm[k].name === '赛博·蚩尤') || Object.keys(hm).find((k) => hm[k].name === '赛博·伏羲')
const o1 = slotsByNo(); o1.byNo[1].unit = X.heroCard(hm[zhangfeiId])
const o2 = slotsByNo(); o2.byNo[4].unit = X.heroCard(hm[foeId]) // 敌方也放前排，避免战力悬殊触发秒杀
const b2 = X.buildBattleSides(o1.slots, o2.slots, 110, 110)
let win0 = 0, win20 = 0, N = 300
for (let i = 0; i < N; i++) {
  if (sim.runOnce(b2.ours, b2.enemy, { noise: 0.02, throneEnemy: 0 }).winner === 'ours') win0++
  if (sim.runOnce(b2.ours, b2.enemy, { noise: 0.02, throneEnemy: 20 }).winner === 'ours') win20++
}
check('势力 20% 降低我方胜率（守方增强）', win20 < win0, '0%: ' + win0 + '/' + N + '  20%: ' + win20 + '/' + N)

console.log('\n通过 ' + pass + ' / 失败 ' + fail)
process.exit(fail ? 1 : 0)
