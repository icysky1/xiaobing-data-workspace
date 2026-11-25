// 临时测试：反制阵容搜索器
const fs = require('fs')
const path = require('path')
const Module = require('module')
global.Page = () => {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }
const ROOT = path.join(__dirname, '..')
const LP = path.join(ROOT, 'xiaobing-data/pages/lineup/lineup.js')
const m = new Module('t')
m.filename = LP
m.paths = Module._nodeModulePaths(path.dirname(LP))
m._compile(fs.readFileSync(LP, 'utf8') + '\nmodule.exports={calcAll,makeSlots,heroCard,petCard,heroesMap,petsData}', LP)
const L = m.exports
const opt = require(path.join(ROOT, 'xiaobing-data/utils/lineupOptimizer.js'))
const byName = {}
Object.values(L.heroesMap).forEach((h) => { byName[h.name] = h })
const petByName = {}
Object.values(L.petsData).forEach((p) => { petByName[p.name] = p })

const IDX = { back: [0, 1, 2, 3, 4, 5], mid: [6, 7, 8, 9, 10, 11], front: [12, 13, 14, 15, 16, 17] }
const NO = { front: [1, 4, 7, 10, 13, 16], mid: [2, 5, 8, 11, 14, 17], back: [3, 6, 9, 12, 15, 18] }
function fill(plan, petName, petNo) {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    plan[row].forEach((n, i) => {
      if (!n) return
      const idx = IDX[row][i]
      const h = byName[n]
      if (!h) { console.log('缺卡：', n); return }
      slots[idx] = Object.assign({}, slots[idx], { unit: L.heroCard(h) })
    })
  })
  if (petName) {
    const rank = (petNo - 1) % 3
    const col = Math.floor((petNo - 1) / 3)
    const idx = (rank === 0 ? 12 : rank === 1 ? 6 : 0) + col
    slots[idx] = Object.assign({}, slots[idx], { unit: L.petCard(petByName[petName]) })
  }
  return slots
}
function show(slots, label) {
  console.log('---', label)
  ;['front', 'mid', 'back'].forEach((row) => {
    const cells = IDX[row].map((idx, i) => NO[row][i] + '=' + (slots[idx] && slots[idx].unit ? slots[idx].unit.name : '空'))
    console.log('  ' + row + ' ' + cells.join(' '))
  })
  const r = L.calcAll({ ours: { slots: slots }, enemy: { slots: enemy } })
  const om = (r.ours.total.min + r.ours.total.max) / 2
  const em = (r.enemy.total.min + r.enemy.total.max) / 2
  console.log('  我方', Math.round(om), '敌方', Math.round(em), '净差', Math.round(om - em))
}
const enemy = fill({ front: ['九天玄女', '后羿', '黄金甲·雨师妾', '刘邦', null, '夏启'], mid: ['女艾', '黄金甲·精卫', '伏羲', '李白', '张良', '大禹'], back: [null, '女娲', '黄金甲·嫦娥', '洛嫔', '飞仙·涂山女', '飞仙·赵飞燕'] }, '九尾狐', 3)

const known = fill({ front: ['黄金甲·邓婵玉', '妇好', '戏魂·阿青', '项羽', '戏魂·九天玄女', '戏魂·祝融'], mid: ['平阳昭公主', '聂政', '孙悟空', '黄金甲·聂隐娘', '黄金甲·精卫', null], back: ['戏魂·华胥氏', '太阴星君', '飞仙·李白', '飞仙·苏妲己', '黄金甲·嫦娥', null] }, '鸣蛇', 17)
show(known, '已知手工最优 + 鸣蛇')

const job = opt.createJob({
  calcAll: L.calcAll, makeSlots: L.makeSlots, heroCard: L.heroCard, petCard: L.petCard,
  heroesMap: L.heroesMap, enemySlots: enemy, pet: petByName['鸣蛇'], allowEvolution: true, maxEvals: 2500,
})
const t0 = Date.now()
let r
do { r = job.step(200) } while (!r.done && Date.now() - t0 < 60000)
console.log('搜索耗时', Date.now() - t0, 'ms 评估', job.stats.evals, '截断', job.isTruncated())
show(job.toSlots(r.state), '搜索器结果')
