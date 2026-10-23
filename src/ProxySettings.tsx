import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Language } from "./lib/i18n";
import { Button } from "./components/ui/button";

export type ProxyEntry = { id:number; ip:string; port:number; user:string; password:string };
export type ProxyConfig = { enabled:boolean; entries:ProxyEntry[] };
type TestResult = { id:number; ok:boolean; latencyMs:number|null; status:number|null; message:string };
function message(raw:string,language:Language):string {
  if(language==="en")return raw;
  const words:Record<string,string>={
    "Import at least one proxy first":"请先导入至少一条代理",
    "No new proxies (empty input or duplicates)":"没有新的代理：输入为空或与已有条目重复",
    "Maximum 250 proxies":"最多支持 250 条代理",
    "Import exceeds size limit":"导入文本过大",
    "Connection timed out":"连接超时",
    "Proxy connection, authentication or TLS failed":"代理连接、认证或 TLS 失败",
    "Proxy no longer exists":"该代理已删除",
    "Cannot encrypt/decrypt proxy settings for this Windows account":"当前 Windows 账户无法加密或解密代理配置",
    "Cannot read proxy settings":"无法读取代理配置",
    "Invalid proxy settings":"代理配置格式错误",
    "Cannot save proxies":"无法保存代理配置",
    "Cannot replace proxy settings":"无法替换代理配置",
  };
  return words[raw]??raw.replace(/^Line (\d+): expected IP:PORT:USER:PASSWORD$/,"第 $1 行格式有误，应为 IP:PORT:USER:PASSWORD");
}

export function useProxySettings() {
  const [config,setConfig]=useState<ProxyConfig>({enabled:false,entries:[]});
  const [error,setError]=useState("");
  const [ready,setReady]=useState(false);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{void invoke<ProxyConfig>("proxy_settings").then(setConfig).catch(e=>setError(String(e))).finally(()=>setReady(true));},[]);
  async function enable(enabled:boolean) {
    setSaving(true);setError("");
    try {setConfig(await invoke<ProxyConfig>("proxy_enable",{enabled}));}
    catch(e){setError(String(e));}finally{setSaving(false);}
  }
  return {config,setConfig,error,setError,ready,saving,enable};
}

