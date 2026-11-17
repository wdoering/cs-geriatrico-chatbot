import fetch from "node-fetch";

const PAGE_SIZE = 100;
const BASE_URL = "https://open.faceit.com/data/v4";

export function createWeeklyFaceitClient({
  apiKey = process.env.FACEIT_API_KEY,
  fetchImpl = fetch,
} = {}) {
  async function request(path) {
    if (!apiKey) throw new Error("FACEIT_API_KEY is not configured");
    const response = await fetchImpl(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`FACEIT ${response.status} fetching ${path}`);
    }
    return response.json();
  }

  return {
    async resolvePlayerId(nickname) {
      const player = await request(`/players?nickname=${encodeURIComponent(nickname)}`);
      if (!player.player_id) throw new Error(`No FACEIT player ID for ${nickname}`);
      return player.player_id;
    },

    async fetchHistory(playerId, { from, to }) {
      const matches = new Map();
      const seen = new Set();
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const query = new URLSearchParams({ game: "cs2", from, to, offset, limit: PAGE_SIZE });
        const page = await request(`/players/${encodeURIComponent(playerId)}/history?${query}`);
        if (!Array.isArray(page.items)) throw new Error("Invalid FACEIT history response");
        let newItems = 0;
        for (const match of page.items) {
          if (!match.match_id) throw new Error("FACEIT history entry has no match ID");
          if (!seen.has(match.match_id)) newItems++;
          seen.add(match.match_id);
          const finishedAt = Number(match.finished_at);
          if (finishedAt >= from && finishedAt < to &&
              (!match.status || match.status.toLowerCase() === "finished")) {
            matches.set(match.match_id, match);
          }
        }
        if (page.items.length < PAGE_SIZE) break;
        if (!newItems) throw new Error("FACEIT returned a repeated history page");
      }
      return [...matches.values()];
    },

    fetchStats(matchId) {
      return request(`/matches/${encodeURIComponent(matchId)}/stats`);
    },
  };
}
