import { collectWeeklyReport } from "./collectWeeklyReport.js";
import { buildWeeklyEmbeds, previousWeek, WEEK } from "../reports/weeklyReport.js";
import { createWeeklyReportStore } from "../repos/weeklyReportStore.js";

export class WeeklyReportBusyError extends Error {
  constructor() {
    super("A weekly report is already being generated");
    this.name = "WeeklyReportBusyError";
  }
}

export function createWeeklyReporter(client, {
  channelId = process.env.DISCORD_CHANNEL_ID,
  collectReport = collectWeeklyReport,
  store = createWeeklyReportStore(),
} = {}) {
  let running = false;
  return {
    async post({ scheduled = false, now = new Date(), hourUtc = 9 } = {}) {
      if (running) throw new WeeklyReportBusyError();
      running = true;
      try {
        if (!channelId) throw new Error("DISCORD_CHANNEL_ID is not configured");
        let period = previousWeek(now);
        if (scheduled && now.getTime() / 1000 < period.to + hourUtc * 3600) {
          period = { from: period.from - WEEK, to: period.to - WEEK };
        }
        let state = scheduled ? store.load() : null;
        if (state?.channelId !== channelId) state = null;
        if (state && state.sent === state.embeds.length) {
          if (state.weekEnd >= period.to) return { posted: false, reason: "already-posted" };
          state = null;
        }
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isSendable()) throw new Error("Weekly report channel is not sendable");
        if (!state) {
          const report = await collectReport(period);
          state = { weekEnd: period.to, channelId, embeds: buildWeeklyEmbeds(report), sent: 0 };
          if (scheduled) store.save(state);
        }
        // Persist the rendered report and delivery progress so a failed second
        // message can resume without regenerating or repeating the first one.
        let messagesPosted = 0;
        while (state.sent < state.embeds.length) {
          await channel.send({ embeds: [state.embeds[state.sent]], allowedMentions: { parse: [] } });
          state.sent++;
          messagesPosted++;
          if (scheduled) store.save(state);
        }
        return { posted: true, messagesPosted, from: state.weekEnd - WEEK, to: state.weekEnd };
      } finally {
        running = false;
      }
    },
  };
}

export function startWeeklyReportScheduler(reporter, {
  enabled = process.env.WEEKLY_REPORT_ENABLED !== "false",
  hourUtc = Number(process.env.WEEKLY_REPORT_HOUR_UTC ?? 9),
  logger = console,
} = {}) {
  if (!enabled) return () => {};
  if (!Number.isInteger(hourUtc) || hourUtc < 0 || hourUtc > 23) {
    throw new Error("WEEKLY_REPORT_HOUR_UTC must be an integer from 0 to 23");
  }
  let retryAfter = 0;
  const tick = async () => {
    if (Date.now() < retryAfter) return;
    try {
      const result = await reporter.post({ scheduled: true, hourUtc });
      if (result.posted) logger.log(`Posted scheduled weekly report ending ${new Date(result.to * 1000).toISOString()}`);
    } catch (error) {
      if (error instanceof WeeklyReportBusyError) return;
      retryAfter = Date.now() + 5 * 60_000;
      logger.error("Scheduled weekly report failed; retrying in five minutes:", error);
    }
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
