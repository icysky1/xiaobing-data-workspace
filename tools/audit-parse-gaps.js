// 诊断 2：找出解析器的系统性漏读（简写/续行/变体措辞）
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

const pool = []
Object.values(H).forEach((h) => pool.push({ who: '英雄/' + h.name + '(' + h.quality + '星)', text: h.skill && h.skill.desc }))
pets.forEach((p) => (p.skills || []).filter((x) => !x.ul || x.ul === 1).forEach((x) => pool.push({ who: '神兽/' + p.name, text: x.d })))
eraSkill.forEach((s) => pool.push({ who: '阵营/' + s.era + '×' + s.tier + '/' + s.name, text: s.desc }))

const buckets = {
  '武智简写': [],
  '作用域续行(行尾冒号)': [],
  '我军的军师技变体': [],
  '单挑/额外机制': [],
  '武智之和top': [],
}
pool.forEach((it) => {
  String(it.text || '').split(/[\n;；]/).forEach((raw) => {
    const t = raw.trim()
    if (!t) return
    const r = parseDesc(t)
    const lost = !r.out.length
    if (!lost) return
    if (/武智/.test(t)) {
      if (/之[和]/.test(t)) buckets['武智之和top'].push(it.who + '｜' + t)
      else buckets['武智简写'].push(it.who + '｜' + t)
    }
    if (/[：:]$/.test(t)) buckets['作用域续行(行尾冒号)'].push(it.who + '｜' + t)
    if (/我军的?军师技/.test(t)) buckets['我军的军师技变体'].push(it.who + '｜' + t)
    if (/单挑|额外|先手|连击|反击|反弹|吸血|回复|治疗|复活|护盾/.test(t)) buckets['单挑/额外机制'].push(it.who + '｜' + t)
  })
})

Object.keys(buckets).forEach((k) => {
  console.log(`\n=== ${k}：${buckets[k].length} 行 ===`)
  buckets[k].slice(0, 10).forEach((x) => console.log('  ·', x))
})

// 「武智」总量
let all = 0
let wuzhi = 0
Object.values(H).forEach((h) => {
  String((h.skill && h.skill.desc) || '').split(/[\n;；]/).forEach((t) => {
    if (!t.trim()) return
    all++
    if (/武智/.test(t)) wuzhi++
  })
})
console.log(`\n英雄技能行中含「武智」：${wuzhi}/${all}`)
