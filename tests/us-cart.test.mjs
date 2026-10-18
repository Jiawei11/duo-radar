import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src-tauri/src/cart.js', import.meta.url), 'utf8');
const expected = { part:'MG484LL/A', title:'iPhone 17 256GB Mist Blue', color:'mistblue', capacity:'256gb' };
function run(document, path='/shop/buy-iphone/iphone-17', allow=true, hostname='www.apple.com') {
  return JSON.parse(vm.runInNewContext(`JSON.stringify((${source})(expected, allow))`, {
    document, expected, allow, location:{protocol:'https:',hostname,pathname:path},
  }));
}
function product({color='mistblue',name=expected.title}={}) {
  let clicks=0;
  const noCare={checked:true};
  const options={
    'input[name="dimensionColor"]:checked':{value:color},
    'input[name="dimensionCapacity"]:checked':{value:'256gb'},
    '[data-autom="summary-productName"]':{textContent:name},
    'button[data-autom="add-to-cart"]':{getClientRects:()=>[{}],click:()=>clicks++},
  };
  for(const selector of ['input[name="tradeupinline"][value="noTradeIn"]','input[name="purchase_option_group"][value="fullprice"]','input[name="carrierModel"][value="UNLOCKED/US"]']) options[selector]={checked:true};
  return {document:{body:{innerText:''},querySelector:s=>options[s]??null,querySelectorAll:()=>[{textContent:'No AppleCare coverage',control:noCare}]},clicks:()=>clicks};
}
test('US add requires matching model, color and capacity, and stops clicking after submission',()=>{
  for(const [options,allow,host,expectedClicks] of [[{},true,'www.apple.com',1],[{},false,'www.apple.com',0],[{color:'black'},true,'www.apple.com',0],[{name:'iPhone Duo 256GB Mist Blue'},true,'www.apple.com',0],[{},true,'example.com',0]]) {
    const fixture=product(options);run(fixture.document,undefined,allow,host);assert.equal(fixture.clicks(),expectedClicks);
  }
});
test('US bag reuses exact SKU only at quantity one; loading is not an empty bag',()=>{
  for(const quantity of ['1','2']) {
    const row={getAttribute:()=> 'bag-item-1',classList:{contains:()=>false},querySelector:()=>({value:quantity})};
    const link={textContent:expected.title,getAttribute:()=>'/shop/product/mg484ll/a/iphone-17',parentElement:row};
    const document={body:{innerText:expected.title},querySelector:()=>null,querySelectorAll:s=>s.startsWith('a[')?[link]:[]};
    assert.equal(run(document,'/shop/bag').state,quantity==='1'?'ready':'conflict');
  }
  const document={body:{innerText:''},querySelector:()=>null,querySelectorAll:()=>[]};
  assert.equal(run(document,'/shop/bag').state,'wait');
  document.body.innerText='Your bag is empty.';
  assert.equal(run(document,'/shop/bag').state,'empty');
});
