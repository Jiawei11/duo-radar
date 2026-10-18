export type Language = "en" | "zh";
export const LANGUAGE_KEY = "duo-radar-language";
export function initialLanguage(value: string | null): Language { return value === "zh" ? "zh" : "en"; }
export const copy = {
  subtitle:["iPhone Duo · US Apple Store pickup monitor","iPhone Duo · 全美国 Apple Store 取货监控"],
  language:["Language","语言"], github:["Open the GitHub project","打开 GitHub 项目"],
  running:["Monitoring","监控中"], paused:["Paused","已暂停"], pause:["Pause","暂停"], start:["Start monitoring","开始监控"],
  choose:["Choose stores and configurations","选择门店与配置"], refresh:["Refresh the Apple catalog","从 Apple 更新目录"],
  stores:["Pickup stores","取货门店"], selected:["Selected:","已选："], multi:["Select multiple","可多选"],
  search:["Search a city or store","搜索城市或门店"], noStores:["No stores found","未找到门店"], storeUnit:["stores","家门店"],
  clear:["Clear","清空"], variants:["2 colors · 4 capacities","2 种颜色 · 4 种容量"],
  white:["Star White","星光白"], night:["Night Sky","夜空色"], test:["Test configuration","加购测试配置"], blue:["Mist Blue · 256GB","雾蓝色 · 256GB"],
  testHint:["Add this configuration to the list, then use its Add to cart button.","添加到监控列表后，点击该行“加购”测试完整流程。"],
  configs:["configurations","个配置"], chooseHint:["Select stores and configurations, then add them to begin.","选好门店和配置，添加后开始监控。"],
  adding:["Adding…","添加中…"], addMonitor:["Add monitors","添加监控"], monitors:["Monitor list","监控列表"], inStock:["in stock","项有货"],
  confirmClear:["Confirm clear:","确认清空："], cancel:["Cancel","取消"], clearList:["Clear list","清空列表"],
  status:["Status","状态"], store:["Store","门店"], configuration:["Configuration","配置"], pickup:["Pickup estimate","取货时间"],
  checked:["Last checked","检查时间"], actions:["Actions","操作"], city:["City:","城市："], zip:["ZIP:","ZIP："],
  working:["Working…","处理中…"], cart:["Add to cart","加购"], remove:["Remove","移除"],
  empty:["Add your first monitor","等待你的第一条监控"], failureHint:["Query failures include a reason and are never reported as out of stock.","库存查询失败会显示原因，不会被当成无货。"],
  settings:["Alert settings","提醒设置"], interval:["Query interval","查询间隔"], seconds:["s","秒"], sound:["Sound alerts","声音提醒"],
  stop:["Pause when in stock","到货后暂停"], testSound:["Test sound","测试提示音"],
  cartHint:["Stock triggers sound only. Use a row’s Add to cart button to prepare guest pickup ZIP results; choose the store and finish manually.","有货时声音提醒。点击对应行“加购”，准备到游客取货 ZIP 搜索结果；门店选择及后续由你完成。"],
  logs:["Activity log","活动日志"], entries:["entries","条"], waiting:["Waiting for monitor activity…","等待监控活动…"],
  credits:["Credits: Guodao Radar / ENCHIGO / hteen · Codex (OpenAI)","开源致谢：果到雷达 / ENCHIGO / hteen · Codex（OpenAI）"],
  preparing:["Adding the item and preparing pickup search…","正在加购并准备取货搜索…"],
} as const;
export type TextKey = keyof typeof copy;
export function text(language: Language, key: TextKey): string { return copy[key][language === "en" ? 0 : 1]; }

