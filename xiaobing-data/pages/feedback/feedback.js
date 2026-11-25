const { cloud } = require('../../utils/cloud')

const CATS = ['🛠 功能异常', '💡 建议改进', '😣 体验问题', '📎 其他反馈']

// 部分预览/模拟环境未实现全部 wx 接口，统一做存在性判断
function safeCall(fn, opts) {
  try {
    if (typeof wx !== 'undefined' && typeof fn === 'function') fn(opts)
  } catch (e) {
    /* 忽略 */
  }
}
const showLoading = (o) => safeCall(wx.showLoading, o)
const hideLoading = () => safeCall(wx.hideLoading)
const showToast = (o) => safeCall(wx.showToast, o)
const showModal = (o) => safeCall(wx.showModal, o)

Page({
  data: {
    cats: CATS,
    cat: 0,
    content: '',
    contact: '',
    submitting: false,
  },
  onShow() {
    // 静默登录：失败也不阻塞文字反馈（未登录时提交由数据库策略决定）
    cloud.auth.getSession().then(({ data: session }) => {
      if (session && session.user) {
        this.uid = session.user.id
        return
      }
      wx.login({
        success: ({ code }) => {
          const appid = wx.getAccountInfoSync().miniProgram.appId
          cloud.auth
            .signInWithWechat(code, appid)
            .then(({ data }) => {
              if (data && data.user) this.uid = data.user.id
            })
            .catch(() => {})
        },
        fail: () => {},
      })
    })
  },
  pickCat(e) {
    this.setData({ cat: Number(e.currentTarget.dataset.idx) })
  },
  onContent(e) {
    this.setData({ content: e.detail.value || '' })
  },
  onContact(e) {
    this.setData({ contact: e.detail.value || '' })
  },
  async submit() {
    if (this.data.submitting) return
    const content = (this.data.content || '').trim()
    if (!content) {
      showToast({ title: '先描述一下问题或建议', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    showLoading({ title: '提交中…', mask: true })

    const { error } = await cloud.database.from('feedback').insert({
      content,
      contact: (this.data.contact || '').trim(),
      category: CATS[this.data.cat],
    })
    hideLoading()
    if (error) {
      this.setData({ submitting: false })
      showToast({ title: '提交失败，请稍后再试', icon: 'none' })
      return
    }
    this.setData({ submitting: false, content: '', contact: '' })
    showModal({
      title: '提交成功',
      content: '感谢反馈！我们会认真查看每一条意见。',
      showCancel: false,
      confirmText: '好的',
    })
  },
})
