const { cloud } = require('../../utils/cloud')
const builtin = require('../../data/guides')

// 展示排序：置顶 > sort 值大在前 > 更新时间新在前（与后台一致）
function rank(a, b) {
  const pa = a.pinned ? 1 : 0
  const pb = b.pinned ? 1 : 0
  if (pa !== pb) return pb - pa
  const sa = a.sort || 0
  const sb = b.sort || 0
  if (sa !== sb) return sb - sa
  return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
}

Page({
  data: {
    list: [], // {id, title, summary, time, cloud, pinned}
    fromCloud: false,
    loading: true,
  },
  onShow() {
    this.load()
  },
  load() {
    const that = this
    cloud.database
      .from('guides')
      .select('id, title, summary, content, pinned, sort, updated_at')
      .limit(50)
      .then(({ data, error }) => {
        if (error || !data || !data.length) return that.useBuiltin()
        const rows = data.slice().sort(rank)
        that.setData({
          list: rows.map((r) => ({
            id: String(r.id),
            title: r.title,
            summary: r.summary || that.excerpt(r.content),
            time: that.fmt(r.updated_at),
            pinned: !!r.pinned,
            cloud: true,
          })),
          fromCloud: true,
          loading: false,
        })
      })
      .catch(() => that.useBuiltin())
  },
  useBuiltin() {
    this.setData({
      list: builtin.map((g) => ({ id: g.id, title: g.title, summary: g.summary || this.excerpt(g.content), time: g.updated || '', pinned: false, cloud: false })),
      fromCloud: false,
      loading: false,
    })
  },
  excerpt(text) {
    const line = String(text || '')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && s.charAt(0) !== '#')[0] || ''
    return line.slice(0, 50)
  },
  fmt(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  },
  open(e) {
    wx.navigateTo({ url: '/pages/guide/guide?id=' + e.currentTarget.dataset.id })
  },
})
