import { playerNicknames } from "../config/players.js";
import { createWeeklyFaceitClient } from "../queries/weeklyFaceit.js";

function readCount(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function playerStats(stats, playerId) {
  if (!Array.isArray(stats?.rounds) || !stats.rounds.length) return null;
  const total = { kills: 0, deaths: 0, assists: 0 };
  // FACEIT calls map results "rounds". Include every map of a series.
  for (const round of stats.rounds) {
    const player = round.teams?.flatMap(team => team.players ?? [])
      .find(candidate => candidate.player_id === playerId);
    for (const [key, field] of [["kills", "Kills"], ["deaths", "Deaths"], ["assists", "Assists"]]) {
      const value = readCount(player?.player_stats?.[field]);
      if (value === null) return null;
      total[key] += value;
    }
  }
  return total;
}

function playerFaction(match, playerId) {
  return Object.entries(match.teams ?? {}).find(([, team]) =>
    team.players?.some(player => player.player_id === playerId)
  )?.[0];
}

export async function collectWeeklyReport(period, {
  nicknames = playerNicknames,
  faceit = createWeeklyFaceitClient(),
  logger = console,
} = {}) {
  const players = [];
  const matches = new Map();
  for (const nickname of nicknames) {
    const player = {
      nickname, id: null, historyUnavailable: false,
      matches: 0, wins: 0, losses: 0, unknownResults: 0,
      kills: 0, deaths: 0, assists: 0, statsMatches: 0,
      matchIds: new Set(),
    };
    players.push(player);
    try {
      player.id = await faceit.resolvePlayerId(nickname);
      const history = await faceit.fetchHistory(player.id, period);
      for (const match of history) {
        player.matchIds.add(match.match_id);
        matches.set(match.match_id, match);
      }
    } catch (error) {
      player.historyUnavailable = true;
      logger.error(`Weekly history unavailable for ${nickname}:`, error);
    }
  }

  if (players.length && players.every(player => player.historyUnavailable)) {
    throw new Error("Could not fetch weekly history for any player");
  }

  const maps = new Map();
  let matchesWithStats = 0;
  for (const [matchId, match] of matches) {
    let stats;
    try {
      stats = await faceit.fetchStats(matchId);
      if (!Array.isArray(stats?.rounds) || !stats.rounds.length) {
        throw new Error("FACEIT match stats have no map results");
      }
      matchesWithStats++;
      for (const round of stats.rounds) {
        const map = round.round_stats?.Map;
        if (map) maps.set(map, (maps.get(map) ?? 0) + 1);
      }
    } catch (error) {
      logger.error(`Weekly stats unavailable for ${matchId}:`, error);
    }

    for (const player of players) {
      if (!player.id) continue;
      const faction = playerFaction(match, player.id);
      if (!faction && !player.matchIds.has(matchId)) continue;
      player.matches++;
      const winner = match.results?.winner;
      if (faction && winner && match.teams?.[winner]) {
        if (winner === faction) player.wins++;
        else player.losses++;
      } else {
        player.unknownResults++;
      }
      const totals = playerStats(stats, player.id);
      if (totals) {
        player.statsMatches++;
        for (const key of ["kills", "deaths", "assists"]) player[key] += totals[key];
      }
    }
  }

  return {
    ...period,
    players: players.map(({ matchIds, ...player }) => player),
    uniqueMatches: matches.size,
    matchesWithStats,
    maps: [...maps].map(([name, count]) => ({ name, count })),
  };
}
