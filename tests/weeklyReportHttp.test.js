import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { weeklyReportRouter } from "../http/weeklyReport.js";
import { WeeklyReportBusyError } from "../services/postWeeklyReport.js";

test("weekly endpoint authenticates requests and reports readiness, success, busy and failures", async t => {
  const originalToken = process.env.BROADCAST_API_TOKEN;
  t.after(() => {
    if (originalToken === undefined) delete process.env.BROADCAST_API_TOKEN;
    else process.env.BROADCAST_API_TOKEN = originalToken;
  });
  let ready = true;
  let calls = 0;
  let failure = null;
  const reporter = { post: async () => { calls++; if (failure) throw failure; return { posted: true, messagesPosted: 2 }; } };
  const app = express();
  app.use(weeklyReportRouter(reporter, () => ready, { error() {} }));
  const server = await new Promise((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.on("error", reject);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = token => fetch(`http://127.0.0.1:${server.address().port}/weeklyReport`, {
    method: "POST", headers: token ? { Authorization: token } : {},
  });
  delete process.env.BROADCAST_API_TOKEN;
  assert.equal((await request()).status, 503);
  process.env.BROADCAST_API_TOKEN = "test-secret";
  for (const token of [null, "Bearer wrong", "Bearer test-secreX", "Basic test-secret"]) {
    assert.equal((await request(token)).status, 401);
  }
  assert.equal(calls, 0);
  ready = false;
  assert.equal((await request("Bearer test-secret")).status, 503);
  ready = true;
  const success = await request("bEaReR test-secret");
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { success: true, posted: true, messagesPosted: 2 });
  failure = new WeeklyReportBusyError();
  assert.equal((await request("Bearer test-secret")).status, 409);
  failure = new Error("private upstream details");
  const failed = await request("Bearer test-secret");
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { error: "Failed to post weekly report" });
});
