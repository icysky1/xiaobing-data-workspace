// 诊断 6：静态口径组合校准（羁绊归属 × 军师技是否计入静态 × 神兽是否吃全体加成）
// 对照 2026-11-01 实战（众生平等 ID:314438）：我方 8615 / 敌方 7381，比值 1.167
// 做法：在内存里替换源码片段再编译，不落地临时文件。
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = () => {}
global.wx = { setStorageSync() {}, getStorageSync() { return '' } }

const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const SRC = fs.readFileSync(P, 'utf8').replace(/\r\n/g, '\n')

const PATCH = {
  fetterOwner: {
    from: 'e.forceTargets = heroUnits.filter((u) => ft.members.indexOf(nameBase(u.name)) >= 0)',
    to: 'e.forceTargets = heroUnits.filter((u) => nameBase(u.name) === ft.holder)',
  },
  noScheme: {
    from: '  if (sOurs.effect) oursCol.effects.push(sOurs.effect)\n  if (sEnemy.effect) enemyCol.effects.push(sEnemy.effect)',
    to: '  // 实验：军师技不计入静态战力',
  },
  petBuff: {
    from: "const heroes = units.filter((u) => u.kind === 'hero')",
    to: 'const heroes = units',
  },
  petLv1: { from: 'let PET_LV = PET_LV_MAX', to: 'let PET_LV = 1' },
  petLv60: { from: 'let PET_LV = PET_LV_MAX', to: 'let PET_LV = 60' },
  petLv90: { from: 'let PET_LV = PET_LV_MAX', to: 'let PET_LV = 90' },
}

function load(patches) {
  let code = SRC
  ;(patches || []).forEach((k) => {
    const p = PATCH[k]
    if (code.indexOf(p.from) < 0) throw new Error('patch 未命中: ' + k)
    code = code.replace(p.from, p.to)
  })
  const m = new Module(P)
  m.filename = P
  m.paths = Module._nodeModulePaths(path.dirname(P))
  m._compile(code + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }', P)
  return m.exports
}

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

function measure(patches) {
  const L = load(patches)
  const byName = {}
  Object.values(L.heroesMap).forEach((h) => { byName[h.name] = h })
  const petByName = {}
  L.petsData.forEach((p) => { petByName[p.name] = p })
  const build = (cfg) => {
    const slots = L.makeSlots()
    ;['front', 'mid', 'back'].forEach((row) => {
      ;(cfg[row] || []).forEach((name, i) => {
        const h = byName[name]
        if (h) slots[ROW_IDX[row] + i].unit = L.heroCard(h)
      })
    })
    if (cfg.petMid) slots[6 + 5].unit = L.petCard(petByName[cfg.petMid])
    if (cfg.petBack) slots[0 + 5].unit = L.petCard(petByName[cfg.petBack])
    return slots
  }
  const r = L.calcAll({ ours: { slots: build(OURS) }, enemy: { slots: build(ENEMY) } })
  return {
    o: Math.round((r.ours.total.min + r.ours.total.max) / 2),
    e: Math.round((r.enemy.total.min + r.enemy.total.max) / 2),
    rows: [r.ours.rows.front.min, r.ours.rows.mid.min, r.ours.rows.back.min].join('/'),
  }
}

const cases = [
  ['神兽 Lv110（默认口径）', []],
  ['神兽 Lv90', ['petLv90']],
  ['神兽 Lv60', ['petLv60']],
  ['神兽 Lv1（旧口径）', ['petLv1']],
  ['Lv110 · 神兽也吃全体加成', ['petBuff']],
  ['Lv110 · 军师技不计入静态', ['noScheme']],
  ['Lv110 · 羁绊→持有者', ['fetterOwner']],
]
console.log('实战（结算显示）: 我方 8615 / 敌方 7381，比值 1.167')
console.log('（实战军师技：敌方发动「智商碾压」lv8 全体 -30%；模拟判 lv4 -10%）\n')
console.log('口径'.padEnd(40), '我方   偏差    敌方   偏差   比值   我方前/中/后')
cases.forEach(([label, patches]) => {
  const m = measure(patches)
  const pct = (a, b) => (((a - b) / b) * 100).toFixed(1).padStart(6) + '%'
  console.log(label.padEnd(40), String(m.o).padStart(5), pct(m.o, 8615), String(m.e).padStart(6), pct(m.e, 7381), (m.o / m.e).toFixed(3).padStart(6), '  ' + m.rows)
})
