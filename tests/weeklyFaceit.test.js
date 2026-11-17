import test from "node:test";
import assert from "node:assert/strict";
import { createWeeklyFaceitClient } from "../queries/weeklyFaceit.js";

const ok = data => ({ ok: true, json: async () => data });

test("weekly history reads every page, deduplicates and enforces completion boundaries", async () => {
  const calls = [];
  const items = Array.from({ length: 205 }, (_, i) => ({ match_id: `m${i}`, finished_at: 150, status: "finished" }));
  items[0].finished_at = 100;
  items[1].finished_at = 99;
  items[2].finished_at = 200;
  items[3].status = "cancelled";
  items[4] = { match_id: "no-finish", created_at: 150 };
  items[104] = items[100];
  const client = createWeeklyFaceitClient({
    apiKey: "test",
    fetchImpl: async (url, options) => {
      const query = new URL(url).searchParams;
      assert.equal(options.headers.Authorization, "Bearer test");
      assert.equal(query.get("game"), "cs2");
      assert.equal(query.get("from"), "100");
      assert.equal(query.get("to"), "200");
      assert.equal(query.get("limit"), "100");
      const offset = Number(query.get("offset"));
      calls.push(offset);
      return ok({ items: items.slice(offset, offset + 100) });
    },
  });
  const matches = await client.fetchHistory("player", { from: 100, to: 200 });
  assert.deepEqual(calls, [0, 100, 200]);
  assert.equal(matches.length, 200);
  assert(matches.some(match => match.match_id === "m0"));
  for (const id of ["m1", "m2", "m3", "no-finish"]) assert(!matches.some(match => match.match_id === id));
});

test("history refuses repeated pages instead of looping forever", async () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ match_id: String(i), finished_at: 150 }));
  const client = createWeeklyFaceitClient({ apiKey: "test", fetchImpl: async () => ok({ items }) });
  await assert.rejects(client.fetchHistory("p", { from: 100, to: 200 }), /repeated history page/);
});

test("HTTP failures, missing configuration and malformed history are errors, not inactivity", async () => {
  const failed = createWeeklyFaceitClient({ apiKey: "test", fetchImpl: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(failed.fetchStats("m"), /FACEIT 429/);
  const malformed = createWeeklyFaceitClient({ apiKey: "test", fetchImpl: async () => ok({}) });
  await assert.rejects(malformed.fetchHistory("p", { from: 1, to: 2 }), /Invalid FACEIT history/);
  await assert.rejects(malformed.resolvePlayerId("p"), /No FACEIT player ID/);
  await assert.rejects(createWeeklyFaceitClient({ apiKey: "" }).resolvePlayerId("p"), /not configured/);
});

test("nicknames are URL encoded when resolving current FACEIT identities", async () => {
  const client = createWeeklyFaceitClient({
    apiKey: "test",
    fetchImpl: async url => {
      assert.equal(new URL(url).searchParams.get("nickname"), "-TheBrain & friend");
      return ok({ player_id: "uuid" });
    },
  });
  assert.equal(await client.resolvePlayerId("-TheBrain & friend"), "uuid");
});
