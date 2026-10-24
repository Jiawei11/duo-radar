import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const listeners = new Map();
globalThis.__streamListen = async (name, callback) => { listeners.set(name, callback); return () => {}; };
let invoke;
globalThis.__streamInvoke = (...args) => invoke(...args);
registerHooks({resolve(specifier,context,nextResolve){
  const stubs={
    "@tauri-apps/api/core":"export const invoke=(...args)=>globalThis.__streamInvoke(...args);",
    "@tauri-apps/api/event":"export const listen=(...args)=>globalThis.__streamListen(...args);",
    "@tauri-apps/plugin-opener":"export const openUrl=async()=>{};",
  };
  if(specifier in stubs)return {url:`data:text/javascript,${encodeURIComponent(stubs[specifier])}`,shortCircuit:true};
  if(specifier.startsWith("./")&&!specifier.endsWith(".ts")&&context.parentURL?.includes("/src/lib/"))return nextResolve(`${specifier}.ts`,context);
  return nextResolve(specifier,context);
}});
test("completed rows update and log immediately; final snapshot reconciles without duplicate logs",async()=>{
  const store=await import("../src/lib/store.ts");
  const settings=store.watcherStore.getSnapshot().settings;
  const row=(part,kind="out_of_stock",time=1)=>({target:{locale:"en_US",storeNumber:`R-${part}`,storeTitle:`Store ${part}`,partNumber:part,productName:`iPhone ${part}`},availability:{kind},pickupDetails:null,lastCheckedMs:time,consecutiveFailures:0});
  invoke=async(command)=>command==="get_settings"?settings:command==="get_snapshot"?[row("A"),row("B")]:command==="is_running"?true:[];
  await store.connect();
  const emit=payload=>listeners.get("watcher://event")({payload});
  emit({type:"cycleStarted",cycle:1,storeCount:2,targetCount:2});
  emit({type:"stateChanged",state:row("A","in_stock",10)});
  assert.equal(store.watcherStore.getSnapshot().rows[0].availability.kind,"in_stock");
  assert.equal(store.watcherStore.getSnapshot().rows[1].lastCheckedMs,1);
  assert.equal(store.watcherStore.getSnapshot().logs.filter(l=>l.includes("[A]")).length,1);
  emit({type:"cycleComplete",cycle:1,elapsedMs:100,requestCount:2,reusedResponseCount:0,nextCheckInSecs:30,cooling:false,healthy:true,snapshot:[row("A","in_stock",10),row("B","out_of_stock",20)]});
  assert.equal(store.watcherStore.getSnapshot().rows[1].lastCheckedMs,20);
  assert.equal(store.watcherStore.getSnapshot().logs.filter(l=>l.includes("[A]")).length,1);
  emit({type:"stateChanged",state:row("B","in_stock",25)});
  assert.deepEqual(store.watcherStore.getSnapshot().displayRows.map(r=>r.target.partNumber),["B","A"]);
  assert.deepEqual(store.watcherStore.getSnapshot().rows.map(r=>r.target.partNumber),["A","B"]);
  emit({type:"cycleComplete",cycle:2,elapsedMs:100,requestCount:2,reusedResponseCount:0,nextCheckInSecs:30,cooling:false,healthy:true,snapshot:[row("A","in_stock",40),row("B","in_stock",35)]});
  assert.deepEqual(store.watcherStore.getSnapshot().displayRows.map(r=>r.target.partNumber),["B","A"]);
  emit({type:"stateChanged",state:row("deleted","in_stock",30)});
  assert.equal(store.watcherStore.getSnapshot().rows.length,2);
});


test("stock priority is immediate, newest first, stable across snapshots, and resets on restock/removal", async () => {
  const { createStockPriority } = await import("../src/lib/stockPriority.ts");
  const sort = createStockPriority();
  const row = (part, kind = "out_of_stock", time = 1) => ({
    target: { locale: "en_US", storeNumber: `R-${part}`, partNumber: part },
    availability: { kind }, lastCheckedMs: time,
  });
  const ids = rows => rows.map(r => r.target.partNumber);
  const initial = [row("A"), row("B"), row("C")];
  assert.deepEqual(ids(sort(initial)), ["A", "B", "C"]);
  assert.deepEqual(ids(sort([row("A"), row("B", "in_stock", 10), row("C")])), ["B", "A", "C"]);
  assert.deepEqual(ids(sort([row("A"), row("B", "in_stock", 10), row("C", "in_stock", 20)])), ["C", "B", "A"]);
  assert.deepEqual(ids(sort([row("A"), row("B", "in_stock", 40), row("C", "in_stock", 30)])), ["C", "B", "A"]);
  sort([row("A"), row("B", "out_of_stock", 50), row("C", "in_stock", 50)]);
  assert.deepEqual(ids(sort([row("A"), row("B", "in_stock", 60), row("C", "in_stock", 60)])), ["B", "C", "A"]);
  sort([]);
  assert.deepEqual(ids(sort([row("A"), row("B", "in_stock", 70), row("C", "in_stock", 70)])), ["B", "C", "A"]);
  assert.deepEqual(ids(initial), ["A", "B", "C"]);
});
