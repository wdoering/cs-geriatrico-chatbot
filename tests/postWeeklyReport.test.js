import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWeeklyReporter, startWeeklyReportScheduler, WeeklyReportBusyError } from "../services/postWeeklyReport.js";
import { createWeeklyReportStore } from "../repos/weeklyReportStore.js";

const now = new Date("2026-11-16T09:00:00Z");
const emptyReport = async period => ({ ...period, players: [], maps: [], uniqueMatches: 0, matchesWithStats: 0 });

function setup(overrides = {}) {
  let saved = null;
  const messages = [];
  const periods = [];
  const store = { load: () => structuredClone(saved), save: state => { saved = structuredClone(state); } };
  const channel = { isSendable: () => true, send: async message => { messages.push(message); return { id: String(messages.length) }; } };
  const client = { channels: { fetch: async () => channel } };
  const options = {
    channelId: "channel", store,
    collectReport: async period => { periods.push(period); return emptyReport(period); },
    ...overrides,
  };
  return { messages, periods, store, channel, client, options, reporter: createWeeklyReporter(client, options) };
}

test("scheduled delivery persists once per week across reporter restarts and advances next week", async () => {
  const fixture = setup();
  assert.equal((await fixture.reporter.post({ scheduled: true, now })).messagesPosted, 2);
  const restarted = createWeeklyReporter(fixture.client, fixture.options);
  assert.equal((await restarted.post({ scheduled: true, now })).reason, "already-posted");
  assert.equal(fixture.messages.length, 2);
  assert.equal(fixture.periods.length, 1);
  await restarted.post({ scheduled: true, now: new Date("2026-11-23T09:00:00Z") });
  assert.equal(fixture.messages.length, 4);
  assert.equal(fixture.periods.length, 2);
  for (const message of fixture.messages) assert.deepEqual(message.allowedMentions, { parse: [] });
});

test("schedule waits for Monday at the configured UTC hour and catches up only the latest due week", async () => {
  const fixture = setup();
  await fixture.reporter.post({ scheduled: true, now: new Date("2026-11-16T11:59:59Z"), hourUtc: 12 });
  assert.equal(new Date(fixture.periods[0].to * 1000).toISOString(), "2026-11-09T00:00:00.000Z");
  await fixture.reporter.post({ scheduled: true, now: new Date("2026-11-16T12:00:00Z"), hourUtc: 12 });
  assert.equal(new Date(fixture.periods[1].to * 1000).toISOString(), "2026-11-16T00:00:00.000Z");
  await fixture.reporter.post({ scheduled: true, now: new Date("2026-12-02T13:00:00Z"), hourUtc: 12 });
  assert.equal(new Date(fixture.periods[2].to * 1000).toISOString(), "2026-11-30T00:00:00.000Z");
  assert.equal(fixture.periods.length, 3);
});

test("on-demand reports can be repeated and do not consume scheduled delivery", async () => {
  const fixture = setup();
  await fixture.reporter.post({ now });
  await fixture.reporter.post({ now });
  assert.equal(fixture.store.load(), null);
  assert.equal(fixture.messages.length, 4);
  await fixture.reporter.post({ scheduled: true, now });
  assert.equal(fixture.messages.length, 6);
});

test("failed multi-message scheduled delivery resumes the saved snapshot after restart", async () => {
  const fixture = setup();
  const send = fixture.channel.send;
  fixture.channel.send = async message => {
    if (fixture.messages.length === 1) throw new Error("Discord unavailable");
    return send(message);
  };
  await assert.rejects(fixture.reporter.post({ scheduled: true, now }), /Discord unavailable/);
  assert.equal(fixture.store.load().sent, 1);
  fixture.channel.send = send;
  const restarted = createWeeklyReporter(fixture.client, fixture.options);
  const result = await restarted.post({ scheduled: true, now });
  assert.equal(result.messagesPosted, 1);
  assert.equal(fixture.messages.length, 2);
  assert.equal(fixture.periods.length, 1);
  assert.equal(fixture.store.load().sent, 2);
});

test("generation and channel failures leave the scheduled week retryable", async () => {
  let fail = true;
  const fixture = setup({ collectReport: async period => { if (fail) throw new Error("FACEIT offline"); return emptyReport(period); } });
  await assert.rejects(fixture.reporter.post({ scheduled: true, now }), /FACEIT offline/);
  assert.equal(fixture.store.load(), null);
  fail = false;
  fixture.channel.isSendable = () => false;
  await assert.rejects(fixture.reporter.post({ scheduled: true, now }), /not sendable/);
  assert.equal(fixture.store.load(), null);
  fixture.channel.isSendable = () => true;
  assert.equal((await fixture.reporter.post({ scheduled: true, now })).posted, true);
});

test("overlapping manual and scheduled runs cannot send duplicate reports", async () => {
  let unblock;
  const pending = new Promise(resolve => { unblock = resolve; });
  const fixture = setup({ collectReport: async period => { await pending; return emptyReport(period); } });
  const first = fixture.reporter.post({ scheduled: true, now });
  await assert.rejects(fixture.reporter.post({ now }), WeeklyReportBusyError);
  unblock();
  await first;
  assert.equal(fixture.messages.length, 2);
});

test("scheduler can be disabled and rejects invalid posting hours", () => {
  const reporter = { post() { throw new Error("must not run"); } };
  const stop = startWeeklyReportScheduler(reporter, { enabled: false });
  stop();
  for (const hourUtc of [-1, 24, NaN, 9.5]) {
    assert.throws(() => startWeeklyReportScheduler(reporter, { enabled: true, hourUtc }), /integer from 0 to 23/);
  }
});

test("file store survives recreation and refuses corrupt state instead of silently reposting", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "weekly-report-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "nested", "state.json");
  const store = createWeeklyReportStore(filename);
  assert.equal(store.load(), null);
  const state = { weekEnd: 100, channelId: "channel", embeds: [{ title: "Report" }], sent: 1 };
  store.save(state);
  assert.deepEqual(createWeeklyReportStore(filename).load(), state);
  assert.equal(fs.existsSync(`${filename}.tmp`), false);
  fs.writeFileSync(filename, "invalid json");
  assert.throws(() => store.load());
  fs.writeFileSync(filename, JSON.stringify({ ...state, sent: 2 }));
  assert.throws(() => store.load(), /Invalid weekly report state/);
});