export function ProxySettings({language,model,back}:{language:Language;model:ReturnType<typeof useProxySettings>;back:()=>void}) {
  const tr=(en:string,zh:string)=>language==="en"?en:zh;
  const {config,setConfig,error,setError}=model;
  const [text,setText]=useState("");
  const [importing,setImporting]=useState(false);
  const [results,setResults]=useState<Record<number,TestResult>>({});
  const [testing,setTesting]=useState<Set<number>>(new Set());
  const [allBusy,setAllBusy]=useState(false);
  const [mutating,setMutating]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function importProxies(){
    setImporting(true);setError("");
    try {setConfig(await invoke<ProxyConfig>("proxy_import",{text}));setText("");dialog.current?.close();}
    catch(e){setError(String(e));}finally{setImporting(false);}
  }
  async function test(entry:ProxyEntry){
    setTesting(s=>new Set([...s,entry.id]));
    try {const result=await invoke<TestResult>("proxy_test",{id:entry.id});if(mounted.current)setResults(s=>({...s,[entry.id]:result}));}
    catch(e){if(mounted.current)setResults(s=>({...s,[entry.id]:{id:entry.id,ok:false,latencyMs:null,status:null,message:String(e)}}));}
    finally{if(mounted.current)setTesting(s=>{const next=new Set(s);next.delete(entry.id);return next;});}
  }
  async function testAll(){
    setAllBusy(true);setResults({});
    // Backend also bounds concurrency, including requests from multiple UI views.
    await Promise.allSettled(config.entries.map(test));
    if(mounted.current)setAllBusy(false);
  }
  async function remove(id:number){
    setMutating(true);setError("");
    try {setConfig(await invoke<ProxyConfig>("proxy_remove",{id}));setResults(s=>{const n={...s};delete n[id];return n;});}
    catch(e){setError(String(e));}finally{setMutating(false);}
  }
  return <section className="duo-card proxy-page">
    <div className="duo-section-head"><div><h2>Proxy <span>{config.entries.length}</span></h2><p className="duo-muted">{tr("Inventory query proxies","库存查询代理")}</p></div><div className="duo-actions">
      <Button variant="outline" disabled={allBusy||testing.size>0||!config.entries.length} onClick={()=>void testAll()}>{allBusy?tr("Testing…","测试中…"):tr("Test all","全部测试")}</Button>
      <Button disabled={mutating||allBusy} onClick={()=>{setError("");dialog.current?.showModal();}}>{tr("Import proxies","导入 Proxy")}</Button>
      <Button variant="outline" onClick={back}>{tr("Back","返回")}</Button>
    </div></div>
    <p className="proxy-help">{tr("HTTP proxies · IP:PORT:USER:PASSWORD · One proxy per query batch, rotating across cycles. Up to 4 query batches run concurrently. Sessions are reused across cycles (up to 32 retained). Cart actions use the original connection.","HTTP 代理 · IP:PORT:USER:PASSWORD · 每个查询批次依次使用一条代理，跨轮次连续轮询。最多 4 个查询批次并发，跨轮次复用浏览器会话（最多保留 32 个）。加购使用原有连接。")}</p>
    <p className="proxy-help">{tr("Test target: https://www.apple.com/shop. Latency includes proxy connection, TLS and response headers. Tests run 3 at a time. Credentials are encrypted for your Windows account on disk.","测试地址：https://www.apple.com/shop。延迟包含代理连接、TLS 握手及响应头耗时，最多同时测试 3 条。代理凭据在本地由 Windows 账户加密保存。")}</p>
    {error&&<p className="proxy-error" role="alert">{message(error,language)}</p>}
    <div className="duo-table-wrap proxy-table"><table><thead><tr><th>#</th><th>IP</th><th>Port</th><th>{tr("User","用户名")}</th><th>{tr("Password","密码")}</th><th>{tr("Test result","测试结果")}</th><th>{tr("Actions","操作")}</th></tr></thead><tbody>
    {config.entries.map((entry,index)=>{const result=results[entry.id];return <tr key={entry.id}><td>{index+1}</td><td>{entry.ip}</td><td>{entry.port}</td><td className="proxy-secret">{entry.user}</td><td className="proxy-secret">{entry.password}</td><td aria-live="polite">{testing.has(entry.id)?tr("Queued / testing…","排队 / 测试中…"):result?<span className={result.ok?"proxy-ok":"proxy-error"}>{result.latencyMs!==null?`${result.latencyMs} ms · `:""}{message(result.message,language)}</span>:"—"}</td><td><div className="duo-actions"><button className="duo-cart-button" disabled={testing.has(entry.id)||allBusy} onClick={()=>void test(entry)}>{tr("Test","测试")}</button><button className="duo-icon" disabled={testing.size>0||allBusy||mutating} onClick={()=>void remove(entry.id)}>{tr("Remove","删除")}</button></div></td></tr>;})}
    </tbody></table>{!config.entries.length&&<div className="duo-empty"><p>{tr("Import proxies to get started","点击导入 Proxy 开始添加")}</p></div>}</div>
    <dialog ref={dialog} className="proxy-dialog" onCancel={e=>{if(importing)e.preventDefault();}}>
      <h2>{tr("Import proxies","导入 Proxy")}</h2><p className="proxy-help">{tr("One per line. New entries are appended; exact duplicates are skipped. Invalid input is not saved.","每行一条，追加到已有列表，完全重复的条目会跳过。格式有误时不会保存。")}</p>
      <label htmlFor="proxy-input">IP:PORT:USER:PASSWORD</label><textarea id="proxy-input" autoFocus autoComplete="off" spellCheck={false} value={text} onChange={e=>setText(e.target.value)} placeholder={"192.0.2.10:3120:username:password\n192.0.2.11:3120:username:password"}/>
      {error&&<p className="proxy-error" role="alert">{message(error,language)}</p>}
      <div className="duo-actions"><Button variant="outline" disabled={importing} onClick={()=>{setText("");setError("");dialog.current?.close();}}>{tr("Cancel","取消")}</Button><Button disabled={importing||!text.trim()} onClick={()=>void importProxies()}>{importing?tr("Saving…","保存中…"):tr("Confirm","确认")}</Button></div>
    </dialog>
  </section>;
}
