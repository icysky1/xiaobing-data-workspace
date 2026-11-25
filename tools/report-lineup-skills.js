// 阵容技能 & 羁绊统计：打印逐人技能、激活羁绊、效果汇总
const fs = require('fs')
const path = require('path')
const Module = require('module')

global.Page = function () {}
global.wx = { setStorageSync() {}, getStorageSync() { return null } }
const LP = path.join(__dirname, '../xiaobing-data/pages/lineup/lineup.js')
const code = fs.readFileSync(LP, 'utf8') + '\nmodule.exports = { calcAll, makeSlots, heroCard, petCard, heroesMap, petsData }'
const m = new Module('r')
m.filename = LP
m.paths = Module._nodeModulePaths(path.dirname(LP))
m._compile(code, LP)
const L = m.exports
const byName = {}
Object.values(L.heroesMap).forEach((h) => { byName[h.name] = h })

const LINEUPS = {
  全卡版: {
    back: ['黄金甲·嫦娥', '飞仙·李白', '太阴星君', '飞仙·苏妲己', '红线', '飞仙·黄帝'],
    mid: ['妇好', '黄金甲·聂隐娘', '戏魂·华胥氏', '黄金甲·精卫', '孙悟空'],
    front: ['黄金甲·邓婵玉', '吴刚', '平阳昭公主', '戏魂·阿青', '戏魂·祝融', '戏魂·九天玄女'],
    pet: '鸣蛇', petIdx: 11,
  },
  基础卡版: {
    back: ['红线', '妈祖', '李白', '精卫', '碧霄娘娘', '华胥氏'],
    mid: ['平阳昭公主', '甄嬛儿', '云霄娘娘', '太阴星君', '嫦娥'],
    front: ['达摩', '阿青', '九天玄女', '妇好', '聂隐娘', '孙悟空'],
    pet: '鸣蛇', petIdx: 11,
  },
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
      if (!h) { console.log('[缺]', n); return }
      slots[idx].unit = L.heroCard(h)
    })
  })
  if (cfg.pet) slots[cfg.petIdx].unit = L.petCard(L.petsData.find((p) => p.name === cfg.pet))
  return slots
}
const enemySlots = build(ENEMY)

function run(label, cfg) {
  console.log('\n================ ' + label + ' ================')
  const r = L.calcAll({ ours: { slots: build(cfg) }, enemy: { slots: enemySlots } })
  const d = r.ours.detail
  console.log('总战力:', Math.round(r.ours.total.min) + '~' + Math.round(r.ours.total.max))

  console.log('\n-- 逐人技能 --')
  ;['front', 'mid', 'back'].forEach((row) => {
    const cn = { front: '前排', mid: '中排', back: '后排' }[row]
    cfg[row].forEach((n, i) => {
      const h = byName[n]
      if (!h) return
      const sk = h.skill || {}
      const desc = (sk.desc || '').replace(/\n/g, ' ; ')
      console.log(`${cn}${i + 1} ${n}（${h.era}｜武${Math.round((h.force[0] + h.force[1]) / 2)} 智${Math.round((h.iq[0] + h.iq[1]) / 2)}｜${h.gender === 2 ? '女' : '男'}）| ${sk.name || '无'}：${desc}`)
    })
  })
  const petArr = Array.isArray(L.petsData) ? L.petsData : Object.values(L.petsData)
  const pet = petArr.find((p) => p.name === cfg.pet)
  if (pet && pet.skillGroups) {
    console.log(`神兽 ${cfg.pet} | ` + pet.skillGroups.map((g) => {
      const s = g.skills.find((x) => x.ul === 1) || g.skills[0]
      return s.name + (s.ul === 1 ? '（1级生效）' : '（需' + s.ul + '级，平等模式不生效）') + '：' + s.desc
    }).join(' ｜ '))
  } else {
    console.log('神兽 ' + cfg.pet + ' | 数据缺 skillGroups')
  }

  console.log('\n-- 激活羁绊（引擎口径 ' + d.fetters.length + ' 条） --')
  d.fetters.forEach((x) => console.log(`  · ${x.name}（${x.members || ''}）${x.effect}`))

  console.log('\n-- 技能效果聚合 --')
  const buckets = {}
  ;['front', 'mid', 'back'].forEach((row) => cfg[row].forEach((n) => {
    const h = byName[n]
    if (!h || !h.skill || !h.skill.desc) return
    h.skill.desc.split('\n').forEach((line) => {
      const key = line.split(':')[0]
      if (!buckets[key]) buckets[key] = []
      buckets[key].push(n)
    })
  }))
  Object.entries(buckets).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => console.log(`  ${k} ×${v.length}：${v.join('、')}`))

  console.log('\n-- 引擎技能标签（quantified） --')
  console.log('  ' + (d.skillLabels || []).join('\n  '))
  console.log('\n-- 神兽标签 --')
  console.log('  ' + (d.petLabels || []).join('\n  '))
  console.log('\n-- 阵营 --')
  console.log('  ' + (d.eraBuffs || []).join('\n  '))
  console.log('  阵营技能: ' + (d.eraSkills || []).join(' / '))
}
run('全卡版', LINEUPS['全卡版'])
run('基础卡版', LINEUPS['基础卡版'])
