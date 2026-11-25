// 导出本场众生平等对战双方英雄/神兽的数据，核对基础武智与技能
const heroesMap = require('../xiaobing-data/data/heroes.js')
const petsData = require('../xiaobing-data/data/pets.js')

const ourHeroes = ['王翦', '巴寡妇清', '陈胜', '飞仙·黄帝', '霍光', '李自成', '昊天大帝', '商鞅', '蚩尤', '蒙恬', '妈祖', '洪秀全', '嬴政', '吕不韦', '黄金甲·王贲', '李斯']
const enemyHeroes = ['九天玄女', '老子', '刘邦', '伏羲', '司马迁', '后羿', '张良', '飞仙·李白', '王阳明', '黄金甲·嫦娥', '洛嫔', '飞仙·女娲', '黄金甲·精卫', '太阴星君', '王昭君', '女艾']
const petNames = ['鸣蛇', '貔貅']

function findHero(name) {
  const hits = Object.values(heroesMap).filter((h) => h.name === name || h.title === name)
  return hits
}

console.log('===== 我方英雄 =====')
for (const n of ourHeroes) {
  const hits = findHero(n)
  if (!hits.length) { console.log(`[缺失] ${n}`); continue }
  for (const h of hits) {
    console.log(`--- ${h.name} (id=${h.id} era=${h.era} q=${h.quality}) 武=${JSON.stringify(h.force)} 智=${JSON.stringify(h.iq)}`)
    console.log(`    技能: ${JSON.stringify(h.skill || h.skills || '').slice(0, 600)}`)
  }
}
console.log('===== 敌方英雄 =====')
for (const n of enemyHeroes) {
  const hits = findHero(n)
  if (!hits.length) { console.log(`[缺失] ${n}`); continue }
  for (const h of hits) {
    console.log(`--- ${h.name} (id=${h.id} era=${h.era} q=${h.quality}) 武=${JSON.stringify(h.force)} 智=${JSON.stringify(h.iq)}`)
    console.log(`    技能: ${JSON.stringify(h.skill || h.skills || '').slice(0, 600)}`)
  }
}
console.log('===== 神兽 =====')
for (const n of petNames) {
  const hits = petsData.filter((p) => (p.name || '').includes(n))
  if (!hits.length) { console.log(`[缺失] ${n}`); continue }
  for (const p of hits) {
    console.log(`--- ${p.name} (id=${p.id} q=${p.q} pos=${p.pos}) 武=${JSON.stringify(p.force)} 智=${JSON.stringify(p.iq)}`)
    console.log(`    技能: ${JSON.stringify(p.skill || p.skills || '').slice(0, 800)}`)
  }
}
// 顺便看一下 heroes.js 的字段结构样例
const sample = Object.values(heroesMap)[0]
console.log('===== heroesMap 字段样例 =====')
console.log(JSON.stringify(sample, null, 1).slice(0, 1200))
