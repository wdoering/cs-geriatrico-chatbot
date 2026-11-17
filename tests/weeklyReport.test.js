import test from "node:test";
import assert from "node:assert/strict";
import { EmbedBuilder } from "discord.js";
import { collectWeeklyReport } from "../services/collectWeeklyReport.js";
import { buildWeeklyEmbeds, previousWeek } from "../reports/weeklyReport.js";

const period = previousWeek(new Date("2026-11-17T12:00:00Z"));
const logger = { error() {} };
const entry = (id, winner = "faction1") => ({
  match_id: id, results: { winner },
  teams: {
    faction1: { players: [{ player_id: "a" }] },
    faction2: { players: [{ player_id: "b" }] },
  },
});
const statPlayer = (id, kills, deaths, assists) => ({
  player_id: id, nickname: "old nickname",
  player_stats: { Kills: String(kills), Deaths: String(deaths), Assists: String(assists) },
});
const map = (name, a, b) => ({ round_stats: { Map: name }, teams: [{ players: [a] }, { players: [b] }] });
const stats = { rounds: [
  map("de_mirage", statPlayer("a", 20, 10, 5), statPlayer("b", 10, 20, 2)),
  map("de_nuke", statPlayer("a", 10, 20, 4), statPlayer("b", 20, 10, 3)),
] };
const basePlayer = {
  nickname: "Player", historyUnavailable: false, matches: 1, wins: 1, losses: 0,
  unknownResults: 0, kills: 30, deaths: 30, assists: 9, statsMatches: 1,
};
const baseReport = { ...period, uniqueMatches: 1, matchesWithStats: 1, players: [basePlayer], maps: [] };

test("weekly period is the previous complete Monday–Sunday UTC, including year boundaries", () => {
  assert.equal(new Date(period.from * 1000).toISOString(), "2026-11-09T00:00:00.000Z");
  assert.equal(new Date(period.to * 1000).toISOString(), "2026-11-16T00:00:00.000Z");
  assert.deepEqual(previousWeek(new Date("2026-11-16T00:00:00Z")), period);
  const newYear = previousWeek(new Date("2027-01-01T23:00:00Z"));
  assert.equal(new Date(newYear.from * 1000).toISOString(), "2026-12-21T00:00:00.000Z");
  assert.equal(new Date(newYear.to * 1000).toISOString(), "2026-12-28T00:00:00.000Z");
});

test("shared games are fetched once, all maps count, and stats match stable player IDs", async () => {
  const calls = [];
  const faceit = {
    resolvePlayerId: async nickname => ({ "-TheBrain": "a", JORGE: "b", Sleeper: "c" })[nickname],
    fetchHistory: async id => id === "c" ? [] : [entry("shared"), entry("shared")],
    fetchStats: async id => { calls.push(id); return stats; },
  };
  const report = await collectWeeklyReport(period, { nicknames: ["-TheBrain", "JORGE", "Sleeper"], faceit, logger });
  assert.deepEqual(calls, ["shared"]);
  assert.equal(report.uniqueMatches, 1);
  const [a, b, sleeper] = report.players;
  assert.deepEqual([a.matches, a.wins, a.kills, a.deaths, a.assists, a.statsMatches], [1, 1, 30, 30, 9, 1]);
  assert.deepEqual([b.matches, b.losses, b.kills, b.deaths, b.assists], [1, 1, 30, 30, 5]);
  assert.equal(sleeper.matches, 0);
  assert.deepEqual(report.maps, [{ name: "de_mirage", count: 1 }, { name: "de_nuke", count: 1 }]);
  const embeds = buildWeeklyEmbeds(report);
  assert(embeds[0].fields[0].value.includes("K/D: **1.00**"));
  assert.match(embeds[0].fields[2].value, /bingo/);
  assert.match(embeds[1].description, /1 partidas únicas/);
  assert.match(embeds[1].description, /2 participações/);
  assert.match(embeds[1].description, /-TheBrain, JORGE/);
  assert.match(embeds[0].title, /1. Por jogador/);
  assert.match(embeds[1].title, /2. Achados gerais/);
});

