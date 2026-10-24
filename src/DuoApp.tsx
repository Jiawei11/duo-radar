import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Radar, Play, Pause, RefreshCw, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { MultiCombobox } from "./components/MultiCombobox";
import { Button } from "./components/ui/button";
import { connect, watcherStore, setTargets, clearTargets, removeTarget, saveSettings, setIntervalSeconds, startWatching, stopWatching, testNotify, refreshProducts } from "./lib/store";
import { describeMonitorStatus } from "./lib/monitorLog";
import { targetKey, type Target } from "./lib/types";
import { text, runtimeText, initialLanguage, LANGUAGE_KEY, type Language, type TextKey } from "./lib/i18n";
import "./duo.css";
import { ProxySettings, useProxySettings } from "./ProxySettings";

import { BarkSettings } from "./BarkSettings";
import { UpdateSettings } from "./UpdateSettings";

const PROJECT = "https://github.com/Jiawei11/duo-radar";
const AREAS = [
  { label: "Dallas", stores: ["R144", "R042", "R746", "R151", "R316"] },
  { label: "Austin", stores: ["R216", "R085"] },
  { label: "Houston", stores: ["R058", "R164", "R321", "R437", "R204", "R205", "R126"] },
];
const COLORS = [{ key: "Star White", title: "星光白", dot: "#eeeae3" }, { key: "Night Sky", title: "夜空色", dot: "#3e4658" }];
const CAPACITIES = ["256GB", "512GB", "1TB", "2TB"];

