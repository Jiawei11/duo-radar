import { useEffect, useRef, useSyncExternalStore } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { createUpdater } from "./lib/updater";
import { Button } from "./components/ui/button";
import type { Language } from "./lib/i18n";

const updater = createUpdater(() => check({ timeout: 15000 }));
export function UpdateSettings({ language, cartBusy }: { language: Language; cartBusy: boolean }) {
  const state = useSyncExternalStore(updater.subscribe, updater.getSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const tr = (en: string, zh: string) => language === "en" ? en : zh;
  useEffect(() => { updater.start(); }, []);
  const busy = ["checking", "downloading", "installing"].includes(state.phase);
  const status = {
    idle: tr("Check for a new release on GitHub.", "检查 GitHub 上是否有新版。"),
    checking: tr("Checking…", "正在检查…"),
    current: tr("You are up to date.", "当前已是最新版。"),
    available: tr("New version available", "发现新版本"),
    downloading: tr("Downloading and verifying signature…", "正在下载并校验签名…"),
    ready: tr("Download verified. Ready to install.", "下载已校验，可以安装。"),
    installing: tr("Preparing to exit and install…", "正在准备退出并安装…"),
    error: tr("Unable to check or download. Please retry. The installed app is unchanged.", "检查或下载失败，请重试，现有程序未更改。"),
  }[state.phase];
  async function prepare() {
    if (cartBusy) throw new Error(tr("Wait for the cart action to finish.", "请等待当前加购完成。"));
    await invoke("stop_watching");
    if (await invoke<boolean>("is_running")) throw new Error(tr("Monitoring is still stopping. Retry shortly.", "监控尚未暂停，请稍后重试。"));
  }
  return <>
    <Button variant="outline" onClick={() => { dialog.current?.showModal(); if (["idle", "current", "error"].includes(state.phase)) void updater.checkNow(); }}>
      {tr("Updates", "检查更新")}{["available", "ready"].includes(state.phase) ? " ●" : ""}
    </Button>
    <dialog ref={dialog} className="proxy-dialog update-dialog" onCancel={event => { if (state.phase === "installing") event.preventDefault(); }}>
      <h2>{tr("Software updates", "软件更新")}</h2>
      <p role="status" aria-live="polite">{status} {state.version && <strong>v{state.version}</strong>}</p>
      {state.phase === "downloading" && <><progress aria-label={tr("Download progress", "下载进度")} max={state.total || undefined} value={state.total ? state.received : undefined}/><p>{(state.received / 1048576).toFixed(1)} MB{state.total ? ` / ${(state.total / 1048576).toFixed(1)} MB` : ""}</p></>}
      {state.notes && <pre className="update-notes">{state.notes}</pre>}
      {state.error && <p className="proxy-error" role="alert">{state.error}</p>}
      <p className="proxy-help">{tr("Installation pauses monitoring and closes the app. Your tasks and settings are kept. If you use a portable EXE, this installs Duo Radar; launch the installed app from the Start menu afterwards, not the old EXE.", "安装会暂停监控并退出软件，保留任务和设置。如果你使用免安装 EXE，此操作会安装 Duo Radar；之后请从开始菜单打开安装版，不要再运行旧 EXE。")}</p>
      {cartBusy && <p>{tr("Finish the cart action before installing.", "请等待加购完成后再安装。")}</p>}
      <div className="duo-actions">
        <Button variant="outline" disabled={state.phase === "installing"} onClick={() => dialog.current?.close()}>{tr("Close", "关闭")}</Button>
        {state.phase === "ready" && <Button variant="outline" onClick={() => void updater.discard()}>{tr("Discard download", "放弃下载")}</Button>}
        {!["available", "ready", "downloading", "installing"].includes(state.phase) && <Button disabled={busy} onClick={() => void updater.checkNow()}>{tr("Check again", "重新检查")}</Button>}
        {state.phase === "available" && <Button onClick={() => void updater.download()}>{tr("Download update", "下载更新")}</Button>}
        {state.phase === "ready" && <Button disabled={cartBusy} onClick={() => void updater.install(prepare)}>{tr("Exit and install", "退出并安装")}</Button>}
      </div>
    </dialog>
  </>;
}
