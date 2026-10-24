import test from "node:test";
import assert from "node:assert/strict";
import { createUpdater } from "../src/lib/updater.ts";

const pkg = (overrides = {}) => ({ version: "1.4.4", body: "Changes", download: async () => {}, install: async () => {}, close: async () => {}, ...overrides });
test("startup checks once and never downloads or installs automatically", async () => {
  let checks = 0, downloads = 0;
  const model = createUpdater(async () => { checks++; return pkg({ download: async () => downloads++ }); });
  model.start(); model.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(checks, 1); assert.equal(downloads, 0); assert.equal(model.getSnapshot().phase, "available");
});
test("network errors allow retry, and null means current", async () => {
  let failed = true;
  const model = createUpdater(async () => { if (failed) throw new Error("offline"); return null; });
  await model.checkNow(); assert.equal(model.getSnapshot().phase, "error");
  failed = false; await model.checkNow(); assert.equal(model.getSnapshot().phase, "current");
});
test("download progress completes only after signature validation; install is explicit", async () => {
  let installed = 0, finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const model = createUpdater(async () => pkg({
    download: async emit => {
      emit({ event: "Started", data: { contentLength: 100 } });
      emit({ event: "Progress", data: { chunkLength: 40 } });
      emit({ event: "Progress", data: { chunkLength: 60 } });
      emit({ event: "Finished" }); await gate;
    }, install: async () => { installed++; },
  }));
  await model.checkNow(); const downloading = model.download();
  assert.equal(model.getSnapshot().received, 100); assert.equal(model.getSnapshot().phase, "downloading");
  await model.install(async () => {}); assert.equal(installed, 0);
  finish(); await downloading;
  assert.equal(model.getSnapshot().phase, "ready"); assert.equal(installed, 0);
  const order = []; await model.install(async () => { order.push("pause"); });
  assert.deepEqual(order, ["pause"]); assert.equal(installed, 1);
});
test("bad signature or interrupted download cannot install and releases resource", async () => {
  for (const error of ["invalid signature", "connection reset"]) {
    let closed = 0, installed = 0;
    const model = createUpdater(async () => pkg({ download: async () => { throw new Error(error); }, close: async () => { closed++; }, install: async () => installed++ }));
    await model.checkNow(); await model.download(); await model.install(async () => {});
    assert.equal(model.getSnapshot().phase, "error"); assert.equal(closed, 1); assert.equal(installed, 0);
  }
});
test("prepare failure keeps verified package for retry; discard releases it", async () => {
  let installed = 0, closed = 0;
  const model = createUpdater(async () => pkg({ install: async () => installed++, close: async () => closed++ }));
  await model.checkNow(); await model.download();
  await model.install(async () => { throw new Error("still monitoring"); });
  assert.equal(model.getSnapshot().phase, "ready"); assert.equal(installed, 0);
  await model.discard(); assert.equal(closed, 1); assert.equal(model.getSnapshot().phase, "idle");
});
test("simultaneous requests cannot duplicate checks or downloads", async () => {
  let checks = 0, downloads = 0;
  const model = createUpdater(async () => { checks++; return pkg({ download: async () => { downloads++; await new Promise(resolve => setImmediate(resolve)); } }); });
  await Promise.all([model.checkNow(), model.checkNow()]);
  await Promise.all([model.download(), model.download(), model.checkNow()]);
  assert.equal(checks, 1); assert.equal(downloads, 1);
});
