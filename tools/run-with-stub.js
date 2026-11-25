#!/usr/bin/env node
// 本地回归测试公共入口：为小程序运行环境提供最小存根后运行指定测试
// 用法: node tools/run-with-stub.js <test-name> [其余参数透传]
const path = require('path');
const Module = require('module');

const cloudPath = path.resolve(__dirname, '../xiaobing-data/utils/cloud.js');
const m = new Module(cloudPath);
m.filename = cloudPath;
m.loaded = true;
const q = (data) => Promise.resolve({ data: data || [], error: null });
m.exports = {
  cloud: {
    database: { from: () => ({ select: () => ({ eq: () => ({ limit: () => q([]) }) }) }) },
    rpc: () => q(null),
    auth: { getSession: () => q({ data: null }), signOut: () => q(null) },
  },
  publicConfig: {},
};
require.cache[cloudPath] = m;

const store = {};
global.wx = Object.assign(
  {
    setStorageSync(k, v) { store[k] = v; },
    getStorageSync(k) { return store[k] === undefined ? '' : store[k]; },
    showToast() {},
    createSelectorQuery() { return { selectAll: () => ({ fields: () => {} }), exec: () => {} }; },
  },
  global.wx || {}
);
global.Page = global.Page || (() => {});
global.getApp = global.getApp || (() => ({ globalData: { publicConfig: {} } }));

const target = process.argv[2];
if (!target) {
  console.error('用法: node tools/run-with-stub.js <tools/xxx.js>');
  process.exit(1);
}
require(path.resolve(__dirname, target));
