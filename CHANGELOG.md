# Changelog / 更新记录

## 1.4.3 · Proxy support and concurrent queries / 代理支持与并发查询

- Run up to four store batches concurrently using independent proxy locks. Reuse up to 32 proxy sessions across cycles, covering the 25-proxy setup without repeated eviction.
  使用独立代理锁，最多四个门店批次并发；跨轮次复用最多 32 个代理会话，25 条代理不再反复淘汰重启。
- Publish each completed batch and stock notification immediately. Reconcile the final snapshot without duplicate notifications or row logs; cancelling monitoring stops remaining queries.
  每批完成立即更新并提醒，整轮结束校准快照，不重复提醒或逐项日志；暂停监控会取消剩余查询。


- Add a Proxy settings page, multiline import, per-row tests and a bounded Test all queue.
  新增 Proxy 设置页、多行导入、单条测试和有限并发的全部测试。
- Rotate inventory query batches across every imported HTTP proxy, continuing between cycles. Keep isolated Chromium sessions resident for reuse.
  库存查询批次跨轮次轮询全部 HTTP 代理，保留隔离的 Chromium 会话供后续复用。
- Store credentials with Windows user-scoped DPAPI encryption; authenticate through a local HTTPS tunnel relay. Cart connections are unchanged.
  凭据使用 Windows 当前用户 DPAPI 加密保存，通过本地 HTTPS 隧道转发认证；加购连接方式不变。

## 1.4.0 · English and Chinese / 中英双语

- Add a persistent English / 中文 switch, defaulting to English for new users.
  新增记住选择的 English / 中文 切换，新用户默认英文。
- Localize controls, store selection, statuses, cart results and common diagnostics without resetting monitors.
  控件、门店选择、状态、加购结果及常用诊断随语言切换，不重置监控。
- Publish English-first bilingual documentation, project metadata and release notes; preserve upstream notices.
  项目文档、简介及发布说明改为英语在前的双语，保留上游声明。

## 1.3.0 · Per-row carts and guest pickup / 按条加购与游客取货准备

- Replace the global stock-triggered cart setting with an Add to cart button on each monitor.
  删除全局自动加购，改为每条监控的“加购”按钮。
- Isolate browser/cart sessions by store and SKU; reuse a prepared session without interrupting manual progress.
  按门店与 SKU 隔离会话，重开已准备条目不打断手动进度。
- Verify SKU/quantity, continue as guest, select pickup and apply the store ZIP; stop at loaded results.
  核对 SKU 和数量，游客结账、选取货并应用门店 ZIP，结果加载后停止。
- Do not choose stores, continue to pickup details, submit orders or pay.
  不选择门店、不进入取货详情、不提交订单或付款。
- Handle post-add pages without Review Bag by verifying the bag once, never repeating Add.
  兼容缺少 Review Bag 的加购后页面，只核验购物袋，不重复加购。

## 1.2.1 · Store city and ZIP / 门店城市与 ZIP

- Show city, state and ZIP beneath each monitored store using the catalog’s location metadata.
  使用目录位置数据，在门店名下显示城市、州和 ZIP。
- Keep Apple pickup selection manual.
  Apple 的取货选择仍由用户操作。

## 1.2.0 · Nationwide queries and bags / 全美查询与购物袋

- Validate representative New York, San Francisco and Los Angeles stores outside Texas.
  验证纽约、旧金山、洛杉矶代表门店的外州查询。
- Add pause-before-clear and remove Bark UI, stored URLs and runtime delivery.
  增加暂停后清空列表，移除 Bark 入口、旧地址及发送。
- Add the iPhone 17 Mist Blue 256GB test configuration and a verified quantity-one bag flow.
  增加 iPhone 17 雾蓝色 256GB 测试配置，核对购物袋数量 1。
- This historical version supported an automatic bag action; v1.3.0 replaced it with manual per-row actions.
  本历史版本曾有自动加购开关，1.3.0 已改为逐条手动触发。

## 1.1.0 · Duo Radar

- Introduce Jiawei’s minimal US Duo edition with two colors, four capacities and 14 Texas store shortcuts.
  推出 Jiawei 的极简美国 Duo 版，两色四容量、14 家德州店快捷选择。
- Remove mainland-China delivery, other category selectors, automatic ordering and social promotion UI.
  删除中国大陆送货、其他品类、自动下单和社交推广入口。
- Add independent branding, app identity, profiles and the Jiawei11/duo-radar project link.
  使用独立品牌、应用标识、资料目录和项目链接。
- Preserve query failures and pending-pickup states; retain GPL and upstream history at 363601e.
  保留查询故障与待取货状态、GPL 和上游 363601e 的历史。

Historical upstream changes: [docs/upstream/CHANGELOG.md](docs/upstream/CHANGELOG.md).
上游历史更新见上述存档。
