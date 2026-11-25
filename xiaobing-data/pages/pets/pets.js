const pets = require('../../data/pets.js')

// 品质配色（与游戏卡牌一致）：D灰/C绿/B蓝/A紫/S橙/SS红/SSS粉/SSSS紫蓝/U黑
const PET_Q_COLOR = ['#9e9e9e', '#6fae4e', '#3d9bd1', '#9a5fd0', '#e0862c', '#d94f43', '#d9528f', '#5c6bc0', '#3a343c']

// 一级过滤：站位；二级过滤：品质（从高到低，U 最强排最前）
const POS_TABS = ['全部', '前排', '中排', '后排']
const QI_TABS = ['全部', 'U', 'SSSS', 'SSS', 'SS', 'S', 'A', 'B', 'C', 'D']
const QI_INDEX = { D: 0, C: 1, B: 2, A: 3, S: 4, SS: 5, SSS: 6, SSSS: 7, U: 8 }

const all = pets
  .slice()
  .sort((a, b) => (b.q || 0) - (a.q || 0) || a.id - b.id)
  .map((p) => ({
    id: p.id,
    name: p.name,
    qi: p.qi || 'D',
    pos: p.pos || '',
    qcolor: PET_Q_COLOR[QI_INDEX[p.qi || 'D']] || '#9c8a70',
  }))

Page({
  data: {
    posTabs: POS_TABS,
    qiTabs: QI_TABS,
    curPos: 0,
    curQi: 0,
    list: [],
  },
  onLoad() {
    this.render()
  },
  pickPos(e) {
    this.setData({ curPos: Number(e.currentTarget.dataset.idx) })
    this.render()
  },
  pickQi(e) {
    this.setData({ curQi: Number(e.currentTarget.dataset.idx) })
    this.render()
  },
  render() {
    const pos = this.data.curPos > 0 ? POS_TABS[this.data.curPos] : null
    const qi = this.data.curQi > 0 ? QI_TABS[this.data.curQi] : null
    const list = all.filter((p) => (!pos || p.pos === pos) && (!qi || p.qi === qi))
    this.setData({ list })
  },
  open(e) {
    wx.navigateTo({ url: '/pages/petdetail/petdetail?id=' + e.currentTarget.dataset.id })
  },
})
