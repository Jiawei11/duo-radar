import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src-tauri/src/cart_pickup.js',import.meta.url),'utf8');
function fixture() {
  const clicks=[];
  let now=0;
  class Input {constructor(){this._value='';this.placeholder='Zip Code or City, State';this.type='text';this.id='zip';this.shown=true;}get value(){return this._value;}set value(value){this._value=value;}dispatchEvent(){} getClientRects(){return this.shown?[{}]:[];}}
  const input=new Input();
  const button=text=>({textContent:text,getClientRects:()=>[{}],click:()=>clicks.push(text)});
  let buttons=[],inputs=[],stores=[],labels=[];
  const document={querySelector:()=>null,querySelectorAll(selector){
    if(selector.startsWith('button,')) return buttons;
    if(selector==='input') return inputs;
    if(selector==='label') return labels;
    if(selector==='input[name="store-locator-result"]') return stores;
    return [];
  }};
  const context={document,window:{},HTMLInputElement:Input,Event:class{},Date:{now:()=>now},location:{protocol:'https:',hostname:'www.apple.com',pathname:'/shop/bag'}};
  const run=(zip='10153')=>JSON.parse(vm.runInNewContext(`JSON.stringify((${source})(${JSON.stringify(zip)}))`,context));
  return {clicks,input,button,context,run,set:(state)=>{buttons=state.buttons??[];inputs=state.inputs??[];stores=state.stores??[];labels=state.labels??[];},tick:()=>{now+=2000;}};
}
test('checkout and guest submit once; other continue and order buttons are never clicked',()=>{
  const f=fixture();f.set({buttons:['Check out with Apple Pay','Check Out','Place Order'].map(f.button)});
  assert.equal(f.run().state,'checkout');f.run();assert.deepEqual(f.clicks,['Check Out']);
  f.context.location.pathname='/shop/signIn';f.set({buttons:[f.button('Continue as Guest'),f.button('Sign In')]});
  assert.equal(f.run().state,'guest');f.run();assert.deepEqual(f.clicks,['Check Out','Continue as Guest']);
  f.context.location.hostname='example.com';f.context.window={};f.run();assert.equal(f.clicks.length,2);
});
test('pickup submits the exact ZIP once, waits for editor to close, and hands off before selecting stores',()=>{
  const f=fixture();f.context.location.pathname='/shop/checkout';
  const next=f.button('Continue to Pickup Details');
  f.set({buttons:[f.button("I'll pick it up"),next],inputs:[f.input]});
  assert.equal(f.run().state,'pickup');
  assert.equal(f.run().state,'zip');assert.equal(f.input.value,'10153');
  f.set({buttons:[f.button('Apply'),next],inputs:[f.input]});
  assert.equal(f.run().state,'apply');f.run();assert.equal(f.clicks.filter(s=>s==='Apply').length,1);
  f.tick();assert.equal(f.run().state,'wait','open editor is not completed search');
  f.input.shown=false;f.set({buttons:[next],stores:[{value:'R095',click:()=>assert.fail('store must remain manual')}]});
  assert.equal(f.run().state,'ready');assert.equal(f.clicks.includes('Continue to Pickup Details'),false);
});
