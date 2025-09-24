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

/**
 * @deprecated This endpoint is deprecated and may be removed in future versions.
 */
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

const roasts = [
  "Bando de aposentado, até a tartaruga entra mais rápido no servidor!",
  "Vocês acham que CS é igual vinho? Quanto mais velho, melhor? Só estão azedando...",
  "Time Nutella: mais desculpa que kill.",
  "Cadê os guerreiros? Viraram clã de bingo agora?",
  "Esse grupo aqui é só lobby de espera do INSS.",
  "De tanto sumirem, já já o Faceit manda busca e apreensão.",
  "Vocês só aparecem pra pedir drop de AK, nunca pra jogar.",
  "Pior que bot do warmup: não atira, não entra e ainda some.",
  "Mais fácil achar servidor 128 tick do que ver vocês logados.",
  "Tá virando grupo de zap de família, só figurinha e nada de bala.",
  "Vocês estão jogando CS ou simulador de desculpa?",
  "Quem não aparece hoje paga a cerveja na próxima LAN.",
  "Vocês estão confundindo treino com cochilo da tarde.",
  "Bando de camper de vida real: ninguém dá as caras.",
  "Se tivesse ranking de sumiço, já estavam global elite.",
  "😒 Vcs sao mto fracos! Tudo pau mandado!!!"
];

client.on("messageCreate", async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  if (message.content === "!stats") {
    await message.channel.send("Fetching stats... ⏳");

    try {
      await postPlayerMatches(client);
      const matchesPosted = await postPlayerMatches(client);
      if (matchesPosted === 0) {
        roasts.push();
        const randomRoast = roasts[Math.floor(Math.random() * roasts.length)];
        await message.channel.send(randomRoast);
      } else {
        await message.channel.send(`✅ ${matchesPosted} matches posted!`);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
      await message.channel.send("❌ Failed to fetch stats.");
    }
  }
});


client.login(DISCORD_TOKEN);


// Start webhook server
app.listen(3000, () => console.log("Webhook server running on port 3000"));
