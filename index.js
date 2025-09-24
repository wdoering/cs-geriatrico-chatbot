import "dotenv/config";
import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { postPlayerMatches } from "./services/postPlayerMatches.js";
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
//================================================================
// cs-geriatrico-chatbot
// to be used on Discord to scratch info from FaceIT and post in the channel
//==================================å==============================

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const app = express();
app.use(express.json());

// FACEIT webhook endpoint
app.post("/faceit/webhook", async (req, res) => {
  await postPlayerMatches(client);
  res.json({ success: true });
});

// FACEIT webhook endpoint
app.get("/fetchStats", async (req, res) => {
  await postPlayerMatches(client);
  res.json({ success: true });
});

// Discord bot startup
client.on("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);

// Start webhook server
app.listen(3000, () => console.log("Webhook server running on port 3000"));
