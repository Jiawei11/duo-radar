import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Radar, Play, Pause, RefreshCw, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { MultiCombobox } from "./components/MultiCombobox";
import { Button } from "./components/ui/button";
import { connect, watcherStore, setTargets, clearTargets, removeTarget, saveSettings, setIntervalSeconds, startWatching, stopWatching, testNotify, refreshProducts } from "./lib/store";
import { describeMonitorStatus } from "./lib/monitorLog";
import { targetKey, type Target } from "./lib/types";
import "./duo.css";

const PROJECT = "https://github.com/Jiawei11/duo-radar";
const AREAS = [
  { label: "Dallas", stores: ["R144", "R042", "R746", "R151", "R316"] },
  { label: "Austin", stores: ["R216", "R085"] },
  { label: "Houston", stores: ["R058", "R164", "R321", "R437", "R204", "R205", "R126"] },
];
const COLORS = [{ key: "Star White", title: "星光白", dot: "#eeeae3" }, { key: "Night Sky", title: "夜空色", dot: "#3e4658" }];
const CAPACITIES = ["256GB", "512GB", "1TB", "2TB"];

export default function DuoApp() {
  const ui = useSyncExternalStore(watcherStore.subscribe, watcherStore.getSnapshot);
  const [stores, selectStores] = useState<string[]>([]);
  const [parts, selectParts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [cartMessage, setCartMessage] = useState("");
  const [cartBusy, setCartBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { void connect(); }, []);
  const products = useMemo(() => ui.products.filter(p => p.family === "iphoneduo" && COLORS.some(c => c.key === p.color) && CAPACITIES.includes(p.capacity)), [ui.products]);
  const testProduct = ui.products.find(p => p.partNumber === "MG484LL/A");
  const selectableProducts = [...products, ...(testProduct ? [testProduct] : [])];
  const storeOptions = useMemo(() => ui.stores.map(s => ({ value: s.number, label: s.title })), [ui.stores]);
  const count = ui.rows.filter(r => r.availability.kind === "in_stock").length;
  async function add() {
    setBusy(true);
    try {
      const existing = ui.rows.map(r => r.target);
      const keys = new Set(existing.map(targetKey));
      const added: Target[] = [];
      for (const number of stores) for (const part of parts) {
        const store = ui.stores.find(s => s.number === number);
        const product = selectableProducts.find(p => p.partNumber === part);
        if (!store || !product) continue;
        const target = { locale: "en_US", storeNumber: number, storeTitle: store.title, partNumber: part, productName: product.title };
        if (!keys.has(targetKey(target))) added.push(target);
      }
      if (await setTargets([...existing, ...added])) selectParts([]);
    } finally { setBusy(false); }
  }
  async function clearAll() {
    setBusy(true);
    try { if (await clearTargets()) setConfirmClear(false); }
    finally { setBusy(false); }
  }
  async function testCart() {
    setCartBusy(true); setCartMessage("正在 Apple 页面选择配置并加购…");
    try { setCartMessage(await invoke<string>("test_cart", { partNumber: "MG484LL/A" })); }
    catch (error) { setCartMessage(String(error)); }
    finally { setCartBusy(false); }
  }
  return <main className="duo-app">
    <header className="duo-header">
      <div className="duo-brand"><span className="duo-logo"><Radar size={25} /></span><div><h1>Duo Radar <small>by Jiawei</small></h1><p>iPhone Duo · 全美国 Apple Store 取货监控</p></div></div>
      <div className="duo-actions"><button className="duo-icon" title="GitHub · Jiawei11/duo-radar" aria-label="打开你的 GitHub 项目" onClick={() => void openUrl(PROJECT)}><span>GitHub ↗</span></button><span className={ui.running ? "duo-running" : "duo-muted"}>{ui.running ? "● 监控中" : "● 已暂停"}</span><Button disabled={!ui.rows.length || !ui.ready} onClick={() => void (ui.running ? stopWatching() : startWatching())}>{ui.running ? <Pause size={16} /> : <Play size={16} />}{ui.running ? "暂停" : "开始监控"}</Button></div>
    </header>
    <section className="duo-card duo-create">
      <div className="duo-section-head"><h2>选择门店与配置</h2><button className="duo-icon" disabled={ui.refreshing} title="从 Apple 更新目录" onClick={() => void refreshProducts()}><RefreshCw size={17} className={ui.refreshing ? "animate-spin" : ""} /></button></div>
      <div className="duo-picker-grid"><div><label className="duo-label">取货门店 <span>{stores.length ? `已选 ${stores.length} 家` : "可多选"}</span></label><MultiCombobox options={storeOptions} values={stores} onChange={selectStores} placeholder="搜索城市或门店" searchPlaceholder="New York / Los Angeles / Dallas…" emptyText="未找到门店" selectionUnit="家门店" disabled={!ui.ready} /><div className="duo-areas">{AREAS.map(area => <button key={area.label} onClick={() => selectStores(current => [...new Set([...current, ...area.stores.filter(n => ui.stores.some(s => s.number === n))])])}>+ {area.label}</button>)}{stores.length > 0 && <button onClick={() => selectStores([])}>清空</button>}</div></div>
      <div><label className="duo-label">iPhone Duo <span>2 种颜色 · 4 种容量</span></label><div className="duo-variants">{COLORS.map(color => <div className="duo-color-row" key={color.key}><span><i style={{ background: color.dot }} />{color.title}</span>{CAPACITIES.map(capacity => {
        const product = products.find(p => p.color === color.key && p.capacity === capacity);
        const selected = !!product && parts.includes(product.partNumber);
        return <button key={capacity} disabled={!product} aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => product && selectParts(current => selected ? current.filter(p => p !== product.partNumber) : [...current, product.partNumber])}>{capacity}</button>;
      })}</div>)}</div><div className="duo-test-product"><label className="duo-label">iPhone 17 <span>加购测试配置</span></label><button className={testProduct && parts.includes(testProduct.partNumber) ? "selected" : ""} disabled={!testProduct} aria-pressed={!!testProduct && parts.includes(testProduct.partNumber)} onClick={() => testProduct && selectParts(current => current.includes(testProduct.partNumber) ? current.filter(p => p !== testProduct.partNumber) : [...current, testProduct.partNumber])}>雾蓝色 · 256GB</button><button disabled={cartBusy || !testProduct} onClick={() => void testCart()}>{cartBusy ? "正在加购…" : "测试加购并打开购物袋 ↗"}</button>{cartMessage && <p role="status">{cartMessage}</p>}</div></div></div>
      <div className="duo-add-row"><p>{stores.length && parts.length ? `${stores.length} 家门店 × ${parts.length} 个配置` : "选好门店和配置，添加后开始监控。"}</p><Button onClick={() => void add()} disabled={!stores.length || !parts.length || busy}>{busy ? "添加中…" : "添加监控"}</Button></div>
    </section>
    <div className="duo-main-grid"><section className="duo-card duo-list"><div className="duo-section-head"><h2>监控列表 <span>{ui.rows.length}</span></h2><div className="duo-actions"><span className="duo-muted">{count} 项有货</span>{!!ui.rows.length && (confirmClear ? <><button disabled={busy} onClick={() => void clearAll()}>确认清空 {ui.rows.length} 项</button><button onClick={() => setConfirmClear(false)}>取消</button></> : <button disabled={busy} onClick={() => setConfirmClear(true)}>清空列表</button>)}</div></div><div className="duo-table-wrap"><table><thead><tr><th>状态</th><th>门店</th><th>配置</th><th>取货时间</th><th>检查时间</th><th></th></tr></thead><tbody>{ui.rows.map(row => { const status = describeMonitorStatus(row); const store = ui.stores.find(s => s.number === row.target.storeNumber); return <tr key={targetKey(row.target)}><td><span className={`duo-status ${row.availability.kind}`} title={status.detail ?? ""}>{status.label}</span></td><td>{row.target.storeTitle}{store && (store.city || store.postalCode) && <div className="duo-store-location">{store.city && <span>城市：{store.city}{store.state ? `, ${store.state}` : ""}</span>}{store.postalCode && <span>ZIP：{store.postalCode}</span>}</div>}</td><td>{row.target.productName.replace(/^iPhone Duo\s*/, "")}</td><td>{row.pickupDetails?.pickupQuote?.replace(/<[^>]*>/g, " ") ?? "—"}</td><td className="duo-muted">{row.lastCheckedMs ? new Date(row.lastCheckedMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</td><td><button className="duo-icon" aria-label={`移除 ${row.target.storeTitle} ${row.target.productName}`} onClick={() => void removeTarget(row.target)}><Trash2 size={15} /></button></td></tr>; })}</tbody></table>{!ui.rows.length && <div className="duo-empty"><Radar size={30} /><p>等待你的第一条监控</p><small>库存查询失败会显示原因，不会被当成无货。</small></div>}</div></section>
    <aside className="duo-card duo-settings"><h2>提醒设置</h2><label className="duo-setting">查询间隔 <span><input type="number" min={5} defaultValue={ui.settings.intervalSeconds} key={String(ui.ready)} onBlur={e => void setIntervalSeconds(Math.max(5, Number(e.target.value) || 30))} /> 秒</span></label><label className="duo-setting">声音提醒<input type="checkbox" checked={ui.settings.soundEnabled} onChange={e => void saveSettings({ soundEnabled: e.target.checked })} /></label><label className="duo-setting">到货后暂停<input type="checkbox" checked={ui.settings.stopOnHit} onChange={e => void saveSettings({ stopOnHit: e.target.checked })} /></label><label className="duo-setting">到货后加购并打开购物袋<input type="checkbox" checked={ui.settings.openOnHit !== "none"} onChange={e => void saveSettings({ openOnHit: e.target.checked ? "bag" : "none" })} /></label><Button variant="outline" className="w-full" onClick={() => void testNotify()}>测试提示音</Button><p className="duo-footnote">加购数量 1，同款已在袋中时复用。使用独立浏览器；取货门店请在 Apple 页面确认。</p></aside></div>
    <details className="duo-card duo-log"><summary>活动日志 <span>{ui.logs.length} 条</span></summary><pre>{ui.logs.slice(-60).join("\n") || "等待监控活动…"}</pre></details>
    <footer className="duo-footer">Duo Radar · Jiawei <span>开源致谢：果到雷达 / ENCHIGO / hteen · Codex（OpenAI）</span></footer>
  </main>;
}

