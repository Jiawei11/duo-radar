// Build signed Windows assets and latest.json locally. This script never publishes.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = config.version;
const key = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH;
if (!key || !existsSync(key)) throw new Error("Set TAURI_SIGNING_PRIVATE_KEY_PATH to your private signing key outside the repository.");
const result = spawnSync(process.execPath, [resolve(root, "node_modules/@tauri-apps/cli/tauri.js"), "build", "--bundles", "nsis"], {
  cwd: root, stdio: "inherit", env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: readFileSync(key, "utf8").trim(), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "" },
});
if (result.status !== 0) process.exit(result.status ?? 1);
const installer = resolve(root, `target/release/bundle/nsis/Duo Radar_${version}_x64-setup.exe`);
const destination = resolve(root, `deliverables/update-${version}`);
mkdirSync(destination, { recursive: true });
const name = `DuoRadar-${version}-setup.exe`;
copyFileSync(installer, resolve(destination, name));
copyFileSync(`${installer}.sig`, resolve(destination, `${name}.sig`));
const manifest = {
  version,
  notes: `Duo Radar ${version}. See GitHub Releases for changes. / 更新内容请查看 GitHub Releases。`,
  pub_date: new Date().toISOString(),
  platforms: { "windows-x86_64": { signature: readFileSync(`${installer}.sig`, "utf8").trim(), url: `https://github.com/Jiawei11/duo-radar/releases/download/v${version}/${name}` } },
};
writeFileSync(resolve(destination, "latest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Local update assets prepared in ${destination}. Nothing has been published.`);
