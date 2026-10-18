import test from 'node:test';
import assert from 'node:assert/strict';
import {copy, text, runtimeText, initialLanguage} from '../src/lib/i18n.ts';
test('English is the default; saved Chinese preference is restored',()=>{
  assert.equal(initialLanguage(null),'en');assert.equal(initialLanguage('zh'),'zh');assert.equal(initialLanguage('invalid'),'en');
  for(const key of Object.keys(copy)) {assert.ok(text('en',key));assert.ok(text('zh',key));assert.doesNotMatch(text('en',key),/[\p{Script=Han}]/u);}
});
test('switching languages re-renders existing statuses, logs and cart results without losing diagnostics',()=>{
  for(const raw of ['待开放取货','已开始监控。','第 2 轮开始查询：3 家门店、8 项监控。','已从 Apple 官网更新目录：门店 269 家、型号 9 个。','第 2 轮 · 查询浏览器未连接，影响 3 项监控：HTTP 541。库存尚未更新；运行中会按设置间隔重新连接。','iPhone 17 × 1；已选择取货并应用 ZIP 10153，请自行选择门店并继续。','已重新打开该条取货页面（ZIP 75225），后续请手动操作。','测试提醒失败：请先开启声音提醒']) {
    assert.equal(runtimeText(raw,'zh'),raw);assert.doesNotMatch(runtimeText(raw,'en'),/[\p{Script=Han}]/u);
  }
  assert.match(runtimeText('查询失败：HTTP 541, R095, MG484LL/A','en'),/HTTP 541, R095, MG484LL\/A/);
  assert.match(runtimeText('iPhone 17 × 1；已选择取货并应用 ZIP 10153，请自行选择门店并继续。','en'),/10153/);
});
