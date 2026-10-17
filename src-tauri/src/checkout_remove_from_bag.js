(expected) => {
  const normalize = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
  if (location.hostname !== 'www.apple.com.cn' || location.pathname !== '/shop/bag') return false;
  const rows = [...document.querySelectorAll('[data-autom^="bag-item-"]')].filter((e) => /^bag-item-\d+$/.test(e.getAttribute('data-autom')));
  // 不清除其他商品。袋中出现额外内容时交给用户处理，不能一起结账或一键清空。
  if (rows.length !== 1) return false;
  const row = rows[0];
  const title = row.querySelector('a[data-autom="bag-item-name"]');
  const part = title && (title.getAttribute('href') || '').match(/\/shop\/product\/([^/?#]+\/[^/?#]+)/i);
  const quantity = row.querySelector('select[data-autom="item-quantity-dropdown"]');
  const remove = row.querySelector('button[data-autom="bag-item-remove-button"]');
  if (!title || !part || decodeURIComponent(part[1]).toUpperCase() !== expected.partNumber.toUpperCase() ||
      normalize(title.innerText) !== normalize(expected.productName) || !quantity || quantity.value !== '1' ||
      !remove || remove.disabled || (expected.removeId && remove.id !== expected.removeId)) return false;
  remove.click();
  return true;
}
