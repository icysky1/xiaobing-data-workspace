// 生成《阵容加成分析》HTML：逐人技能贡献 + 羁绊 + 拆解
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }
const LP = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const code = fs.readFileSync(LP, 'utf8') + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('h')
m.filename = LP
m.paths = Module._nodeModulePaths(path.dirname(LP))
m._compile(code, LP)
const L = m.exports
const byName = {}
Object.values(L.heroesMap).forEach((h) => { byName[h.name] = h })

const LINEUP = {
  back: ['黄金甲·嫦娥', '飞仙·李白', '太阴星君', '飞仙·苏妲己', '红线', '飞仙·黄帝'],
  mid: ['妇好', '黄金甲·聂隐娘', '戏魂·华胥氏', '黄金甲·精卫', '孙悟空'],
  front: ['黄金甲·邓婵玉', '吴刚', '平阳昭公主', '戏魂·阿青', '戏魂·祝融', '戏魂·九天玄女'],
  pet: '鸣蛇', petIdx: 11,
}
const ENEMY = {
  back: ['九天玄女', '女艾', 'PET:九尾狐', '后羿', '黄金甲·精卫', '女娲'],
  mid: ['黄金甲·雨师妾', '伏羲', '黄金甲·嫦娥', '刘邦', '李白', '洛嫔'],
  front: [null, '张良', '飞仙·涂山女', '夏启', '大禹', '飞仙·赵飞燕'],
}
const ROW_IDX = { back: 0, mid: 6, front: 12 }
function build(cfg) {
  const slots = L.makeSlots()
  ;['front', 'mid', 'back'].forEach((row) => {
    ;(cfg[row] || []).forEach((n, i) => {
      if (!n) return
      const idx = ROW_IDX[row] + i
      if (n.indexOf('PET:') === 0) {
        const p = L.petsData.find((x) => x.name === n.slice(4))
        if (p) slots[idx].unit = L.petCard(p)
        return
      }
      const h = byName[n]
      if (h) slots[idx].unit = L.heroCard(h)
    })
  })
  if (cfg.pet) slots[cfg.petIdx].unit = L.petCard(L.petsData.find((p) => p.name === cfg.pet))
  return slots
}
const enemySlots = build(ENEMY)
const lineupHeroes = [...LINEUP.front, ...LINEUP.mid, ...LINEUP.back].map((n) => byName[n]).filter(Boolean)
function measure() {
  const r = L.calcAll({ ours: { slots: build(LINEUP) }, enemy: { slots: enemySlots } })
  return {
    total: (r.ours.total.min + r.ours.total.max) / 2,
    min: r.ours.total.min, max: r.ours.total.max,
    enemy: (r.enemy.total.min + r.enemy.total.max) / 2,
    enemyMin: r.enemy.total.min, enemyMax: r.enemy.total.max,
    fetters: r.ours.detail.fetters, skillLabels: r.ours.detail.skillLabels, petLabels: r.ours.detail.petLabels,
    era: r.ours.detail.eraBuffs, eraSkills: r.ours.detail.eraSkills,
  }
}
const base = measure()
const savedSkill = lineupHeroes.map((h) => h.skill)
const savedFet = lineupHeroes.map((h) => h.fetters)

lineupHeroes.forEach((h) => { h.skill = { name: '', desc: '' } })
const noSkill = measure()
lineupHeroes.forEach((h, i) => { h.skill = savedSkill[i] })
lineupHeroes.forEach((h) => { h.fetters = [] })
const noFet = measure()
lineupHeroes.forEach((h, i) => { h.fetters = savedFet[i] })
lineupHeroes.forEach((h) => { h.skill = { name: '', desc: '' }; h.fetters = [] })
const noBoth = measure()
lineupHeroes.forEach((h, i) => { h.skill = savedSkill[i]; h.fetters = savedFet[i] })

const perHero = savedSkill.map((sk, idx) => {
  const h = lineupHeroes[idx]
  h.skill = { name: '', desc: '' }
  const v = measure()
  h.skill = sk
  return { name: h.name, skill: (sk && sk.name) || '', desc: (sk && sk.desc) || '', gender: h.gender, era: h.era, force: h.force, iq: h.iq, loss: base.total - v.total, enemyBack: v.enemy - base.enemy }
})
const bondMap = {}
savedFet.forEach((fets, idx) => fets.forEach((ft) => { if (!bondMap[ft.id]) bondMap[ft.id] = { ft, owners: [] }; bondMap[ft.id].owners.push(idx) }))
const bondRows = []
Object.values(bondMap).forEach(({ ft, owners }) => {
  owners.forEach((i) => { lineupHeroes[i].fetters = lineupHeroes[i].fetters.filter((x) => x.id !== ft.id) })
  const v = measure()
  owners.forEach((i) => { lineupHeroes[i].fetters = savedFet[i] })
  if (v.fetters.length < base.fetters.length) bondRows.push({ name: ft.name, effect: ft.effect, loss: base.total - v.total })
})
bondRows.sort((a, b) => b.loss - a.loss)
perHero.sort((a, b) => (b.loss + b.enemyBack) - (a.loss + a.enemyBack))

