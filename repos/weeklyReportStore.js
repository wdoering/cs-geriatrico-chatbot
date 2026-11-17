import fs from "node:fs";
import path from "node:path";

export function createWeeklyReportStore(
  filename = process.env.WEEKLY_REPORT_STATE_FILE || "./weekly_report_state.json"
) {
  return {
    load() {
      let content;
      try {
        content = fs.readFileSync(filename, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
      const state = JSON.parse(content);
      if (!Number.isInteger(state.weekEnd) || typeof state.channelId !== "string" ||
          !Array.isArray(state.embeds) || !state.embeds.length ||
          !Number.isInteger(state.sent) || state.sent < 0 || state.sent > state.embeds.length) {
        throw new Error("Invalid weekly report state; refusing to risk reposting it");
      }
      return state;
    },
    save(state) {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      const temporary = `${filename}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
      fs.renameSync(temporary, filename);
    },
  };
}
