// 诊断 1：技能文本解析覆盖率 —— 有多少行技能描述被静默丢弃
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = () => {}
global.wx = { setStorageSync() {}, getStorageSync() { return '' } }

const P = path.resolve('xiaobing-data/pages/lineup/lineup.js')
const L = new Module('t')
L.filename = P
L.paths = Module._nodeModulePaths(path.dirname(P))
L._compile(fs.readFileSync(P, 'utf8') + '\nmodule.exports = { parseDesc }', P)
const { parseDesc } = L.exports

const H = require('../xiaobing-data/data/heroes.js')
const pets = require('../xiaobing-data/data/pets.js')
const eraSkill = require('../xiaobing-data/data/eraSkill.js')

function audit(list, label) {
  let lines = 0
  let ok = 0
  let unq = 0
  const dropped = []
  list.forEach((it) => {
    String(it.text || '').split(/[\n;；]/).forEach((raw) => {
      const t = raw.trim()
      if (!t) return
      lines++
      const r = parseDesc(t)
      if (r.out.length) ok++
      else if (r.unq.length) unq++
      else dropped.push(it.name + '｜' + t)
    })
  })
  console.log(`\n=== ${label} ===`)
  console.log(`技能行 ${lines} ｜ 已量化 ${ok}（${((ok / lines) * 100).toFixed(1)}%）｜ 记为未量化 ${unq}（${((unq / lines) * 100).toFixed(1)}%）｜ 静默丢弃 ${dropped.length}（${((dropped.length / lines) * 100).toFixed(1)}%）`)
  const byKey = {}
  dropped.forEach((d) => {
    const txt = d.split('｜')[1]
    // 归类关键词
    const kinds = ['伤害', '回复', '治疗', '复活', '护盾', '吸血', '反弹', '免疫', '沉默', '眩晕', '冰冻', '灼烧', '中毒', '额外', '攻击', '生命', '兵力', '怒气', '先手', '连击', '闪避', '命中', '暴击', '无视', '清除', '驱散', '偷取', '转移', '复制', '召唤']
    const hit = kinds.filter((k) => txt.indexOf(k) >= 0)
    const key = hit.length ? hit.join('/') : '其他'
    byKey[key] = (byKey[key] || 0) + 1
  })
  Object.keys(byKey).sort((a, b) => byKey[b] - byKey[a]).slice(0, 12).forEach((k) => {
    console.log(`  ${String(byKey[k]).padStart(4)}  ${k}`)
  })
  console.log('  样例：')
  dropped.slice(0, 12).forEach((d) => console.log('   ·', d))
  return dropped
}

const heroLines = Object.values(H).map((h) => ({ name: h.name, text: h.skill && h.skill.desc }))
audit(heroLines, '英雄技能（611 名）')

const petLines = []
pets.forEach((p) => {
  ;(p.skills || []).filter((x) => !x.ul || x.ul === 1).forEach((x) => petLines.push({ name: p.name + '/' + x.n, text: x.d }))
})
audit(petLines, '神兽 1 级技能（58 只）')

audit(eraSkill.map((s) => ({ name: s.era + '×' + s.tier + '/' + s.name, text: s.desc })), '阵营技能（阵容技）')
