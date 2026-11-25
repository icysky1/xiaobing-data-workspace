const pets = require('../../data/pets.js')

const PET_Q_COLOR = ['#9e9e9e', '#6fae4e', '#3d9bd1', '#9a5fd0', '#e0862c', '#d94f43', '#d9528f', '#5c6bc0', '#3a343c']
const INHERIT_NAME = { force: '武力', iq: '智力' }

const byId = {}
pets.forEach((p) => { byId[p.id] = p })

// 技能按名称分组：同名连续条目即该技能的等级 1..N（ul=解锁所需神兽等级）
function groupSkills(skills) {
  const groups = []
  ;(skills || []).forEach((s) => {
    const last = groups[groups.length - 1]
    if (last && last.n === s.n) {
      last.levels.push({ lv: last.levels.length + 1, d: s.d, ul: s.ul })
    } else {
      groups.push({ n: s.n, levels: [{ lv: 1, d: s.d, ul: s.ul }] })
    }
  })
  return groups
}

Page({
  data: { d: null, open: '' },
  // 手风琴：同一时刻只展开一项，再点一次收起
  toggle(e) {
    const k = e.currentTarget.dataset.k
    this.setData({ open: this.data.open === k ? '' : k })
  },
  onLoad(options) {
    const id = Number(options.id)
    const p = byId[id]
    if (!p) return
    // 继承：{force, iq}（百分比值）→ 「武力+55% 智力+18%」
    const inheritText = p.inherit
      ? Object.keys(p.inherit)
          .filter((k) => p.inherit[k])
          .map((k) => (INHERIT_NAME[k] || k) + '+' + p.inherit[k] + '%')
          .join('　') || '—'
      : '—'
    // 本神兽作材料：按 other 去重并合并 outs
    const asMatMap = {}
    ;(p.mm || []).forEach((m) => {
      if (!asMatMap[m.other]) asMatMap[m.other] = new Set()
      ;(m.outs || []).forEach((o) => asMatMap[m.other].add(o))
    })
    const d = {
      id,
      name: p.name,
      qi: p.qi || 'D',
      qcolor: PET_Q_COLOR[p.q] || '#9c8a70',
      pos: p.pos,
      inheritText,
      stats: [
        { label: '武力', range: p.fp ? p.fp.join(' ~ ') : '—' },
        { label: '智力', range: p.sp ? p.sp.join(' ~ ') : '—' },
      ],
      story: p.story || '',
      skills: groupSkills(p.skills),
      recipes: (p.mf || []).map((r) => ({
        text: (byId[r.petA] ? byId[r.petA].name : r.petA) + ' + ' + (byId[r.petB] ? byId[r.petB].name : r.petB),
      })),
      asMat: Object.keys(asMatMap).map((other) => ({
        with: byId[other] ? byId[other].name : other,
        outs: [...asMatMap[other]].map((o) => (byId[o] ? byId[o].name : o)).join(' / '),
      })),
    }
    this.setData({ d })
    wx.setNavigationBarTitle({ title: p.name + ' · 神兽图鉴' })
  },
})
