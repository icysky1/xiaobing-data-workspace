// 端到端：选一只神兽（默认穷奇 Lv110）-> 点「生成克制阵容」-> 产出阵容并核对神兽等级口径
const fs = require('fs')
const path = require('path')
const Module = require('module')

const queue = []
const realTimeout = setTimeout
global.setTimeout = (fn) => { queue.push(fn); return 0 }

let page = null
global.wx = {
  setStorageSync() {},
  getStorageSync() { return '' },
  showToast(o) { console.log('[toast]', o.title) },
  getSystemInfoSync() { return { windowWidth: 375 } },
}
global.Page = (o) => { page = o }
const P = path.resolve(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports = { heroCard, petCard }', P)
const { heroCard, petCard } = L.exports

const fc = require('../tools/formation-code.js')
const NO2IDX = {}
for (let i = 0; i < 6; i++) { NO2IDX[3 + i * 3] = i; NO2IDX[2 + i * 3] = 6 + i; NO2IDX[1 + i * 3] = 12 + i }

const self = Object.assign({}, page)
self.data = JSON.parse(JSON.stringify(page.data))
self.setData = function (obj) { Object.assign(this.data, obj) }
self.model = { ours: { slots: [] }, enemy: { slots: [] } }
self.onLoad.call(self)

// 敌方：用现成阵容码摆一个
const d = fc.decode('Z33__EDCDeKiPOM-KmOEDQAIDGOGKoDEDMOmDTvLqAhicy')
const patches = require('../xiaobing-data/data/pets.js')
const heroesMap = require('../xiaobing-data/data/heroes.js')
const enemy = self.data.board.map((s) => ({ col: s.col, idx: s.idx, unit: null }))
d.heroes.forEach((e) => {
  if (e.heroId >= 900000) {
    const p = patches.filter((x) => x.id === e.heroId)[0]
    if (p) enemy[NO2IDX[e.position]].unit = petCard(p)
  } else if (heroesMap[e.heroId]) {
    enemy[NO2IDX[e.position]].unit = heroCard(heroesMap[e.heroId])
  }
})
self.model.enemy.slots = enemy
self.model.ours.slots = self.data.board.map((s) => ({ col: s.col, idx: s.idx, unit: null }))
self.recalc()
console.log('敌方战力:', Math.round((self.data.compare.enemy.total.min + self.data.compare.enemy.total.max) / 2))

const t0 = Date.now()
self.generateCounter()
while (queue.length) queue.shift()()
console.log('生成耗时:', Date.now() - t0 + 'ms')
console.log('提示:', self.data.genTip)
const mine = self.data.board.filter((s) => s.unit && s.unit.kind === 'pet')[0]
console.log('我方神兽:', mine && mine.unit ? mine.unit.name : '无')
