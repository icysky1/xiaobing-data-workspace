/**
 * 生成网页版题库数据（编码存放）
 *
 * 源文件：tools/quiz-source.json（明文，位于 quiz-app 目录之外，不会被发布）
 * 输出：  quiz-app/quiz-data.js（XOR + Base64 编码，运行时解码为 window.QUIZ_DATA）
 *
 * 用法：node tools/build-quiz-data.js
 *
 * 说明：这层编码只能挡住「另存 JS 直接读」的随手盗取，
 *       数据最终必须进入浏览器内存，无法做到真正不可提取。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'quiz-source.json');
const OUT = path.join(ROOT, 'quiz-app', 'quiz-data.js');
const KEY = 'xb-qz-2026-10-30';

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
if (!Array.isArray(data) || !data.length) throw new Error('源数据为空或格式不对');

const json = JSON.stringify(data);
const bytes = Buffer.from(json, 'utf8');
const keyBuf = Buffer.from(KEY, 'utf8');
const enc = Buffer.alloc(bytes.length);
for (let i = 0; i < bytes.length; i++) enc[i] = bytes[i] ^ keyBuf[i % keyBuf.length];
const b64 = enc.toString('base64');

const code =
  '/* 题库数据 · 编码存放，禁止直接引用或再分发 */\n' +
  'window.QUIZ_DATA=(function(){' +
  'var K=' + JSON.stringify(KEY) + ',B="' + b64 + '";' +
  'var s=atob(B),n=s.length,a=new Uint8Array(n),i;' +
  'for(i=0;i<n;i++)a[i]=s.charCodeAt(i)^K.charCodeAt(i%K.length);' +
  'var t;' +
  'if(typeof TextDecoder!=="undefined"){t=new TextDecoder("utf-8").decode(a);}' +
  'else{for(i=0,t="";i<n;i++)t+=String.fromCharCode(a[i]);t=decodeURIComponent(escape(t));}' +
  'return JSON.parse(t);' +
  '})();\n';

fs.writeFileSync(OUT, code, 'utf8');
const kb = (Buffer.byteLength(code) / 1024).toFixed(1);
console.log('已生成 ' + path.relative(ROOT, OUT) + '：' + data.length + ' 题，' + kb + 'KB（明文 ' + (bytes.length / 1024).toFixed(1) + 'KB）');
