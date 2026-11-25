const heroesMap = require('../../data/heroes.js')

const Q_COLOR = { 1: '#9aa0a6', 2: '#2e9dbe', 3: '#a058c8', 4: '#e0913c', 5: '#c85f50', 6: '#e0417a' }

// 只收录真实英雄：排除异族入侵怪（era 神话）、妖魔鬼怪与小兵（品质1，不上阵）
const all = Object.keys(heroesMap)
  .map((k) => heroesMap[k])
  .filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1)

// 时代页签（与游戏一致顺序）
const ERAS = ['巅峰', '夏', '商', '周', '春秋', '战国', '秦', '西汉', '东汉', '三国', '晋', '十六国', '南北朝', '隋', '唐', '五代十国', '北宋', '南宋', '元', '明', '清', '义军', '外族', '侠']

Page({
  data: {
    eras: ERAS,
    curEra: 0,
    keyword: '',
    focusKw: false,
    list: [],
    total: 0,
  },
  onLoad() {
    this.render()
  },
  pickEra(e) {
    this.setData({ curEra: Number(e.currentTarget.dataset.idx), keyword: '' })
    this.render()
  },
  onInput(e) {
    this.setData({ keyword: (e.detail.value || '').trim() })
    this.render()
  },
  onBlur() {
    this.setData({ focusKw: false })
  },
  clearKeyword() {
    // 清空后立刻把焦点还给输入框，方便直接继续输入
    this.setData({ keyword: '', focusKw: true })
    this.render()
  },
  render() {
    const kw = this.data.keyword
    let list
    if (kw) {
      list = all
        .filter(
          (h) =>
            h.name.indexOf(kw) >= 0 ||
            (h.title && h.title.indexOf(kw) >= 0) ||
            (h.skill && h.skill.name && h.skill.name.indexOf(kw) >= 0)
        )
        .slice(0, 60)
    } else {
      const era = ERAS[this.data.curEra]
      list = all.filter((h) => h.era === era)
    }
    list = list
      .slice()
      .sort((a, b) => (b.quality || 0) - (a.quality || 0) || a.id - b.id)
      .map((h) => ({
        id: h.id,
        name: h.name,
        title: h.title,
        qcolor: Q_COLOR[h.quality] || '#9c8a70',
        quality: h.quality,
      }))
    this.setData({ list, total: list.length })
  },
  open(e) {
    wx.navigateTo({ url: '/pages/herodetail/herodetail?id=' + e.currentTarget.dataset.id })
  },
})
