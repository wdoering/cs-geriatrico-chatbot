import { EmbedBuilder, escapeMarkdown } from "discord.js";

const DAY = 24 * 60 * 60;
export const WEEK = 7 * DAY;

export function previousWeek(now = new Date()) {
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const to = Math.floor(monday.getTime() / 1000);
  return { from: to - WEEK, to };
}

const name = value => escapeMarkdown(String(value).replace(/[\r\n]/g, " ").slice(0, 80));
const ratio = player => player.deaths === 0
  ? (player.kills > 0 ? Infinity : 0)
  : player.kills / player.deaths;
const kd = player => Number.isFinite(ratio(player)) ? ratio(player).toFixed(2) : "∞";
const winRate = player => {
  const known = player.wins + player.losses;
  return known ? `${(100 * player.wins / known).toFixed(0)}%` : "N/D";
};

function roast(player) {
  if (player.historyUnavailable) return "O prontuário veio incompleto. Sem inventar diagnóstico! 📋";
  if (!player.matches) return "Passou a semana no bingo. A mira descansou, mas a desculpa está em dia. 🛌";
  if (player.statsMatches < player.matches) return "O FACEIT perdeu parte do prontuário. O VAR do asilo segue investigando. 🔎";
  if (player.wins === player.matches) return "Só vitória! A direção já pediu exame antidoping do chá de camomila. 🍵";
  if (ratio(player) >= 1.3) return "Carregou tanta gente que já pode cobrar passagem no ônibus do asilo. 🚌";
  if (ratio(player) < 0.8) return "Fez doação de kill a semana toda. O inimigo agradece a caridade. 🎁";
  if (player.losses === player.matches) return "A vitória tirou férias. Pelo menos o botão de buscar partida continua funcionando. 🏖️";
  if (player.matches >= 10) return "Bateu tanto ponto no servidor que o FACEIT já está devendo férias. 🕒";
  return "Entre uma bala e um cochilo, manteve o geriátrico em atividade. 👴";
}

function playerField(player) {
  const lines = [];
  if (player.matches) {
    lines.push(`🎮 **${player.matches} partidas** · ${player.wins}V / ${player.losses}D · Aproveitamento: ${winRate(player)}`);
    if (player.unknownResults) lines.push(`⚠️ ${player.unknownResults} resultado(s) desconhecido(s), fora do aproveitamento.`);
    if (player.statsMatches) {
      lines.push(`🔫 K/D/A: **${player.kills}/${player.deaths}/${player.assists}** · K/D: **${kd(player)}**`);
      lines.push(`Média: ${(player.kills / player.statsMatches).toFixed(1)} kills/partida`);
    }
    if (player.statsMatches < player.matches) {
      lines.push(`⚠️ K/D/A disponível em ${player.statsMatches}/${player.matches} partidas.`);
    }
  } else {
    lines.push(player.historyUnavailable ? "⚠️ Histórico indisponível." : "🎮 **0 partidas** nesta semana.");
  }
  if (player.historyUnavailable && player.matches) lines.push("⚠️ Histórico incompleto; apenas partidas encontradas com outros jogadores.");
  lines.push(roast(player));
  return { name: name(player.nickname), value: lines.join("\n"), inline: false };
}

function leaders(players, metric) {
  const best = Math.max(...players.map(metric));
  return { best, names: players.filter(player => metric(player) === best).map(player => name(player.nickname)).join(", ") };
}

function findings(report) {
  const active = report.players.filter(player => player.matches);
  const measured = active.filter(player => player.statsMatches);
  const sum = key => report.players.reduce((total, player) => total + player[key], 0);
  const lines = [
    `🎮 **${report.uniqueMatches} partidas únicas** · ${active.length}/${report.players.length} jogadores em atividade.`,
    `👥 **${sum("matches")} participações** · ${sum("wins")} vitórias / ${sum("losses")} derrotas por jogador.`,
    "Uma partida com vários integrantes conta uma vez no total e uma participação para cada um.",
  ];
  if (sum("unknownResults")) lines.push(`⚠️ ${sum("unknownResults")} participação(ões) com resultado desconhecido.`);
  if (measured.length) {
    lines.push(`🔫 Saldo do plantão: **${sum("kills")} kills, ${sum("deaths")} mortes e ${sum("assists")} assistências** nos dados disponíveis.`);
    const fragger = leaders(measured, player => player.kills);
    const carry = leaders(measured, ratio);
    const deaths = leaders(measured, player => player.deaths);
    lines.push(`🏆 **Bengala de ouro:** ${fragger.names} — ${fragger.best} kills. Aposentadoria da mira adiada!`);
    lines.push(`🚌 **Motorista do asilo:** ${carry.names} — K/D ${Number.isFinite(carry.best) ? carry.best.toFixed(2) : "∞"}. O transporte da equipe agradece.`);
    if (deaths.best > 0) lines.push(`🩹 **Freguês da enfermaria:** ${deaths.names} — ${deaths.best} mortes. Já tem cadeira cativa no respawn.`);
  }
  if (active.length) {
    const regular = leaders(active, player => player.matches);
    lines.push(`🕒 **Ponto batido:** ${regular.names} — ${regular.best} partidas. O servidor já virou endereço residencial.`);
  } else if (!report.players.some(player => player.historyUnavailable)) {
    lines.push("🛌 Semana de repouso coletivo: o único clutch foi achar o controle da TV.");
  }
  if (report.maps.length) {
    const maps = leaders(report.maps.map(map => ({ nickname: map.name, count: map.count })), map => map.count);
    lines.push(`🗺️ **Passeio favorito:** ${maps.names} — ${maps.best} vez(es). A excursão do asilo já sabe o caminho.`);
  }
  const unavailable = report.players.filter(player => player.historyUnavailable).length;
  const missingStats = active.some(player => player.statsMatches < player.matches);
  if (unavailable || missingStats) {
    lines.push(`⚠️ **Relatório parcial:** ${unavailable} histórico(s) indisponível(is); estatísticas de ${report.matchesWithStats}/${report.uniqueMatches} partidas únicas. Totais e prêmios usam apenas os dados disponíveis.`);
  }
  return lines;
}

export function buildWeeklyEmbeds(report) {
  const date = timestamp => new Date(timestamp * 1000).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const period = `${date(report.from)} a ${date(report.to - 1)} (UTC)`;
  const embeds = [];
  const newPlayerEmbed = () => new EmbedBuilder()
    .setColor("DarkButNotBlack")
    .setTitle("🏥 Boletim semanal do Geriátrico — 1. Por jogador")
    .setDescription(period);
  let current = newPlayerEmbed();
  for (const player of report.players) {
    const field = playerField(player);
    if (current.data.fields?.length >= 25 || current.length + field.name.length + field.value.length > 5900) {
      embeds.push(current.toJSON());
      current = newPlayerEmbed();
    }
    current.addFields(field);
  }
  embeds.push(current.toJSON());

  // Each embed is sent separately to respect Discord's per-message limits.
  let description = period;
  const pushFindings = () => embeds.push(new EmbedBuilder()
    .setColor("Gold")
    .setTitle("📋 Boletim semanal do Geriátrico — 2. Achados gerais")
    .setDescription(description)
    .toJSON());
  for (const line of findings(report)) {
    // Large rosters can produce long ties; split those lines as well.
    for (let offset = 0; offset < line.length; offset += 3800) {
      const part = line.slice(offset, offset + 3800);
      if (description.length + part.length + 2 > 4000) {
        pushFindings();
        description = period;
      }
      description += `

${part}`;
    }
  }
  pushFindings();
  return embeds;
}
