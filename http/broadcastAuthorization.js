import crypto from "node:crypto";

function hasValidBroadcastToken(authorization) {
  const expectedToken = process.env.BROADCAST_API_TOKEN;
  if (!expectedToken || typeof authorization !== "string") return false;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function requireBroadcastAuthorization(req, res, next) {
  if (!process.env.BROADCAST_API_TOKEN) {
    return res.status(503).json({ error: "Broadcast service is not configured" });
  }
  if (!hasValidBroadcastToken(req.get("authorization"))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
