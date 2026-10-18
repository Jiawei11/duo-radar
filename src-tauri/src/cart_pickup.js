// Limited guest flow: Check Out -> Guest -> pickup -> ZIP Apply. Never select a store or continue.
((zip) => {
  const allowedHost = location.hostname === 'www.apple.com' || /^secure\d*\.store\.apple\.com$/.test(location.hostname);
  if (location.protocol !== 'https:' || !allowedHost) return {state:'wait',reason:'等待 Apple 商店页面'};
  const visible = el => el && el.getClientRects().length && !el.disabled;
  const norm = text => (text || '').replace(/[’‘]/g, "'").replace(/\s+/g,' ').trim();
  const buttons = [...document.querySelectorAll('button, a[role="button"], input[type="submit"]')].filter(visible);
  const button = re => buttons.find(el => re.test(norm(el.textContent || el.value)));
  if (location.pathname === '/shop/bag') {
    const checkout = button(/^Check Out$/i);
    if (checkout && !window.__duoCheckoutClicked) { window.__duoCheckoutClicked=true; checkout.click(); return {state:'checkout'}; }
  }
  const guest = button(/^Continue as Guest$/i);
  if (guest && !window.__duoGuestClicked) { window.__duoGuestClicked=true; guest.click(); return {state:'guest'}; }
  if (!window.__duoPickup || window.__duoPickup.zip !== zip) window.__duoPickup = {zip, applied:false, pickupSelected:false};
  const flow = window.__duoPickup;
  const pickupButton = button(/^I'll pick it up$/i);
  if (pickupButton && !flow.pickupSelected) { flow.pickupSelected=true; pickupButton.click(); return {state:'pickup'}; }
  const labels = [...document.querySelectorAll('label')];
  const pickupLabel = labels.find(el => /^I'll pick it up$/i.test(norm(el.textContent)));
  const pickup = pickupLabel && (pickupLabel.control || pickupLabel.querySelector('input'));
  if (pickup && !pickup.checked && !pickup.disabled) { pickup.click(); return {state:'pickup'}; }
  const zipLabel = labels.find(el => /^Zip Code or City, State$/i.test(norm(el.textContent)));
  const input = [...document.querySelectorAll('input')].find(el => visible(el) && /Zip Code or City, State/i.test(el.placeholder || '')) || (zipLabel && visible(zipLabel.control) && zipLabel.control);
  if (!input && flow.pickupSelected && !flow.applied) {
    const edit = document.querySelector('button[data-autom="fulfillment-pickup-store-search-button"]');
    if (visible(edit) && !flow.editOpened) { flow.editOpened=true; edit.click(); return {state:'editZip'}; }
  }
  if (input) {
    const state = window.__duoPickup;
    if (input.value !== zip && !state.applied) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,zip);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      return {state:'zip'};
    }
    const apply = button(/^Apply$/i);
    if (!state.applied && input.value === zip && apply) {
      state.applied = true; state.appliedAt=Date.now(); apply.click(); return {state:'apply'};
    }
  }
  const results=[...document.querySelectorAll('input[name="store-locator-result"]')];
  if (flow.applied && !input && Date.now()-flow.appliedAt>1500 && results.length &&
      ![...document.querySelectorAll('[aria-busy="true"]')].some(visible))
    return {state:'ready',zip,stores:results.map(el=>el.value)};
  return {state:'wait',page:location.pathname,buttons:buttons.map(el=>norm(el.textContent || el.value)).slice(0,18),
    inputs:[...document.querySelectorAll('input')].filter(visible).map(el=>({id:el.id,type:el.type,placeholder:el.placeholder})),
    labels:labels.map(el=>norm(el.textContent)).slice(0,16)};
})
