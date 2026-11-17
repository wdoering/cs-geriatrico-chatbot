import { Router } from "express";
import { requireBroadcastAuthorization } from "./broadcastAuthorization.js";
import { WeeklyReportBusyError } from "../services/postWeeklyReport.js";

export function weeklyReportRouter(reporter, isReady, logger = console) {
  const router = Router();
  router.post("/weeklyReport", requireBroadcastAuthorization, async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: "Discord is not ready" });
    try {
      const result = await reporter.post();
      res.json({ success: true, ...result });
    } catch (error) {
      if (error instanceof WeeklyReportBusyError) {
        return res.status(409).json({ error: error.message });
      }
      logger.error("Error posting weekly report:", error);
      res.status(502).json({ error: "Failed to post weekly report" });
    }
  });
  return router;
}
