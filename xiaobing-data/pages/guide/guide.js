const { cloud } = require('../../utils/cloud')
const builtin = require('../../data/guides')

Page({
  data: {
    title: '',
    time: '',
    blocks: [], // {type: 'h'|'li'|'p', text}
  },
  onLoad(options) {
    const id = String(options.id || '')
    if (/^\d+$/.test(id)) {
      const that = this
      cloud.database
        .from('guides')
        .select('title, content, updated_at')
        .eq('id', Number(id))
        .limit(1)
        .then(({ data }) => {
          if (data && data.length) return that.render(data[0].title, data[0].content, data[0].updated_at)
          that.renderBuiltin(id)
        })
        .catch(() => this.renderBuiltin(id))
    } else {
      this.renderBuiltin(id)
    }
  },
  renderBuiltin(id) {
    const g = builtin.find((x) => x.id === id) || builtin[0]
    if (g) this.render(g.title, g.content, g.updated)
  },
  render(title, content, updatedAt) {
    let time = ''
    if (updatedAt) {
      const d = new Date(updatedAt)
      if (!isNaN(d.getTime())) time = '更新于 ' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }
    const blocks = []
    String(content || '')
      .split('\n')
      .forEach((line) => {
        const t = line.trim()
        if (!t) return
        if (t.charAt(0) === '#') blocks.push({ type: 'h', text: t.replace(/^#+\s*/, '') })
        else if (t.charAt(0) === '-' || t.charAt(0) === '—') blocks.push({ type: 'li', text: t.replace(/^[-—]+\s*/, '') })
        else blocks.push({ type: 'p', text: t })
      })
    this.setData({ title, time, blocks })
    wx.setNavigationBarTitle({ title: title || '攻略详情' })
  },
})
