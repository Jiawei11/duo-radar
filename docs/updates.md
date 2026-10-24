# Updates / 软件更新

The public app checks once at startup and on demand using **Updates**. It reads
`https://github.com/Jiawei11/duo-radar/releases/latest/download/latest.json`.
Checking never stops monitoring or installs a release. Downloading verifies the
package signature before enabling **Exit and install**. Installation pauses monitoring;
the Windows NSIS updater closes the application and runs the installer. Tasks and
settings remain in the existing user configuration directory.

公共版启动时检查一次，也可以点击“检查更新”。检查不会中断监控或自动安装。
下载完成并通过签名校验后才能点击“退出并安装”。安装前暂停监控，保留原有用户配置。

Portable EXE users migrate to the installed app using this updater. Afterwards,
launch Duo Radar from the Start menu rather than an old portable copy.
An already-published 1.4.3 executable does not contain this feature: users must
manually install the first release that includes it.

免安装版使用此功能后转为安装版，请从开始菜单启动，不要再打开旧 EXE。
已发布的 1.4.3 没有此功能，首次需手动升级到包含更新功能的版本。

## Preparing a release / 准备发布

1. Bump the app version consistently and run the tests.
2. Set `TAURI_SIGNING_PRIVATE_KEY_PATH` to the signing key kept **outside** this repo.
   Set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has a password.
3. Run `node scripts/build-update.mjs`. It builds a signed NSIS installer and writes
   `deliverables/update-VERSION/` containing the installer, `.sig`, and `latest.json`.
   Edit the bilingual `notes` in the manifest for that release.
4. Upload those three files to the matching GitHub release **before** marking it latest.
   Verify the manifest URL and download signature. Source, LICENSE, NOTICE, and
   checksums should continue to accompany releases.

统一升级版本号并测试后，在环境变量指定仓库外的签名私钥，运行上述脚本。
脚本只在本地构建，不上传、不发布。发布时须同时上传安装包、签名和 `latest.json`，
确认完成后再设为最新版。继续提供源码、许可证、来源声明和校验值。

Back up the private signing key securely; losing it breaks updates for existing
clients. Never commit it or place it in a release/source archive. Only the public
key belongs in `tauri.conf.json`. Release builds require HTTPS; localhost HTTP is
used solely by automated tests, whose mock configuration is never bundled.

请安全备份签名私钥，不要提交或打包到源码和 Release。配置中只保存公钥。
正式程序只使用 HTTPS，本地 HTTP 测试配置不会进入发布包。

Before the first updater-enabled release is published, GitHub has no `latest.json`;
the check will report a fetch error. This is expected during local development.

首次发布更新清单前，GitHub 尚无 `latest.json`，本地检查会显示获取失败。

## Verification / 验证

- `pnpm test`: state transitions, duplicate prevention, failure/retry, explicit installation.
- `cargo test -p apple-store-inventory-monitor --test updater`: real updater requests
  against a loopback server, version comparison, signed download, corrupt package rejection.
- Set `DUO_TEST_UPDATE_PACKAGE` to a signed NSIS installer and run
  `cargo test -p apple-store-inventory-monitor --test updater actual_windows_package_signature -- --ignored`
  to verify the real build download and signature without replacing the installed app.

以上分别验证前端交互、真实更新组件的本地请求与签名检查，以及实际 NSIS 包。
最后一项只校验下载，不安装或替换用户正在使用的软件。
