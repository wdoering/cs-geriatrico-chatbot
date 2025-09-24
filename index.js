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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // 👈 required to read messages
  ],
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
client.on("messageCreate", async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  if (message.content === "!stats") {
    await message.channel.send("Fetching stats... ⏳");

    try {
      await postPlayerMatches(client);
      await message.channel.send("✅ Stats posted!");
    } catch (err) {
      console.error("Error fetching stats:", err);
      await message.channel.send("❌ Failed to fetch stats.");
    }
  }
});


client.login(DISCORD_TOKEN);

// Start webhook server
app.listen(3000, () => console.log("Webhook server running on port 3000"));
