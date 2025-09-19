import "dotenv/config";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
//================================================================
// cs-geriatrico-chatbot
// to be used on Discord to scratch info from FaceIT and post in the channel
//================================================================

import express from "express";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const app = express();
app.use(express.json());

// Funny roast lines
const roasts = [
  "might still be loading textures 🐢",
  "was playing Minesweeper instead of CS2 💻",
  "had negative impact detected 📉",
  "is reporting straight to silver division 🥈",
  "thought this was a walking simulator 🚶",
  "got outfragged by a decoy grenade 🎯",
  "should uninstall… just saying 🤷",
  "was practicing eco frags all game 💸"
];

// FACEIT webhook endpoint
app.post("/faceit/webhook", async (req, res) => {
  try {
    const { payload } = req.body;
    if (!payload) return res.sendStatus(400);

    const matchId = payload.match_id;

    // Fetch match details
    const matchRes = await fetch(`https://open.faceit.com/data/v4/matches/${matchId}`, {
      headers: { Authorization: `Bearer ${FACEIT_API_KEY}` }
    });
    const match = await matchRes.json();

    // Fetch stats
    const statsRes = await fetch(`https://open.faceit.com/data/v4/matches/${matchId}/stats`, {
      headers: { Authorization: `Bearer ${FACEIT_API_KEY}` }
    });
    const stats = await statsRes.json();

    const map = match.voting.map.pick[0];
    const team1 = match.teams.faction1.name;
    const team2 = match.teams.faction2.name;
    const score1 = match.results.score.faction1;
    const score2 = match.results.score.faction2;

    const team1Players = stats.rounds[0].teams[0].players;
    const team2Players = stats.rounds[0].teams[1].players;
    const allPlayers = [...team1Players, ...team2Players];

    // Find top fragger (overall)
    let topFragger = allPlayers.reduce((best, p) =>
      parseInt(p.player_stats.Kills) > parseInt(best.player_stats.Kills) ? p : best
    );

    // Find MVPs per team
    let team1MVP = team1Players.reduce((best, p) =>
      parseInt(p.player_stats.Kills) > parseInt(best.player_stats.Kills) ? p : best
    );
    let team2MVP = team2Players.reduce((best, p) =>
      parseInt(p.player_stats.Kills) > parseInt(best.player_stats.Kills) ? p : best
    );

    // Find worst bottom fragger (lowest kills overall)
    let bottomFragger = allPlayers.reduce((worst, p) =>
      parseInt(p.player_stats.Kills) < parseInt(worst.player_stats.Kills) ? p : worst
    );

    // Pick a random roast
    const roast = roasts[Math.floor(Math.random() * roasts.length)];

    // Helper to format player stats
    const formatPlayer = (p) => {
      const kd = parseFloat(p.player_stats["K/D Ratio"]);
      const skull = kd < 1 ? " 💀" : "";
      return `${p.nickname}: ${p.player_stats.Kills}/${p.player_stats.Deaths} (${p.player_stats["K/D Ratio"]}) | HS ${p.player_stats["Headshots %"]} | MVPs ${p.player_stats.MVPs}${skull}`;
    };

    const team1Stats = team1Players.map(formatPlayer).join("\n");
    const team2Stats = team2Players.map(formatPlayer).join("\n");

    // Build embed
    const embed = new EmbedBuilder()
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

    // Send to Discord
    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    await channel.send({ embeds: [embed] });

    res.sendStatus(200);
  } catch (err) {
    console.error("Error handling webhook:", err);
    res.sendStatus(500);
  }
});

// Discord bot startup
client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);

// Start webhook server
app.listen(3000, () => console.log("Webhook server running on port 3000"));
