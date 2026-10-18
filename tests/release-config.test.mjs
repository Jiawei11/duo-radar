import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("Windows release identity, version and download instructions agree", async () => {
  const config = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.equal(config.version, pkg.version);
  assert.equal(config.productName, "Duo Radar");
  assert.deepEqual(config.bundle.targets, ["nsis"]);
  assert.ok(readme.includes(`DuoRadar-${pkg.version}-setup.exe`));
  assert.ok(readme.includes("https://github.com/Jiawei11/duo-radar/releases/latest"));
  assert.ok(readme.includes("GPL-3.0-or-later"));
});
