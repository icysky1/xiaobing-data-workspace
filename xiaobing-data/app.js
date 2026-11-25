// 全局页面分享：给每个页面自动补 onShareAppMessage / onShareTimeline，
// 使「转发给朋友」「分享到朋友圈」「复制链接」不再置灰。
// 若某页面自己定义了分享回调，则以页面自己的为准。
const _Page = Page

const SHARE_TITLES = [
  ['quiz', '车夫题库 — 417 题全收录'],
  ['dig', '挖宝大全 — 装备·场景·收藏品'],
  ['lineup', '阵容模拟器 — 选将组队·羁绊分析'],
  ['toolbox', '小兵工具箱 — 活动日历·羁绊反查·结义文案'],
  ['pets', '神兽图鉴 — 技能·配方·传承'],
  ['petdetail', '神兽图鉴 — 技能·配方·传承'],
  ['tech', '科技树 — 全等级消耗与效果'],
  ['heroes', '英雄图鉴 — 技能·羁绊·阵营'],
  ['herodetail', '英雄图鉴 — 技能·羁绊·阵营'],
  ['guides', '小兵攻略 — 开荒·搬砖·进阶'],
  ['guide', '小兵攻略 — 开荒·搬砖·进阶'],
  ['feedback', '意见反馈'],
]

function shareTitle(route) {
  const p = '/' + String(route || '').split('?')[0]
  const hit = SHARE_TITLES.find(([k]) => p.indexOf('/pages/' + k) === 0)
  return hit ? hit[1] : '小兵攻略·阵容·神兽·车夫题库'
}

Page = function (options) {
  if (!options.onShareAppMessage) {
    // 不返回 path 时默认分享当前页面（含参数），详情页可直达
    options.onShareAppMessage = function () {
      return { title: shareTitle(this.route) }
    }
  }
  if (!options.onShareTimeline) {
    options.onShareTimeline = function () {
      return { title: shareTitle(this.route) }
    }
  }
  return _Page(options)
}

App({
  onLaunch() {
    // 点亮右上角菜单里的分享按钮（朋友圈仅安卓端显示）
    if (typeof wx !== 'undefined' && wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: false,
        menus: ['shareAppMessage', 'shareTimeline'],
        fail: () => {},
      })
    }
  },
  globalData: {
    publicConfig: {
      endpoint: 'https://mp-api.app.workbuddy.host',
      publishableKey: 'wbpk_1VPgE5qQVfK73Al8nZsWHD_Cfa10fybz3kJJqQej1lf1JcB9U7aD9Ri',
    },
  },
})
