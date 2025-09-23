import "dotenv/config";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
import fetchMatchStats from "./queries/fetchMatchStats.js";
//================================================================
// cs-geriatrico-chatbot
// to be used on Discord to scratch info from FaceIT and post in the channel
//==================================å==============================

import express from "express";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const app = express();
app.use(express.json());

// FACEIT webhook endpoint
app.post("/faceit/webhook", fetchMatchStats);

// Discord bot startup
client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);

// Start webhook server
app.listen(3000, () => console.log("Webhook server running on port 3000"));