test("K/D uses total kills divided by total deaths, not the mean of per-game ratios", async () => {
  const faceit = {
    resolvePlayerId: async () => "a",
    fetchHistory: async () => [entry("one"), entry("two")],
    fetchStats: async id => ({ rounds: [map("de_nuke", id === "one" ? statPlayer("a", 30, 10, 0) : statPlayer("a", 10, 30, 0), statPlayer("b", 0, 0, 0))] }),
  };
  const report = await collectWeeklyReport(period, { nicknames: ["A"], faceit, logger });
  assert(buildWeeklyEmbeds(report)[0].fields[0].value.includes("K/D: **1.00**"));
});

test("history failures and missing stats remain visible, while known match results survive", async () => {
  const faceit = {
    resolvePlayerId: async nickname => nickname.toLowerCase(),
    fetchHistory: async id => { if (id === "b") throw new Error("offline"); return [entry("shared")]; },
    fetchStats: async () => { throw new Error("stats pending"); },
  };
  const report = await collectWeeklyReport(period, { nicknames: ["A", "B"], faceit, logger });
  assert.equal(report.players[0].wins, 1);
  assert.equal(report.players[1].losses, 1);
  assert.equal(report.players[1].historyUnavailable, true);
  assert.equal(report.players[0].statsMatches, 0);
  const embeds = buildWeeklyEmbeds(report);
  assert.match(embeds[0].fields[1].value, /Histórico incompleto/);
  assert.doesNotMatch(embeds[0].fields[1].value, /bingo/);
  assert.match(embeds[1].description, /Relatório parcial/);
  assert.doesNotMatch(embeds[1].description, /Bengala de ouro/);
});

test("unknown outcomes are not losses and incomplete map stats are not zeroes", async () => {
  const brokenStats = structuredClone(stats);
  delete brokenStats.rounds[1].teams[0].players[0].player_stats.Deaths;
  const faceit = { resolvePlayerId: async () => "a", fetchHistory: async () => [entry("m", null)], fetchStats: async () => brokenStats };
  const report = await collectWeeklyReport(period, { nicknames: ["A"], faceit, logger });
  assert.equal(report.players[0].losses, 0);
  assert.equal(report.players[0].unknownResults, 1);
  assert.equal(report.players[0].statsMatches, 0);
  assert.equal(report.players[0].kills, 0);
  const field = buildWeeklyEmbeds(report)[0].fields[0].value;
  assert(field.includes("Aproveitamento: N/D"));
  assert(field.includes("K/D/A disponível em 0/1"));
});

test("a complete FACEIT outage rejects instead of publishing an empty week", async () => {
  const faceit = { resolvePlayerId: async () => { throw new Error("outage"); } };
  await assert.rejects(collectWeeklyReport(period, { nicknames: ["A", "B"], faceit, logger }), /any player/);
});

test("zero deaths, no kills and no activity produce readable reports without NaN", () => {
  for (const kills of [0, 5]) {
    const report = { ...baseReport, players: [{ ...basePlayer, kills, deaths: 0 }] };
    const text = JSON.stringify(buildWeeklyEmbeds(report));
    assert.doesNotMatch(text, /NaN|Infinity/);
    assert.match(text, kills ? /∞/ : /0.00/);
  }
  const inactive = { ...basePlayer, matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0, statsMatches: 0 };
  const text = JSON.stringify(buildWeeklyEmbeds({ ...baseReport, players: [inactive], uniqueMatches: 0, matchesWithStats: 0 }));
  assert.match(text, /repouso coletivo/);
  assert.doesNotMatch(text, /Bengala de ouro|NaN/);
});

test("large rosters and ties stay within Discord embed limits and retain every player", () => {
  const players = Array.from({ length: 160 }, (_, i) => ({ ...basePlayer, nickname: `${i}_${"*".repeat(70)}` }));
  const embeds = buildWeeklyEmbeds({ ...baseReport, players });
  assert.equal(embeds.flatMap(embed => embed.fields ?? []).length, players.length);
  for (const embed of embeds) {
    assert(new EmbedBuilder(embed).length <= 6000);
    assert(embed.description.length <= 4096);
    assert((embed.fields?.length ?? 0) <= 25);
    for (const field of embed.fields ?? []) {
      assert(field.name.length <= 256);
      assert(field.value.length <= 1024);
    }
  }
});
