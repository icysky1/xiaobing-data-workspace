// 广告位占位组件：正式流量主开通后，把 wxml 中的占位换成
// <ad unit-id="你的广告单元id" ad-type="banner"></ad> 即可
// 后台可在「显示管理」中一键隐藏全部广告位
const { getSiteSettings } = require('../../utils/settings')

Component({
  properties: {
    type: { type: String, value: 'banner' }, // banner | card
  },
  data: { visible: false },
  lifetimes: {
    attached() {
      const that = this
      getSiteSettings().then((s) => {
        // 默认关闭，后台「显示管理」开启后才显示
        that.setData({ visible: s.showAds === true })
      })
    },
  },
})
