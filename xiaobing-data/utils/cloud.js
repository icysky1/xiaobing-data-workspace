const { createMiniProgramWorkBuddyCloud } = require('../miniprogram_npm/@tencent-ai/workbuddy-cloud-sdk/miniprogram.js')
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics')

const publicConfig = getApp().globalData.publicConfig

const cloud = createMiniProgramWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  publishableKey: publicConfig.publishableKey,
  wx: createDiagnosticWx(wx),
})

module.exports = { cloud, publicConfig }
