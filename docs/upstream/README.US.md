# 果到雷达 US — Windows 美国门店取货监控

基于 suversal/apple-store-inventory-monitor 提交 `363601e` 的本地修改版，遵循 GPL-3.0-or-later。原始作者、来源与许可见 NOTICE、LICENSE。不是 Apple 官方软件。

## 使用

1. 运行 Windows x64 安装包，或直接运行便携 exe。电脑需要 Chrome 或 Edge。
2. 地区默认是 United States 美国。点击 Dallas 周边、Austin、Houston 周边快捷按钮选择门店，或搜索城市/英文店名。选择 iPhone、颜色和容量后添加监控。
3. 选择声音或 Bark 手机推送，测试提醒后开始监控。默认每轮结束 30 秒后再查询。
4. “未知 / 请求被拦截 / 查询失败”不等于无货。库存只有 Apple 明确返回可取货才提醒，最终以 Apple 官网结账为准。

美国版只监控与提醒；自动结账仍仅支持原项目的中国大陆流程。美国送货日期未适配，不应使用中国大陆送货地址设置判断美国配送。

## 德州门店

| 地区 | 门店与编号 |
| --- | --- |
| Dallas | NorthPark Center R144、Knox Street R042、Galleria Dallas R746 |
| Dallas–Fort Worth 周边 | Southlake Town Square R151、University Park Village R316 |
| Austin | Domain NORTHSIDE R216、Barton Creek R085 |
| Houston | Houston Galleria R058、Memorial City R164、Willowbrook Mall R321、Highland Village R437 |
| Houston 周边 | Baybrook R204、First Colony Mall R205、The Woodlands R126 |

内置完整美国门店列表，地点查询优先使用门店 ZIP 邮编。商品快照来自美国 Apple 购买页，含四个 iPhone 系列及 iPad、Mac mini、Apple Watch 的基础目录；可点刷新获取当前所选品类目录。

## 数据与更新

设置与应用专属浏览器资料位于 `%APPDATA%\apple-store-inventory-monitor-us\`，与原版独立。美国版不导入原版设置，不从原版 Release 自动更新。不会读取日常 Chrome/Edge 的用户资料。

## 开发与构建

依赖：Node.js、pnpm、Rust MSVC、Visual Studio C++ Build Tools、Windows SDK。

```powershell
pnpm install
pnpm tauri dev
```

```powershell
cargo test --workspace --lib --tests
pnpm test
pnpm build
pnpm tauri build --bundles nsis
```

真实浏览器回归（访问 Apple，仅查库存，不购买）：

```powershell
cargo test -p apple-store-inventory-monitor live_us_texas_three_cities_two_rounds -- --ignored --nocapture
```

查询证据见 `research/texas-live-results.json`；三个 `pickup-*.json` 文件记录同一次测试的 Apple 原始公开响应。它们是测试时快照，不代表当前库存。无效 SKU 不会被当成无货。

本机验证结果：Windows 11 x64，Chrome 155.0.8059.80；三城各选一家店，使用实际桌面查询引擎和同一个专属浏览器会话连续查询两轮，6 次均返回明确结果。测试商品为 iPhone 17 256GB Mist Blue（MG484LL/A），当时均为可取货、Apple 文案 Tomorrow。其他型号和门店的即时库存仍以每次查询结果为准。前端 52 项测试通过，Rust 离线测试通过。

## 本次修改

- 添加 en_US、美国商品与门店快照；美国地区默认选中。
- 美国门店显示真实城市，查询优先使用 ZIP 邮编。
- 美国门店在线刷新使用美国站；修正美国教育购物袋地址。
- 使用独立应用标识、配置目录和浏览器目录；禁用上游自动更新。
- 增加真实德州响应解析测试、门店完整性测试和三城两轮浏览器回归测试。

首次构建产物在 `target/release/` 与 `target/release/bundle/nsis/`。
