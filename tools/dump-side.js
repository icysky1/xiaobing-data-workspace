// 逐单位 dump（干净流程：每次重新 collectSide，只调用一次 computeSide）
// 用法：node tools/dump-side.js
global.Page = () => {}
global.wx = { setStorageSync() {}, getStorageSync() { return '' } }
const fs = require('fs')
const path = require('path')
const Module = require('module')
const FC = require('../xiaobing-data/utils/formationCode.js')

const P = path.resolve(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const m = new Module(P)
m.filename = P
m.paths = Module._nodeModulePaths(path.dirname(P))
m._compile(
  fs.readFileSync(P, 'utf8') + '\nmodule.exports={makeSlots,heroCard,petCard,heroesMap,petsData,collectSide,resetUnits,computeSide}',
  P
)
const L = m.exports
const heroByName = {}
Object.values(L.heroesMap).forEach((h) => { heroByName[h.name] = h })

function slotsOf(code, lv) {
  const d = FC.decode(code)
  const s = L.makeSlots()
  FC.withRowCol(d.heroes).forEach((e) => {
    const i = e.row === 'back' ? e.col : e.row === 'mid' ? 6 + e.col : 12 + e.col
    if (e.heroId >= FC.PET_MIN) {
      const p = L.petsData.filter((x) => x.id === e.heroId)[0]
      if (p) s[i] = { ...s[i], unit: L.petCard(p, lv) }
    } else {
      const h = L.heroesMap[e.heroId]
      if (h) s[i] = { ...s[i], unit: L.heroCard(h) }
    }
  })
  return s
}

function dump(code, lv, tag) {
  const col = L.collectSide(slotsOf(code, lv), lv)
  const ftBy = {}
  ;(col.detail.fetters || []).forEach((d) => {
    d.holders.split('、').forEach((h) => { ftBy[h] = (ftBy[h] || 0) + 1 })
  })
  L.resetUnits(col.units)
  L.computeSide(col, [])
  console.log('===== ' + tag + ' =====')
  ;['front', 'mid', 'back'].forEach((rw) => {
    console.log(' -- ' + rw)
    col.units.filter((u) => u.row === rw).forEach((u) => {
      const b = (u.baseFmin + u.baseFmax) / 2
      const eF = (u.effFmin + u.effFmax) / 2
      const eI = (u.effImin + u.effImax) / 2
      const nFt = ftBy[u.name] || 0
      console.log(
        '   ' + u.name.padEnd(14) +
        ' 羁绊' + nFt + '条' +
        ' base=' + b.toFixed(0).padStart(5) +
        ' pf=' + (u.pf || 0).toFixed(2).padStart(6) +
        ' pfm=' + (u.pfm === undefined ? 1 : u.pfm).toFixed(2).padStart(5) +
        ' effF=' + eF.toFixed(0).padStart(6) +
        ' effI=' + eI.toFixed(0).padStart(5) +
        ' 放大=' + (eF / (b || 1)).toFixed(1) + 'x'
      )
    })
  })
}

dump('Z3_f_CGyH2PqGwEIQmAIGkOUG2O0OSQAAUEGH5vK3gf2pq', 90, '308453 后手方')
dump('Z3_f_CGyPuAUMCGwGmO4GkOUEGOaAIQAOSGuEJvLpAWtJt', 91, '314458 防守方')
