// 端到端测试：页面内「一键生成克制阵容」
const fs = require('fs')
const path = require('path')
const Module = require('module')
global.Page = (o) => { global.__page = o }
const toasts = []
global.wx = {
  setStorageSync() {},
  getStorageSync() { return null },
  showToast(o) { toasts.push(o.title) },
  setClipboardData() {},
  getClipboardData(o) { o.success({ data: '' }) },
}
const ROOT = path.join(__dirname, '..')
const LP = path.join(ROOT, 'xiaobing-data/pages/lineup/lineup.js')
const m = new Module('t')
m.filename = LP
m.paths = Module._nodeModulePaths(path.dirname(LP))
m._compile(fs.readFileSync(LP, 'utf8'), LP)
const p = global.__page
p.setData = (obj) => Object.assign(p.data, obj)
p.onLoad()

// 敌方：用用户给的敌方阵容码自动导入
const ENEMY_CODE = 'Z3-__GNMAqAmOYAEOcACOWDkMyAsDoPSAoAiPfvK4gxdek'
p.setData({ side: 'enemy' })
p.onCodeInput({ detail: { value: ENEMY_CODE } })
const enemyCount = p.model.enemy.slots.filter((s) => s.unit).length
console.log('敌方导入单位数:', enemyCount, '| 提示:', p.data.codeTip)

p.setData({ side: 'ours' })
const t0 = Date.now()
p.generateCounter()
let waited = 0
const timer = setInterval(() => {
  waited += 200
  if (!p.data.genRunning) {
    clearInterval(timer)
    report()
  } else if (waited > 120000) {
    clearInterval(timer)
    console.log('超时未完成，进度：', p.data.genProgress)
  }
}, 200)

function report() {
  const slots = p.model.ours.slots
  const units = slots.filter((s) => s.unit)
  const heroes = units.filter((s) => s.unit.kind === 'hero')
  const pets = units.filter((s) => s.unit.kind === 'pet')
  const names = heroes.map((s) => s.unit.name.replace(/^(飞仙|戏魂|黄金甲)·/, ''))
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  const IDX = { front: [12, 13, 14, 15, 16, 17], mid: [6, 7, 8, 9, 10, 11], back: [0, 1, 2, 3, 4, 5] }
  const NO = { front: [1, 4, 7, 10, 13, 16], mid: [2, 5, 8, 11, 14, 17], back: [3, 6, 9, 12, 15, 18] }
  ;['front', 'mid', 'back'].forEach((row) => {
    console.log(row + ': ' + IDX[row].map((idx, i) => NO[row][i] + '=' + (slots[idx].unit ? slots[idx].unit.name : '空')).join(' | '))
  })
  console.log('英雄', heroes.length, '神兽', pets.length, '重复', dup.length ? dup.join(',') : '无')
  const c = p.data.compare
  console.log('我方', c.ours.total.min + '~' + c.ours.total.max, '敌方', c.enemy.total.min + '~' + c.enemy.total.max)
  console.log('提示:', p.data.genTip)
  console.log('toast:', toasts.join(' / '))
  console.log('耗时', Math.round((Date.now() - t0) / 1000) + 's')
  console.log('阵容码:', p.data.myCode)
  // 再验证我方阵容码可解析
  const fc = require(path.join(ROOT, 'xiaobing-data/utils/formationCode.js'))
  try {
    const d = fc.decode(p.data.myCode)
    console.log('阵容码回解单位数:', d.heroes.length)
  } catch (e) {
    console.log('阵容码解析失败:', e.message)
  }
}
