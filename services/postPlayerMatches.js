import { loadPostedMatches, savePostedMatches } from "../repos/matchStore.js";
import fetch from "node-fetch";
import { EmbedBuilder } from "discord.js";

const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const roasts = [
  "might still be loading textures 🐢",
  "was playing Minesweeper instead of CS2 💻",
  "had negative impact detected 📉",
  "is reporting straight to silver division 🥈",
  "thought this was a walking simulator 🚶",
  "got outfragged by a decoy grenade 🎯",
  "should uninstall… just saying 🤷",
  "was practicing eco frags all game 💸",
];

async function fetchLatestMatches(playerId) {
  const res = await fetch(
    `https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&offset=0&limit=3`,
    { headers: { Authorization: `Bearer ${FACEIT_API_KEY}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch history for ${playerId}`);
  const data = await res.json();
  return data.items.map((m) => m.match_id);
}

async function fetchMatchDetails(matchId) {
  const [matchRes, statsRes] = await Promise.all([
    fetch(`https://open.faceit.com/data/v4/matches/${matchId}`, {
      headers: { Authorization: `Bearer ${FACEIT_API_KEY}` },
    }),
    fetch(`https://open.faceit.com/data/v4/matches/${matchId}/stats`, {
      headers: { Authorization: `Bearer ${FACEIT_API_KEY}` },
    }),
  ]);

  return { match: await matchRes.json(), stats: await statsRes.json() };
}

function buildMatchEmbed(match, stats) {
  const map = match.voting.map.pick[0];
  const team1 = match.teams.faction1.name;
  const team2 = match.teams.faction2.name;
  const score1 = match.results.score.faction1;
  const score2 = match.results.score.faction2;

  const team1Players = stats.rounds[0].teams[0].players;
  const team2Players = stats.rounds[0].teams[1].players;
  const allPlayers = [...team1Players, ...team2Players];

  const topFragger = allPlayers.reduce((best, p) =>
    parseInt(p.player_stats.Kills) > parseInt(best.player_stats.Kills)
      ? p
      : best
  );
  const team1MVP = team1Players.reduce((best, p) =>
    parseInt(p.player_stats.Kills) > parseInt(best.player_stats.Kills)
      ? p
      : best
  );
  const team2MVP = team2Players.reduce((best, p) =>
    parseInt(p.player_stats.Kills) > parseInt(best.player_stats.Kills)
      ? p
      : best
  );
  const bottomFragger = allPlayers.reduce((worst, p) =>
    parseInt(p.player_stats.Kills) < parseInt(worst.player_stats.Kills)
      ? p
      : worst
  );

  const roast = roasts[Math.floor(Math.random() * roasts.length)];

  const formatPlayer = (p) => {
    const kd = parseFloat(p.player_stats["K/D Ratio"]);
    const skull = kd < 1 ? " 💀" : "";
    return `${p.nickname}: ${p.player_stats.Kills}/${p.player_stats.Deaths} (${p.player_stats["K/D Ratio"]}) | HS ${p.player_stats["Headshots %"]} | MVPs ${p.player_stats.MVPs}${skull}`;
  };

  const team1Stats = team1Players.map(formatPlayer).join("\n");
  const team2Stats = team2Players.map(formatPlayer).join("\n");

  return new EmbedBuilder()
    .setTitle(`FACEIT Match Finished`)
    .setDescription(
      `**${team1} vs ${team2}** on ${map}\n\n` +
        `🔥 **Top Fragger:** ${topFragger.nickname} with ${topFragger.player_stats.Kills} kills\n` +
        `⭐ **${team1} MVP:** ${team1MVP.nickname} (${team1MVP.player_stats.Kills} kills)\n` +
        `⭐ **${team2} MVP:** ${team2MVP.nickname} (${team2MVP.player_stats.Kills} kills)\n\n` +
        `💀 **Bottom Fragger:** ${bottomFragger.nickname} with ${bottomFragger.player_stats.Kills} kills — ${roast}`
    )
    .addFields(
      { name: "Score", value: `${score1} - ${score2}`, inline: false },
      { name: team1, value: team1Stats || "No data", inline: true },
      { name: team2, value: team2Stats || "No data", inline: true }
    )
    .setColor("DarkButNotBlack")
    .setTimestamp();
}

/**
 *
 * @param {Object} discordClient
 * @param {Array<String>} playerIds
 */
export async function postPlayerMatches(discordClient) {
  const playerNickNames = [
    "H1GO-",
    "swagner-rs",
    "ExNihilDg",
    "GBDoNeS",
    "Felpa_br",
    "Georges",
    "gusssz",
    "perucs_",
    "s4bot4g3",
  ];
  try {
    const postedMatches = loadPostedMatches();

    for (const nickname of playerNickNames) {
      const playerId = await resolvePlayerId(nickname);
      const matchIds = await fetchLatestMatches(playerId);
      for (const matchId of matchIds) {
        if (postedMatches.has(matchId)) {
          console.log(`⏩ Skipping already posted match ${matchId}`);
          continue;
        }

        const { match, stats } = await fetchMatchDetails(matchId);
        const embed = buildMatchEmbed(match, stats);
        const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
        await channel.send({ embeds: [embed] });
        postedMatches.add(matchId);
      }
    }

    return savePostedMatches(postedMatches);
  } catch (err) {
    console.error("❌ Error posting player matches:", err);
  }

  /**
   *
   * @param {*} nickname
   * @returns
   */
  async function resolvePlayerId(nickname) {
    const res = await fetch(
      `https://open.faceit.com/data/v4/players?nickname=${nickname}`,
      { headers: { Authorization: `Bearer ${FACEIT_API_KEY}` } }
    );
    if (!res.ok) throw new Error(`Failed to resolve player ID for ${nickname}`);
    const data = await res.json();
    return data.player_id; // <-- UUID you actually need
  }
}