const n = (v) => Math.round(v).toLocaleString('en-US')
const ROLE = { front: '前排', mid: '中排', back: '后排' }
const heroRows = []
;['front', 'mid', 'back'].forEach((row) => {
  LINEUP[row].forEach((name, i) => {
    const p = perHero.find((x) => x.name === name)
    if (!p) return
    const d = (p.desc || '').replace(/\n/g, '<br>')
    heroRows.push(`<tr>
      <td class="pos">${ROLE[row]}${i + 1}</td>
      <td class="nm">${p.name}${p.gender === 2 ? '<span class="g">女</span>' : ''}<em>${p.era}</em></td>
      <td>武${Math.round((p.force[0] + p.force[1]) / 2)} / 智${Math.round((p.iq[0] + p.iq[1]) / 2)}</td>
      <td class="sk"><b>${p.skill}</b><br>${d}</td>
      <td class="num ${p.loss >= 0 ? 'pos2' : 'neg'}">${p.loss >= 0 ? '+' : ''}${n(p.loss)}</td>
      <td class="num ${p.enemyBack > 0 ? 'pos2' : ''}">${p.enemyBack > 0 ? '−' + n(p.enemyBack) : '0'}</td>
    </tr>`)
  })
})

const bondHtml = base.fetters.map((f) => {
  const extra = bondRows.find((b) => b.name === f.name)
  return `<tr><td class="nm">${f.name}</td><td>${f.members || '给持有者'}</td><td>${f.effect}</td><td class="num pos2">+${n(extra ? extra.loss : 0)}</td></tr>`
}).join('')

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>阵容加成分析 · 鸣蛇 vs 九尾狐</title>
<style>
:root{--bg:#f6f2e9;--card:#fffdf7;--ink:#2c2620;--dim:#8b8073;--line:#e6ddc9;--red:#b5392b;--gold:#a8791f;--green:#2f7a52}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 "PingFang SC","Microsoft YaHei",system-ui,sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:32px 20px 60px}
h1{font-size:26px;margin:0 0 6px;letter-spacing:.5px}
.sub{color:var(--dim);font-size:13px;margin-bottom:24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-bottom:18px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
h2{font-size:17px;margin:0 0 14px;padding-left:10px;border-left:4px solid var(--red)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.stat{background:#fbf7ee;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.stat .k{font-size:12px;color:var(--dim)}
.stat .v{font-size:20px;font-weight:700;margin-top:2px}
.stat .v.red{color:var(--red)}.stat .v.green{color:var(--green)}.stat .v.gold{color:var(--gold)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{padding:8px 8px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
th{font-size:12px;color:var(--dim);font-weight:600;background:#fbf7ee}
td.pos{white-space:nowrap;color:var(--dim);font-size:12px}
td.nm{white-space:nowrap;font-weight:600}
td.nm em{font-style:normal;font-weight:400;color:var(--dim);font-size:11px;margin-left:4px}
span.g{display:inline-block;font-size:10px;color:#b5392b;border:1px solid #e0b7ae;border-radius:4px;padding:0 3px;margin-left:4px;vertical-align:1px}
td.sk{color:#4a4238;font-size:12.5px;line-height:1.55}
td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.pos2{color:var(--red);font-weight:600}.neg{color:var(--green)}
.note{font-size:12.5px;color:var(--dim);margin-top:10px}
.bar{height:10px;border-radius:6px;background:#ece4d3;overflow:hidden;display:flex;margin:6px 0 2px}
.bar i{display:block;height:100%}
</style></head><body><div class="wrap">
<h1>阵容加成分析 · 鸣蛇 vs 九尾狐</h1>
<div class="sub">众生平等口径（全员 1 级基础值 · 神兽仅 1 级技能 · 军师技按双方后排智力比）｜引擎真实结算</div>

<div class="card">
  <h2>总体拆解</h2>
  <div class="stats">
    <div class="stat"><div class="k">我方总战力</div><div class="v">${n(base.min)}~${n(base.max)}</div></div>
    <div class="stat"><div class="k">敌方总战力</div><div class="v">${n(base.enemyMin)}~${n(base.enemyMax)}</div></div>
    <div class="stat"><div class="k">净胜差</div><div class="v red">+${n(base.total - base.enemy)}</div></div>
    <div class="stat"><div class="k">裸面板+阵营</div><div class="v gold">${n(noBoth.total)}</div></div>
  </div>
  <div class="bar">
    <i style="width:${(noBoth.total / base.total * 100).toFixed(1)}%;background:#c9bda3"></i>
    <i style="width:${((noSkill.total - noBoth.total) / base.total * 100).toFixed(1)}%;background:#b5392b"></i>
    <i style="width:${((noFet.total - noBoth.total) / base.total * 100).toFixed(1)}%;background:#a8791f"></i>
  </div>
  <div class="note">灰＝面板与阵营　红＝英雄技能（+${n(base.total - noSkill.total)}）　金＝羁绊（+${n(base.total - noFet.total)}）；另有技能对敌削减 ${n(noSkill.enemy - base.enemy)}</div>
  <table style="margin-top:14px">
    <tr><th>项目</th><th>我方战力</th><th>敌方战力</th><th>说明</th></tr>
    <tr><td>完整体</td><td class="num">${n(base.total)}</td><td class="num">${n(base.enemy)}</td><td>${base.fetters.length} 条羁绊 · ${base.skillLabels.length} 条英雄技能 · 神兽 ${base.petLabels.length} 条</td></tr>
    <tr><td>关掉英雄技能</td><td class="num">${n(noSkill.total)}</td><td class="num">${n(noSkill.enemy)}</td><td>技能给我方 +${n(base.total - noSkill.total)}，同时削敌方 ${n(noSkill.enemy - base.enemy)}</td></tr>
    <tr><td>关掉羁绊</td><td class="num">${n(noFet.total)}</td><td class="num">${n(noFet.enemy)}</td><td>羁绊净值 +${n(base.total - noFet.total)}</td></tr>
    <tr><td>两者都关</td><td class="num">${n(noBoth.total)}</td><td class="num">${n(noBoth.enemy)}</td><td>只剩面板 + 阵营，倍率 ×${(base.total / noBoth.total).toFixed(2)}</td></tr>
  </table>
</div>

<div class="card">
  <h2>逐人技能与贡献（17 人）</h2>
  <table>
    <tr><th>位置</th><th>英雄</th><th>面板</th><th>技能</th><th>对我方</th><th>削敌方</th></tr>
    ${heroRows.join('')}
  </table>
  <div class="note">「对我方」＝关掉该技能后我方总战力的损失；「削敌方」＝关掉后敌方总战力的回升。带绿色的负值表示该技能净拖累我方面板（靠削敌方赚净胜差）。</div>
</div>

<div class="card">
  <h2>激活羁绊（${base.fetters.length} 条）</h2>
  <table>
    <tr><th>羁绊</th><th>搭档</th><th>效果</th><th>价值</th></tr>
    ${bondHtml}
  </table>
  <div class="note">羁绊价值为「全局拆除该羁绊」后的战力损失；多条羁绊作用于同一属性时会互相摊薄，故单条数值之和大于羁绊总贡献 ${n(base.total - noFet.total)}。</div>
</div>

<div class="card">
  <h2>阵营与神兽</h2>
  <table>
    <tr><th>来源</th><th>效果</th></tr>
    ${base.era.map((e) => `<tr><td class="nm">阵营</td><td>${e}</td></tr>`).join('')}
    ${base.eraSkills.map((e) => `<tr><td class="nm">阵营技能</td><td>${e}</td></tr>`).join('')}
    ${base.petLabels.map((e) => `<tr><td class="nm">神兽</td><td>${e}</td></tr>`).join('')}
  </table>
  <div class="note">鸣蛇在众生平等下只有 1 级技能段：中排武智 +8%、后排智 +8%；「龟裂禁域」需 50 级，本模式不生效。</div>
</div>
</div></body></html>`

fs.writeFileSync(path.join(__dirname, '../data/阵容加成分析.html'), html)
console.log('已生成 data/阵容加成分析.html')
console.log('总战力', n(base.total), '| 技能 +' + n(base.total - noSkill.total), '| 羁绊 +' + n(base.total - noFet.total), '| 削敌', n(noSkill.enemy - base.enemy))