export default function DuoApp() {
  const [language, setLanguage] = useState<Language>(() => { try { return initialLanguage(localStorage.getItem(LANGUAGE_KEY)); } catch { return "en"; } });
  const t = (key: TextKey) => text(language,key);
  const local = (raw: string) => runtimeText(raw,language);
  useEffect(() => { document.documentElement.lang=language === "en" ? "en" : "zh-CN"; try { localStorage.setItem(LANGUAGE_KEY,language); } catch { /* Keep the active language when browser storage is unavailable. */ } },[language]);
  const proxy = useProxySettings();
  const [proxyPage, setProxyPage] = useState(false);
  const ui = useSyncExternalStore(watcherStore.subscribe, watcherStore.getSnapshot);
  const [stores, selectStores] = useState<string[]>([]);
  const [parts, selectParts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [cartMessages, setCartMessages] = useState<Record<string,string>>({});
  const [cartBusy, setCartBusy] = useState<string | null>(null);
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
  async function addToCart(target: Target) {
    const key=targetKey(target);
    if (cartBusy) return;
    setCartBusy(key); setCartMessages(current=>({...current,[key]:"正在加购并准备取货搜索…"}));
    try { const message=await invoke<string>("add_target_to_cart",{target}); setCartMessages(current=>({...current,[key]:message})); }
    catch(error) { setCartMessages(current=>({...current,[key]:String(error)})); }
    finally { setCartBusy(null); }
  }
  return <main className="duo-app">
    <header className="duo-header">
      <div className="duo-brand"><span className="duo-logo"><Radar size={25} /></span><div><h1>Duo Radar <small>by Jiawei</small></h1><p>{t("subtitle")}</p></div></div>
      <div className="duo-actions"><UpdateSettings language={language} cartBusy={!!cartBusy}/><Button variant="outline" onClick={()=>setProxyPage(!proxyPage)}>Proxy</Button><select className="duo-language" aria-label={t("language")} value={language} onChange={e=>setLanguage(e.target.value as Language)}><option value="en">English</option><option value="zh">中文</option></select><button className="duo-icon" title="GitHub · Jiawei11/duo-radar" aria-label={t("github")} onClick={() => void openUrl(PROJECT)}><span>GitHub ↗</span></button><span className={ui.running ? "duo-running" : "duo-muted"}>{`● ${ui.running ? t("running") : t("paused")}`}</span><Button disabled={!ui.rows.length || !ui.ready} onClick={() => void (ui.running ? stopWatching() : startWatching())}>{ui.running ? <Pause size={16} /> : <Play size={16} />}{ui.running ? t("pause") : t("start")}</Button></div>
    </header>
    <div hidden={!proxyPage}><ProxySettings language={language} model={proxy} back={()=>setProxyPage(false)}/></div><div hidden={proxyPage}>
    <section className="duo-card duo-create">
      <div className="duo-section-head"><h2>{t("choose")}</h2><button className="duo-icon" disabled={ui.refreshing} title={t("refresh")} onClick={() => void refreshProducts()}><RefreshCw size={17} className={ui.refreshing ? "animate-spin" : ""} /></button></div>
      <div className="duo-picker-grid"><div><label className="duo-label">{t("stores")} <span>{stores.length ? `${t("selected")} ${stores.length}` : t("multi")}</span></label><MultiCombobox language={language} options={storeOptions} values={stores} onChange={selectStores} placeholder={t("search")} searchPlaceholder="New York / Los Angeles / Dallas…" emptyText={t("noStores")} selectionUnit={t("storeUnit")} disabled={!ui.ready} /><div className="duo-areas">{AREAS.map(area => <button key={area.label} onClick={() => selectStores(current => [...new Set([...current, ...area.stores.filter(n => ui.stores.some(s => s.number === n))])])}>+ {area.label}</button>)}{stores.length > 0 && <button onClick={() => selectStores([])}>{t("clear")}</button>}</div></div>
      <div><label className="duo-label">iPhone Duo <span>{t("variants")}</span></label><div className="duo-variants">{COLORS.map(color => <div className="duo-color-row" key={color.key}><span><i style={{ background: color.dot }} />{t(color.key === "Star White" ? "white" : "night")}</span>{CAPACITIES.map(capacity => {
        const product = products.find(p => p.color === color.key && p.capacity === capacity);
        const selected = !!product && parts.includes(product.partNumber);
        return <button key={capacity} disabled={!product} aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => product && selectParts(current => selected ? current.filter(p => p !== product.partNumber) : [...current, product.partNumber])}>{capacity}</button>;
      })}</div>)}</div><div className="duo-test-product"><label className="duo-label">iPhone 17 <span>{t("test")}</span></label><button className={testProduct && parts.includes(testProduct.partNumber) ? "selected" : ""} disabled={!testProduct} aria-pressed={!!testProduct && parts.includes(testProduct.partNumber)} onClick={() => testProduct && selectParts(current => current.includes(testProduct.partNumber) ? current.filter(p => p !== testProduct.partNumber) : [...current, testProduct.partNumber])}>{t("blue")}</button><p className="duo-muted">{t("testHint")}</p></div></div></div>
      <div className="duo-add-row"><p>{stores.length && parts.length ? `${stores.length} ${t("storeUnit")} × ${parts.length} ${t("configs")}` : t("chooseHint")}</p><Button onClick={() => void add()} disabled={!stores.length || !parts.length || busy}>{busy ? t("adding") : t("addMonitor")}</Button></div>
    </section>
    <div className="duo-main-grid"><section className="duo-card duo-list"><div className="duo-section-head"><h2>{t("monitors")} <span>{ui.rows.length}</span></h2><div className="duo-actions"><span className="duo-muted">{count} {t("inStock")}</span>{!!ui.rows.length && (confirmClear ? <><button disabled={busy} onClick={() => void clearAll()}>{t("confirmClear")} {ui.rows.length}</button><button onClick={() => setConfirmClear(false)}>{t("cancel")}</button></> : <button disabled={busy} onClick={() => setConfirmClear(true)}>{t("clearList")}</button>)}</div></div><div className="duo-table-wrap"><table><thead><tr><th>{t("status")}</th><th>{t("store")}</th><th>{t("configuration")}</th><th>{t("pickup")}</th><th>{t("checked")}</th><th>{t("actions")}</th></tr></thead><tbody>{ui.rows.map(row => { const status = describeMonitorStatus(row); const store = ui.stores.find(s => s.number === row.target.storeNumber); return <tr key={targetKey(row.target)}><td><span className={`duo-status ${row.availability.kind}`} title={local(status.detail ?? "")}>{local(status.label)}</span></td><td>{row.target.storeTitle}{store && (store.city || store.postalCode) && <div className="duo-store-location">{store.city && <span>{t("city")} {store.city}{store.state ? `, ${store.state}` : ""}</span>}{store.postalCode && <span>{t("zip")} {store.postalCode}</span>}</div>}</td><td>{row.target.productName.replace(/^iPhone Duo\s*/, "")}</td><td>{row.pickupDetails?.pickupQuote?.replace(/<[^>]*>/g, " ") ?? "—"}</td><td className="duo-muted">{row.lastCheckedMs ? new Date(row.lastCheckedMs).toLocaleTimeString(language === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</td><td><button className="duo-cart-button" disabled={!!cartBusy} onClick={() => void addToCart(row.target)}>{cartBusy === targetKey(row.target) ? t("working") : t("cart")}</button>{cartMessages[targetKey(row.target)] && <p className="duo-cart-result" role="status">{local(cartMessages[targetKey(row.target)]!)}</p>}<button className="duo-icon" aria-label={`${t("remove")} ${row.target.storeTitle} ${row.target.productName}`} onClick={() => void removeTarget(row.target)}><Trash2 size={15} /></button></td></tr>; })}</tbody></table>{!ui.rows.length && <div className="duo-empty"><Radar size={30} /><p>{t("empty")}</p><small>{t("failureHint")}</small></div>}</div></section>
    <aside className="duo-card duo-settings"><h2>{t("settings")}</h2><label className="duo-setting">Proxy <span>{proxy.config.entries.length}</span><input type="checkbox" checked={proxy.config.enabled} disabled={!proxy.ready||proxy.saving} onChange={e=>void proxy.enable(e.target.checked)}/></label>{proxy.error&&<p className="proxy-error" role="alert">{proxy.error}</p>}<label className="duo-setting">{t("interval")} <span><input type="number" min={5} defaultValue={ui.settings.intervalSeconds} key={String(ui.ready)} onBlur={e => void setIntervalSeconds(Math.max(5, Number(e.target.value) || 30))} /> {t("seconds")}</span></label><label className="duo-setting">{t("sound")}<input type="checkbox" checked={ui.settings.soundEnabled} onChange={e => void saveSettings({ soundEnabled: e.target.checked })} /></label><label className="duo-setting">{t("stop")}<input type="checkbox" checked={ui.settings.stopOnHit} onChange={e => void saveSettings({ stopOnHit: e.target.checked })} /></label><Button variant="outline" className="w-full" onClick={() => void testNotify()}>{t("testSound")}</Button><BarkSettings language={language} savedUrl={ui.settings.barkUrl} ready={ui.ready}/><p className="duo-footnote">{t("cartHint")}</p></aside></div>
    <details className="duo-card duo-log"><summary>{t("logs")} <span>{ui.logs.length} {t("entries")}</span></summary><pre>{ui.logs.slice(-60).map(local).join("\n") || t("waiting")}</pre></details>
    </div>
    <footer className="duo-footer">Duo Radar 1.4.4 · Jiawei <span>{t("credits")}</span></footer>
  </main>;
}

