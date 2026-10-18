// Only product selection, Add to Bag and Review Bag are allowed here. Never checkout.
((expected, allowAdd) => {
  if (location.protocol !== 'https:' || location.hostname !== 'www.apple.com') return {state:'wait'};
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
  const visible = el => el && el.getClientRects().length && !el.disabled;
  if (location.pathname === '/shop/bag') {
    const links = [...document.querySelectorAll('a[href*="/shop/product/"]')];
    const products = links.filter(a => /iphone/i.test(a.textContent));
    const match = products.find(a => a.getAttribute('href').toLowerCase().includes(expected.part.toLowerCase()));
    if (match) {
      let row = match.parentElement;
      while (row && !/^bag-item-\d+$/.test(row.getAttribute('data-autom') || '') && !row.classList.contains('rs-bag-item')) row = row.parentElement;
      const quantity = row?.querySelector('select[data-autom="item-quantity-dropdown"], select');
      if (!quantity) return {state:'wait', reason:'quantity missing', title:match.textContent.trim(), quantities:[...document.querySelectorAll('select')].map(el=>({label:el.getAttribute('aria-label'),value:el.value}))};
      return {state: quantity.value === '1' ? 'ready' : 'conflict', detail:'购物袋同款数量不是 1，请手动检查。'};
    }
    if (products.length || document.querySelector('[data-autom^="bag-item"]'))
      return {state:'conflict', detail:'专用购物袋已有其他商品，请先手动整理后重试。'};
    if (/Your bag is empty/i.test(text)) return {state:'empty'};
    return {state:'wait', reason:'bag loading', headings:[...document.querySelectorAll('h1,h2')].map(el=>el.textContent)};
  }
  const review = document.querySelector('button[data-autom="proceed"]');
  if (visible(review) && /Review Bag/i.test(review.textContent)) {
    review.click(); return {state:'review'};
  }
  const choose = (selector) => {
    const el = document.querySelector(selector);
    if (!el || el.disabled) return false;
    if (!el.checked) { el.click(); return true; }
    return false;
  };
  if (choose('input[name="tradeupinline"][value="noTradeIn"]')) return {state:'select'};
  if (choose('input[name="purchase_option_group"][value="fullprice"]')) return {state:'select'};
  if (choose('input[name="carrierModel"][value="UNLOCKED/US"]')) return {state:'select'};
  const noCareLabel = [...document.querySelectorAll('label')].find(el => /No AppleCare coverage/.test(el.textContent));
  const noCare = noCareLabel && (noCareLabel.control || noCareLabel.querySelector('input'));
  if (noCare && !noCare.checked && !noCare.disabled) { noCare.click(); return {state:'select'}; }
  const color = document.querySelector('input[name="dimensionColor"]:checked')?.value;
  const capacity = document.querySelector('input[name="dimensionCapacity"]:checked')?.value;
  const name = document.querySelector('[data-autom="summary-productName"]')?.textContent.replace(/\s+/g, ' ').trim();
  const selected = name === expected.title && color === expected.color && capacity === expected.capacity &&
    document.querySelector('input[name="tradeupinline"][value="noTradeIn"]')?.checked &&
    document.querySelector('input[name="purchase_option_group"][value="fullprice"]')?.checked &&
    document.querySelector('input[name="carrierModel"][value="UNLOCKED/US"]')?.checked && noCare?.checked;
  const add = document.querySelector('button[data-autom="add-to-cart"]');
  if (allowAdd && selected && visible(add)) { add.click(); return {state:'added'}; }
  return {state:'wait', page:location.pathname, color, capacity,
    trade:!!document.querySelector('input[name="tradeupinline"][value="noTradeIn"]')?.checked,
    full:!!document.querySelector('input[name="purchase_option_group"][value="fullprice"]')?.checked,
    carrier:!!document.querySelector('input[name="carrierModel"][value="UNLOCKED/US"]')?.checked,
    care:!!noCare?.checked, add:!!visible(add)};
})
