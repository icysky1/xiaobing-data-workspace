// 验证：神兽技能按「神兽等级」取档（不是恒按 1 级），且影响战力
const fs = require('fs')
const path = require('path')
const Module = require('module')

let page = null
global.wx = {
  setStorageSync() {},
  getStorageSync() { return '' },
  showToast(o) { console.log('  [toast]', o && o.title) },
  getSystemInfoSync() { return { windowWidth: 375 } },
}
global.Page = (o) => { page = o }
const P = path.resolve(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8'), P)

const self = Object.assign({}, page)
self.data = JSON.parse(JSON.stringify(page.data))
self.setData = function (obj) { Object.assign(this.data, obj) }
self.onLoad && self.onLoad.call(self)

const heroesData = require('../xiaobing-data/data/heroes.js')
const pets = require('../xiaobing-data/data/pets.js')

// 简单英雄卡（前排吃武力、后排吃智力）
const heroList = Object.keys(heroesData)
  .map((k) => heroesData[k])
  .filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1)
  .slice(0, 12)
function heroCard(h) {
  return {
    kind: 'hero', id: h.id, name: h.name,
    forceMin: h.force[0], forceMax: h.force[1],
    iqMin: h.iq[0], iqMax: h.iq[1],
  }
}
function petCard(p) {
  return {
    kind: 'pet', id: p.id, name: p.name,
    forceMin: p.fp[0], forceMax: p.fp[1],
    iqMin: p.sp[0], iqMax: p.sp[1],
  }
}
const COLS = ['back', 'back', 'back', 'back', 'back', 'back', 'mid', 'mid', 'mid', 'mid', 'mid', 'mid', 'front', 'front', 'front', 'front', 'front', 'front']
function buildBoard(pet) {
  const slots = COLS.map((col, idx) => ({ idx: idx, col: col, unit: null }))
  slots[11].unit = petCard(pet) // 中排第 6 格（17 号位）
  let k = 0
  // 前排 6 人（吃武力），后排 6 人（吃智力）
  for (let i = 12; i < 18; i++) slots[i].unit = heroCard(heroList[k++])
  for (let i = 0; i < 6; i++) slots[i].unit = heroCard(heroList[k++])
  return { ours: { slots: slots }, enemy: { slots: COLS.map((col, idx) => ({ idx: idx, col: col, unit: null })) } }
}

function snapshot(pet, lv) {
  self.model = buildBoard(pet)
  self.savePetPick(pet.id, lv) // 内部会 recalc
  const d = self.data.compare.ours.detail
  return { lv: lv, total: self.data.compare.ours.total, label: self.data.petPick.tierLabel, tiers: d.petSkillTiers }
}

const qiongqi = pets.filter((p) => p.name === '穷奇')[0] // U 前排，凶神临 1→105 级 +9%→+60%
const r1 = snapshot(qiongqi, 1)
const r30 = snapshot(qiongqi, 30)
const r110 = snapshot(qiongqi, 110)
const show = (r) => {
  console.log('穷奇 Lv' + r.lv + ' | 我方总战力 ' + r.total.min + '~' + r.total.max + ' | ' + r.label)
  r.tiers.forEach((t) => console.log('   · ' + t.name + ' ' + t.label + '（Lv' + t.need + ' 解锁）：' + t.text.replace(/\n/g, ' ')))
}
show(r1)
show(r30)
show(r110)

const mid = (r) => (r.total.min + r.total.max) / 2
const names = (r) => r.tiers.map((t) => t.name).join(',')
const piniu = pets.filter((p) => p.name === '貔貅')[0] // 吞天食地 5 级才解锁
const b1 = snapshot(piniu, 1)
const b5 = snapshot(piniu, 5)
const b110 = snapshot(piniu, 110)
console.log('貔貅 Lv1 技能：' + names(b1) + ' | Lv5：' + names(b5) + ' | Lv110：' + names(b110))

const ok = []
ok.push(['Lv110 战力 > Lv30 战力', mid(r110) > mid(r30)])
ok.push(['Lv30 战力 > Lv1 战力', mid(r30) > mid(r1)])
ok.push(['Lv110 凶神临 = Lv10/10 且 +60%', r110.tiers[0].label === 'Lv10/10' && r110.tiers[0].text.indexOf('60%') >= 0])
ok.push(['Lv30 凶神临 = Lv4/10 且 +26%', r30.tiers[0].label === 'Lv4/10' && r30.tiers[0].text.indexOf('26%') >= 0])
ok.push(['Lv1 凶神临 = Lv1/10 且 +9%', r1.tiers[0].label === 'Lv1/10' && r1.tiers[0].text.indexOf('9%') >= 0])
ok.push(['貔貅 Lv1 不含未解锁的吞天食地', names(b1).indexOf('吞天食地') < 0])
ok.push(['貔貅 Lv5 起含吞天食地', names(b5).indexOf('吞天食地') >= 0])
ok.push(['貔貅 Lv110 金山罩满档(10/10)', b110.tiers[0].label === 'Lv10/10'])

let bad = 0
ok.forEach((it) => { console.log((it[1] ? '✅' : '❌') + ' ' + it[0]); if (!it[1]) bad++ })
console.log(bad ? '\n失败 ' + bad + ' 项' : '\n全部通过')
process.exit(bad ? 1 : 0)