const phrases: Record<string,string> = {
  "正在加购并准备取货搜索…":"Adding the item and preparing pickup search…",
  "仅支持美国门店":"Only US stores are supported", "未找到对应门店":"The selected store was not found",
  "不支持此型号":"This configuration is not supported", "无法确认商品颜色":"Could not verify the product color",
  "请先开启声音提醒":"Enable sound alerts first",
  "该门店缺少有效美国 ZIP，无法自动搜索取货地点。":"This store has no valid US ZIP; pickup search cannot be prepared.",
  "已有加购操作进行中，请稍后查看浏览器。":"An add-to-cart operation is already running; check the browser shortly.",
  "购物袋需要手动检查":"Please check the shopping bag manually",
  "购物袋同款数量不是 1，请手动检查。":"The matching item’s bag quantity is not 1; please check it manually.",
  "专用购物袋已有其他商品，请先手动整理后重试。":"The dedicated bag contains another item. Review it manually before retrying.",
  "Apple 页面型号与该监控不符，请手动检查。":"The Apple product page does not match this monitor; please check it manually.",
  "Apple 未在购物袋中确认该商品，请手动检查。":"Apple did not confirm this item in the bag; please check it manually.",
  "等待 Apple 页面超时。浏览器已保留，请检查商品选项或访问验证后重试；未确认加购成功。":"Timed out waiting for Apple. The browser remains open; check the options or access verification before retrying. The item was not confirmed in the bag.",
  "已打开 Apple 页面，但未能确认取货 ZIP 搜索完成，请在浏览器手动继续。":"Apple is open, but completed pickup ZIP results could not be confirmed. Please continue manually.",
  "有货":"In stock", "无货":"Out of stock", "待查询":"Not checked yet", "未知":"Unknown",
  "待开放取货":"Pickup not yet open", "暂无取货数据":"No pickup data", "暂停取货":"Pickup unavailable",
  "未返回型号":"SKU missing", "请求被拦截":"Request blocked", "请求被限流":"Rate limited", "保护冷却中":"Cooling down",
  "查询失败":"Query failed", "响应解析失败":"Response format changed", "Apple 返回错误":"Apple returned an error",
  "浏览器未连接":"Browser disconnected", "即将发售":"Coming soon", "暂未开售":"Not released yet", "暂不可购买":"Not available for purchase",
  "不支持取货":"Pickup not supported", "尚未轮到这一项":"Waiting for this item’s first query",
  "Apple 尚未公布明确的门店取货状态":"Apple has not published a confirmed pickup status",
  "已开始监控。":"Monitoring started.", "已暂停监控。":"Monitoring paused.",
  "已执行提示音测试（不代表有货）。":"Sound test completed (not a stock notification).",
  "浏览器启动故障已解除。":"Browser startup recovered.", "查询已恢复正常。":"Inventory queries recovered.",
  "首次使用时会先建立 Apple 查询会话，通常需要几秒。":"The first query establishes an Apple session and may take a few seconds.",
  "监控到有货，已按设置暂停监控。":"Stock found; monitoring paused as configured.",
  "当前保护冷却中，可选择立即重试":"Cooling down; you may retry manually",
  "当前没有向 Apple 发出请求":"No request is being sent to Apple",
  "库存尚未更新；运行中会按设置间隔重新连接。":"Stock has not updated; the browser will reconnect at the configured interval.",
  "当前库存尚未更新；运行中会按设置的间隔再次尝试连接。":"Stock has not updated; reconnecting at the configured interval while monitoring.",
  "请求过于频繁被限流，正在退避":"Rate limited; waiting before retrying",
  "Apple 本次门店响应未包含该 SKU；暂无库存结论，不能视为无货。":"Apple omitted this SKU; stock is unknown, not out of stock.",
  "Apple 暂未返回该门店的取货数据；型号可能已下架、尚未开放取货或暂时不可查询，请刷新型号目录并核对官网。":"Apple returned no pickup data. Refresh the catalog and check the Apple website.",
  "Apple 当前未将该门店接入在线取货；门店可能临时关闭或暂停取货，不能据此判断库存。":"This store is not offering online pickup; this does not establish its stock level.",
  "程序将在下一轮按设置的间隔自动重试":"Retrying at the configured interval in the next cycle",
  "程序将在下一轮自动重试":"Retrying in the next cycle", "本轮不更新该门店":"This store is not updated this cycle",
  "浏览器安全限制阻止了本次 Apple 页面访问":"Browser security restrictions blocked this Apple page request",
  "监控当前未运行，无法立即重试。":"Monitoring is paused; start it before retrying.",
  "已按你的选择立即重新查询。":"An immediate query was requested.",
  "启动命令已返回，但监控引擎没有进入运行状态。":"The start request completed, but monitoring did not start.",
  "暂停命令已返回，但监控引擎仍在运行。":"The pause request completed, but monitoring is still running.",
  "监控仍在运行，请重试暂停":"Monitoring is still running; retry Pause",
  "无监控项":"No monitors", "浏览器会话未能完成本次 Apple 查询":"The browser could not complete this Apple query",
  "等待 Apple 页面响应超时":"Timed out waiting for Apple", "暂时无法连接 Apple":"Cannot connect to Apple right now",
  "返回了不可读的诊断信息":"An unreadable diagnostic was returned",
};

