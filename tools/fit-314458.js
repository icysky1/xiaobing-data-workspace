/* 314458 公式拟合：用实战三排宝石数判定 百分比效果 的真实合成方式
 *
 * 实战锚点（用户确认）：
 *   防守方 gems: 前 13744 / 中 1173 / 后 467（右列，顶=前排）
 *   进攻方 gems: 1426 / 2962 / 5299（左列，与右列镜像 => 后/中/前 或 前/中/后 两种解读都测）
 *   帝江 lv91 前排1号位；鸣蛇 lv92；防守胜；王座防守 +20%（势力界面）
 *   帝江四翼和鸣(+41%前排武力)落地为固定值：刑天+187 李元霸+129 盘古+258 杨再兴+100 孙悟空+170
 *   帝江大音希声：前排武力最高3人(刑天/盘古/孙悟空)免英雄技能负面
 */
const fs = require('fs')
const path = require('path')
const Module = require('module')
global.Page = () => {}
global.wx = { setStorageSync () {}, getStorageSync () { return '' } }
const FC = require('../xiaobing-data/utils/formationCode.js')
const P = path.resolve(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const m = new Module(P); m.filename = P; m.paths = Module._nodeModulePaths(path.dirname(P))
m._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports={makeSlots,heroCard,petCard,heroesMap,petsData,collectSide,resolvePool}', P)
const L = m.exports

const ATK_CODE = 'Z3f__IPKOEAgAQOWOQPuASAaACPUOSPOAEAIOHvLqAtxCN'
const DEF_CODE = 'Z3_f_CGyPuAUMCGwGmO4GkOUEGOaAIQAOSGuEJvLpAWtJt'
const REAL = {
  atk: { front: 5299, mid: 2962, back: 1426 }, // 镜像解读（左列底=前排）
  atkAlt: { front: 1426, mid: 2962, back: 5299 }, // 原序解读
  def: { front: 13744, mid: 1173, back: 467 },
}

function slotsOf (code, petLv) {
  const d = FC.decode(code); const slots = L.makeSlots()
  FC.withRowCol(d.heroes).forEach(e => {
    const idx = e.row === 'back' ? e.col : e.row === 'mid' ? 6 + e.col : 12 + e.col
    if (e.heroId >= FC.PET_MIN) { const p = L.petsData.filter(x => x.id === e.heroId)[0]; if (p) slots[idx] = { ...slots[idx], unit: L.petCard(p, petLv) } } else { const h = L.heroesMap[e.heroId]; if (h) slots[idx] = { ...slots[idx], unit: L.heroCard(h) } }
  })
  return slots
}

// 一个单位四元组 (fmin,fmax,imin,imax) 的线性/乘法运算
function op (u, attr, pct, v, mode) {
  const keys = attr === 'f' ? ['fmin', 'fmax'] : ['imin', 'imax']
  keys.forEach(k => {
    if (pct) {
      if (mode === 'mul') u[k] *= (1 + v)
      else u[k] *= 1 // add 模式在聚合后统一处理（见下）
    } else u[k] += v
  })
}
// add 模式：先按单位聚合 Σpct 再一次相乘
function applyEffect (u, e, mode, acc) {
  // 返回该效果对此单位的应用描述；acc 用于 add 聚合
  for (const at of (e.attrs || [])) {
    if (at.pct) {
      if (mode === 'mul') op(u, at.a, true, at.v, 'mul')
      else acc[at.a] = (acc[at.a] || 0) + at.v
    } else op(u, at.a, false, at.v)
  }
}

// models: { fac:'add'|'mul', pet:'add'|'mul', hero:'add'|'mul', neg:'mul' }  neg=敌方负面(百分比<0或type!=buff)
function simSide (colOwn, colEnemy, model, immunitySet) {
  const units = colOwn.units.map(u => ({ name: u.name, row: u.row, idx: colOwn.units.indexOf(u), fmin: u.baseFmin, fmax: u.baseFmax, imin: u.baseImin, imax: u.baseImax }))
  const run = (effects, isEnemy) => {
    const acc = units.map(() => ({})) // add 聚合器
    effects.forEach(e => {
      let r
      try { r = L.resolvePool(e, colOwn.units, e.holder) } catch (err) { return }
      if (!r || !r.pool) return
      const kind = !e.holder ? 'fac' : (e.holder.kind === 'pet' ? 'pet' : 'hero')
      const negative = isEnemy || (e.attrs || []).some(at => at.pct && at.v < 0) || (e.type !== 'buff' && e.type !== 'debuff')
      const isNegPct = (e.attrs || []).some(at => at.pct && at.v < 0)
      r.pool.forEach(srcU => {
        const u = units[colOwn.units.indexOf(srcU)]
        if (!u) return
        // 大音希声：免英雄技能负面（含敌方百分比<0）
        if (immunitySet && immunitySet.has(u.name) && isEnemy && (isNegPct || e.type === 'silence' || e.type === 'pin')) return
        let mode
        if (isEnemy || isNegPct) mode = 'mul' // 负面一律乘算
        else mode = model[kind]
        applyEffect(u, e, mode, acc[u.idx])
      })
    })
    // add 聚合落地
    units.forEach((u, i) => {
      const a = acc[i]
      if (a.f) { u.fmin *= (1 + a.f); u.fmax *= (1 + a.f) }
      if (a.i) { u.imin *= (1 + a.i); u.imax *= (1 + a.i) }
    })
  }
  run(colOwn.effects, false)
  if (colEnemy) run(colEnemy.effects, true)
  const avg = x => (x.fmin + x.fmax) / 2
  const rows = { front: 0, mid: 0, back: 0 }
  units.forEach(u => {
    if (u.row === 'front') rows.front += avg(u) * 1.5
    else if (u.row === 'mid') rows.front += 0 // placeholder
  })
  // 重新按排算
  const r2 = { front: 0, mid: 0, back: 0 }
  units.forEach(u => {
    const F = avg({ fmin: u.fmin, fmax: u.fmax }); const I = avg({ fmin: u.imin, fmax: u.imax })
    if (u.row === 'front') r2.front += F * 1.5
    else if (u.row === 'mid') r2.mid += F + I
    else r2.back += I
  })
  return { rows: r2, units }
}

function fmtR (r) { return '前' + Math.round(r.front) + ' 中' + Math.round(r.mid) + ' 后' + Math.round(r.back) }
function err (sim, real) { return ['front', 'mid', 'back'].map(k => ((sim[k] / real[k] - 1) * 100).toFixed(0) + '%').join(' / ') }

const atkCol = L.collectSide(slotsOf(ATK_CODE, 92), 92)
const defCol = L.collectSide(slotsOf(DEF_CODE, 91), 91)

// 大音希声 免负面名单：防守前排武力最高3人
const defFront = defCol.units.filter(u => u.row === 'front')
const top3 = defFront.slice().sort((a, b) => ((b.baseFmin + b.baseFmax) - (a.baseFmin + a.baseFmax))).slice(0, 3).map(u => u.name)
console.log('大音希声保护(防守前排武力最高3人): ' + top3.join(', '))

const models = {
  M1_现状加算: { fac: 'add', pet: 'add', hero: 'add' },
  M2_全乘算: { fac: 'mul', pet: 'mul', hero: 'mul' },
  M3_羁阵加算技能乘算: { fac: 'add', pet: 'mul', hero: 'mul' },
  M4_羁阵英雄加算神兽乘算: { fac: 'add', pet: 'mul', hero: 'add' },
}
const THRONE = 1.2
for (const [name, model] of Object.entries(models)) {
  const d = simSide(defCol, atkCol, model, new Set(top3))
  const a = simSide(atkCol, defCol, model, null)
  console.log('\n== ' + name + ' ==')
  console.log('  防守(×王座1.2): ' + fmtR(d.rows) + '  实战 ' + REAL.def.front + '/' + REAL.def.mid + '/' + REAL.def.back + '  偏差 ' + err({ front: d.rows.front * THRONE, mid: d.rows.mid * THRONE, back: d.rows.back * THRONE }, REAL.def))
  console.log('  进攻(镜像解):   ' + fmtR(a.rows) + '  实战 ' + REAL.atk.front + '/' + REAL.atk.mid + '/' + REAL.atk.back + '  偏差 ' + err(a.rows, REAL.atk))
  console.log('  进攻(原序解):   实战 ' + REAL.atkAlt.front + '/' + REAL.atkAlt.mid + '/' + REAL.atkAlt.back + '  偏差 ' + err(a.rows, REAL.atkAlt))
}

// 附加验证：帝江固定值反推（X = 四翼和鸣落地时的当前武力）
console.log('\n== 帝江固定值反推 vs 各模型「释放时点当前武力」 ==')
const djFlat = { '刑天': 187, '李元霸': 129, '黄金甲·盘古': 258, '黄金甲·杨再兴': 100, '孙悟空': 170 }
for (const [name, model] of Object.entries(models)) {
  // 只应用阵营/羁绊层（holder空）后的前排武力
  const d = simSide(defCol, null, model, null)
  const line = Object.entries(djFlat).map(([n, v]) => {
    const u = d.units.find(x => x.name === n)
    if (!u) return n + ':无单位'
    const cur = (u.fmin + u.fmax) / 2
    const x = v / 0.41
    return n + ' 反推' + x.toFixed(0) + ' 模型' + cur.toFixed(0) + '(' + (cur / x * 100).toFixed(0) + '%)'
  }).join('  ')
  console.log('  ' + name + ': ' + line)
}
