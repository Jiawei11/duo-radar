import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const addSource = readFileSync(new URL("../src-tauri/src/checkout_add_to_bag.js", import.meta.url), "utf8");
const removeSource = readFileSync(new URL("../src-tauri/src/checkout_remove_from_bag.js", import.meta.url), "utf8");
const linesSource = readFileSync(new URL("../src-tauri/src/checkout_line_items.js", import.meta.url), "utf8");
const expected = { partNumber: "MK2Q4CH/A", productName: "iPhone Duo 512GB 夜空色", removeId: "owned-item.delete" };
const location = { protocol: "https:", hostname: "www.apple.com.cn", pathname: "/shop/buy-iphone/iphone-duo/mk2q4ch/a", search: "" };

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

test("删除条目必须匹配刚读取的 SKU、名称、数量和唯一条目 ID", () => {
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

function multiBag(items) {
  const rows = [];
  const removed = [];
  for (const item of items) {
    const title = { innerText: item.name, getAttribute: () => item.part ? `/shop/product/${item.part}` : '' };
    const remove = { id: item.id, disabled: !!item.disabled, click() { removed.push(item.id); rows.splice(rows.indexOf(row), 1); } };
    const row = {
      innerText: `${item.name}${item.quantity ? ' 数量 ' + item.quantity : ''}`,
      getAttribute: () => `bag-item-${rows.indexOf(row) + 1}`,
      querySelector(selector) {
        if (selector === '[data-autom="bag-item-name"], h2, h3' || selector === 'a[data-autom="bag-item-name"]') return title;
        if (selector === 'select[data-autom="item-quantity-dropdown"]') return item.quantity ? { value: item.quantity } : null;
        if (selector === 'button[data-autom="bag-item-remove-button"]') return remove;
        return null;
      },
    };
    rows.push(row);
  }
  return { removed, document: {
    querySelectorAll: () => rows,
    querySelector(selector) {
      if (selector === '[data-autom="bag-header"]') return rows.length ? {} : null;
      if (selector === '[data-autom="bag-empty-continueshopping-button"]') return rows.length ? null : {};
      return null;
    },
  } };
}
const bagPage = { ...location, pathname: '/shop/bag' };
const targetItem = { part: expected.partNumber, name: expected.productName, quantity: '1', id: expected.removeId };
const otherItem = { part: 'MJTA4CH/A', name: 'iPhone 18 Pro 256GB 冰川蓝色', quantity: '1', id: 'old-pro.delete' };
const snapshot = item => ({ partNumber: item.part, productName: item.name, quantity: item.quantity, removeId: item.id });

test('混合购物袋只删除指定旧型号，准备检查不点击；其余目标商品保持一件', () => {
  const bag = multiBag([otherItem, targetItem]);
  assert.equal(run(removeSource, bag.document, bagPage, snapshot(otherItem), 'ready'), true);
  assert.deepEqual(bag.removed, []);
  assert.equal(run(removeSource, bag.document, bagPage, snapshot(otherItem), 'remove'), true);
  const state = run(linesSource, bag.document, bagPage, []);
  assert.deepEqual(bag.removed, [otherItem.id]);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].partNumber, expected.partNumber);
  assert.equal(state.items[0].quantity, '1');
});

test('连续移除多个旧商品时使用新页面条目ID，不受行索引变化影响', () => {
  const second = { ...otherItem, part: 'MK2U4CH/A', name: 'iPhone Duo 1TB 夜空色', id: 'old-duo.delete' };
  const bag = multiBag([otherItem, targetItem, second]);
  for (const item of [otherItem, second]) assert.equal(run(removeSource, bag.document, bagPage, snapshot(item)), true);
  assert.deepEqual(bag.removed, [otherItem.id, second.id]);
  assert.equal(run(linesSource, bag.document, bagPage, []).items[0].removeId, targetItem.id);
});

test('异常数量和无SKU附件也可按实际条目快照清除，再等待空袋确认', () => {
  for (const item of [{ ...targetItem, quantity: '2' }, { part: '', name: '旧配件', quantity: '', id: 'accessory.delete' }]) {
    const bag = multiBag([item]);
    assert.equal(run(removeSource, bag.document, bagPage, snapshot(item)), true);
    assert.equal(run(linesSource, bag.document, bagPage, []).bagEmpty, true);
  }
});

test('购物袋条目变化、删除按钮禁用、非购物袋和非官方HTTPS页面都不删除', () => {
  for (const [item, page] of [
    [{ ...otherItem, quantity: '2' }, bagPage],
    [{ ...otherItem, disabled: true }, bagPage],
    [otherItem, { ...bagPage, pathname: '/shop/checkout' }],
    [otherItem, { ...bagPage, hostname: 'example.test' }],
    [otherItem, { ...bagPage, protocol: 'http:' }],
  ]) {
    const bag = multiBag([item]);
    assert.equal(run(removeSource, bag.document, page, snapshot(otherItem)), false);
    assert.deepEqual(bag.removed, []);
  }
});
