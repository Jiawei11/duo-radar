import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./components/ui/button";
import { saveSettings } from "./lib/store";
import type { Language } from "./lib/i18n";

export function BarkSettings({ language, savedUrl, ready }: { language: Language; savedUrl: string; ready: boolean }) {
  const [url, setUrl] = useState(savedUrl);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"saved" | "sent" | "failed" | null>(null);
  useEffect(() => { setUrl(savedUrl); }, [savedUrl]);
  const tr = (en: string, zh: string) => language === "en" ? en : zh;
  async function act(test: boolean) {
    setBusy(true); setResult(null);
    try {
      if (test) { await invoke("test_bark", { barkUrl: url.trim() }); setResult("sent"); }
      else { setResult(await saveSettings({ barkUrl: url.trim() }) ? "saved" : "failed"); }
    } catch { setResult("failed"); }
    finally { setBusy(false); }
  }
  return <div className="duo-bark-settings">
    <label className="duo-label" htmlFor="bark-url">{tr("Bark phone notifications", "Bark 手机推送")}</label>
    <input id="bark-url" className="duo-bark" type="password" autoComplete="off" spellCheck={false} value={url} disabled={!ready || busy} placeholder="https://api.day.app/your-key" onChange={e => { setUrl(e.target.value); setResult(null); }}/>
    <div className="duo-actions"><Button variant="outline" disabled={!ready || busy} onClick={() => void act(false)}>{tr("Save", "保存")}</Button><Button variant="outline" disabled={!ready || busy || !url.trim()} onClick={() => void act(true)}>{tr("Test push", "测试推送")}</Button></div>
    <p className="duo-footnote">{tr("Save your Bark URL to enable. Clear and save to disable. Stock alerts include model, store and ZIP. Test sends sample data to the entered URL.", "填写 Bark 地址并保存即可启用，清空并保存可关闭。有货推送包含型号、门店和 ZIP；测试会向当前输入的地址发送示例消息。")}</p>
    {result && <p role="status" className={result === "failed" ? "proxy-error" : "duo-footnote"}>{result === "saved" ? tr("Saved.", "已保存。") : result === "sent" ? tr("Bark accepted the test. Check your phone.", "Bark 已接受测试消息，请查看手机。") : tr("Failed. Check the full Bark URL and connection, then retry.", "失败，请检查完整 Bark 地址和网络后重试。")}</p>}
  </div>;
}
