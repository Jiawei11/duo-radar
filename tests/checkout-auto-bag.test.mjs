import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const addSource = readFileSync(new URL("../src-tauri/src/checkout_add_to_bag.js", import.meta.url), "utf8");
const removeSource = readFileSync(new URL("../src-tauri/src/checkout_remove_from_bag.js", import.meta.url), "utf8");
const linesSource = readFileSync(new URL("../src-tauri/src/checkout_line_items.js", import.meta.url), "utf8");
const expected = { partNumber: "MK2Q4CH/A", productName: "iPhone Duo 512GB 夜空色", removeId: "owned-item.delete" };
const location = { hostname: "www.apple.com.cn", pathname: "/shop/buy-iphone/iphone-duo/mk2q4ch/a", search: "" };

function run(source, document, page, ...args) {
  return JSON.parse(vm.runInNewContext(`JSON.stringify((${source})(...args))`, { document, location: page, URLSearchParams, args }));
}

test("只在到货 SKU 与商品页名称一致时，选择无折抵和无 AppleCare，然后只加购一次", () => {
  let additions = 0;
  const noTrade = { checked: false, disabled: false, click() { this.checked = true; } };
  const noCare = { checked: false, disabled: false, click() { this.checked = true; } };
  const button = { get disabled() { return !noTrade.checked || !noCare.checked; }, click() { additions++; }, scrollIntoView() {}, getBoundingClientRect: () => ({x:10,y:20,width:100,height:40}) };
  const document = { querySelector(selector) {
    return ({
      '[data-autom="summary-productName"]': { innerText: expected.productName },
      'button[data-autom="add-to-cart"]': button,
      'input[data-autom="choose-noTradeIn"]': noTrade,
      'input[data-autom="noapplecare"]': noCare,
    })[selector] ?? null;
  } };
  assert.equal(run(addSource, document, location, expected).ready, false);
  assert.equal(noTrade.checked, true);
  assert.equal(noCare.checked, false);
  assert.equal(run(addSource, document, location, expected).ready, false);
  assert.equal(run(addSource, document, location, expected).ready, true);
  assert.equal(additions, 0, "轮询准备按钮时不能加购");
  assert.deepEqual(run(addSource, document, location, expected, "add").point, {x:60,y:40});
  assert.equal(additions, 0, "脚本只定位按钮，实际点击由浏览器输入事件执行");
});

test("相同名称但 SKU、域名或页面实际型号不符时不能加购", () => {
  for (const [page, name] of [
    [{ ...location, pathname: "/shop/buy-iphone/iphone-duo/mk2u4ch/a" }, expected.productName],
    [{ ...location, hostname: "example.com" }, expected.productName],
    [location, "iPhone Duo 1TB 夜空色"],
  ]) {
    let additions = 0;
    const document = { querySelector(selector) {
      if (selector === '[data-autom="summary-productName"]') return { innerText: name };
      if (selector === 'button[data-autom="add-to-cart"]') return { disabled: false, click() { additions++; } };
      return null;
    } };
    const result = run(addSource, document, page, expected, "add");
    assert.equal(result.clicked, false);
    assert.equal(additions, 0);
  }
});

function bagFixture({ count = 1, part = expected.partNumber, quantity = "1", id = expected.removeId, name = expected.productName, empty = false } = {}) {
  let removals = 0;
  const title = { innerText: name, getAttribute: () => `/shop/product/${part.toLowerCase()}` };
  const remove = { id, disabled: false, click() { removals++; } };
  const row = {
    innerText: `${name} 数量 ${quantity}`,
    getAttribute: () => "bag-item-1",
    querySelector(selector) {
      if (selector === '[data-autom="bag-item-name"], h2, h3' || selector === 'a[data-autom="bag-item-name"]') return title;
      if (selector === 'select[data-autom="item-quantity-dropdown"]') return { value: quantity };
      if (selector === 'button[data-autom="bag-item-remove-button"]') return remove;
      return null;
    },
  };
  return { document: {
    querySelectorAll: () => Array(count).fill(row),
    querySelector(selector) {
      if (selector === '[data-autom="bag-empty-continueshopping-button"]') return empty ? {} : null;
      if (selector === '[data-autom="bag-header"]') return count > 0 ? {} : null;
      return null;
    },
  }, removals: () => removals };
}

test("失败清理只移除原来的一个 SKU，其他商品、数量或条目 ID 变化时停止", () => {
  for (const options of [{}, { count: 2 }, { part: "MK2U4CH/A" }, { quantity: "2" }, { id: "user-added-item.delete" }, { name: "另一件商品" }]) {
    const bag = bagFixture(options);
    const allowed = Object.keys(options).length === 0;
    assert.equal(run(removeSource, bag.document, { ...location, pathname: "/shop/bag" }, expected), allowed);
    assert.equal(bag.removals(), Number(allowed));
  }
});

test("页面加载中没有商品行不能误判空袋，必须读到 Apple 的空袋状态", () => {
  const loading = bagFixture({ count: 0 });
  const empty = bagFixture({ count: 0, empty: true });
  const page = { ...location, pathname: "/shop/bag" };
  assert.equal(run(linesSource, loading.document, page, []).bagReady, false);
  assert.equal(run(linesSource, loading.document, page, []).bagEmpty, false);
  assert.equal(run(linesSource, empty.document, page, []).bagReady, true);
  assert.equal(run(linesSource, empty.document, page, []).bagEmpty, true);
  const full = run(linesSource, bagFixture().document, page, []);
  assert.equal(full.items[0].partNumber, expected.partNumber);
  assert.equal(full.items[0].removeId, expected.removeId);
});