/** Translate app-owned diagnostics at render time, so existing logs also switch languages.
 * External Apple/OS diagnostic payloads remain verbatim when no translation is known. */
export function runtimeText(raw: string, language: Language): string {
  if (language === "zh") return raw;
  let result=raw;
  for(const [zh,en] of Object.entries(phrases).sort((a,b)=>b[0].length-a[0].length)) result=result.split(zh).join(en);
  return result
    .replace(/已重新打开该条取货页面（ZIP (\d+)），后续请手动操作。/g,"Reopened this monitor’s pickup browser (ZIP $1). Please continue manually.")
    .replace(/已选择取货并应用 ZIP (\d+)，请自行选择门店并继续。/g,"Pickup selected and ZIP $1 applied. Choose the store and continue manually.")
    .replace(/加购页面状态无法确认，请检查已打开的浏览器：/g,"Could not confirm the cart page state; check the open browser: ")
    .replace(/取货页面状态无法确认，请手动继续：/g,"Could not confirm the pickup page state; continue manually: ")
    .replace(/第 (\d+) 轮开始查询：(\d+) 家门店、(\d+) 项监控。/g,"Cycle $1 started: $2 stores, $3 monitors. ")
    .replace(/第 (\d+) 轮完成/g,"Cycle $1 completed")
    .replace(/第 (\d+) 轮/g,"Cycle $1")
    .replace(/查询浏览器未连接，影响 (\d+) 项监控/g,"Query browser disconnected; $1 monitors affected")
    .replace(/查询Browser disconnected，影响 (\d+) 项监控/g,"Query browser disconnected; $1 monitors affected")
    .replace(/已从 Apple 官网更新目录：/g,"Catalog refreshed from Apple: ")
    .replace(/门店未更新/g,"stores not refreshed").replace(/门店 (\d+) 家/g,"$1 stores").replace(/型号 (\d+) 个/g,"$1 configurations")
    .replace(/约 (\d+) 秒后查询/g,"Next query in about $1 s")
    .replace(/约 (\d+) 秒后自动探测/g,"Probing again in about $1 s")
    .replace(/实际请求 (\d+) 次/g,"$1 requests")
    .replace(/批量响应覆盖 (\d+) 家门店/g,"batch response covers $1 stores")
    .replace(/(\d+) 项/g,"$1 items").replace(/(\d+) 毫秒/g,"$1 ms").replace(/([\d.]+) 秒/g,"$1 s")
    .replace(/载入 (\w+) 的门店与型号失败：/g,"Could not load stores and products for $1: ")
    .replace(/更新门店与型号失败（继续使用已有目录）：/g,"Catalog refresh failed (using the previous catalog): ")
    .replace(/保存设置失败：/g,"Could not save settings: ").replace(/更新监控列表失败：/g,"Could not update monitor list: ")
    .replace(/清空列表失败：/g,"Could not clear monitors: ").replace(/启动监控失败：/g,"Could not start monitoring: ")
    .replace(/暂停监控失败：/g,"Could not pause monitoring: ").replace(/设置查询间隔失败：/g,"Could not set query interval: ")
    .replace(/测试提醒失败：/g,"Sound test failed: ").replace(/告警：/g,"Warning: ").replace(/声音提醒失败：/g,"Sound alert failed: ")
    .replace(/请求被 Apple 拦截：/g,"Request blocked by Apple: ").replace(/网络请求失败：/g,"Network request failed: ")
    .replace(/接口返回结构与预期不符：/g,"Unexpected API response format: ")
    .replace(/取货=/g,"Pickup=").replace(/购买=/g,"Purchase=").replace(/送货：/g,"Delivery: ").replace(/线路：/g,"Route: ")
    .replace(/[；]/g,"; ").replace(/[：]/g,": ").replace(/[。]/g,". ").replace(/、/g,", ").replace(/（/g,"(").replace(/）/g,")").replace(/，/g,", ");
}
