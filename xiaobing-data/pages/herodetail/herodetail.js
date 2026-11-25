const heroesMap = require('../../data/heroes.js')
const eraData = require('../../data/era.js')

const Q_COLOR = { 1: '#9aa0a6', 2: '#2e9dbe', 3: '#a058c8', 4: '#e0913c', 5: '#c85f50', 6: '#e0417a' }

Page({
  data: { d: null },
  onLoad(options) {
    const h = heroesMap[options.id]
    if (!h) return
    const ed = eraData.filter((e) => e.name === h.era)[0]
    // 进化形态：h.evolve = 本英雄可进化成的目标；反向查出「本英雄是谁的进化形态」
    const evolveName = h.evolve && heroesMap[h.evolve] ? heroesMap[h.evolve].name : ''
    const baseName = Object.keys(heroesMap)
      .filter((id) => heroesMap[id].evolve === h.id)
      .map((id) => heroesMap[id].name)[0] || ''
    const d = {
      id: h.id,
      name: h.name,
      title: h.title,
      era: h.era,
      qcolor: Q_COLOR[h.quality] || '#9c8a70',
      quality: h.quality,
      force: h.force ? h.force.join(' ~ ') : '—',
      iq: h.iq ? h.iq.join(' ~ ') : '—',
      skill: h.skill || null,
      fetters: (h.fetters || []).map((f) => ({
        name: f.name,
        effect: f.effect,
        members: f.heroes && f.heroes.length ? '与' + f.heroes.join('、') : '',
      })),
      explain: h.explain || '',
      eraDesc: ed ? ed.main : '',
      eraNote: ed ? ed.note : '',
      evolveName,
      evolveFromName: baseName,
    }
    this.setData({ d })
    wx.setNavigationBarTitle({ title: h.name + ' · 英雄图鉴' })
  },
})
