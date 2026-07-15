const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const agentController = require("../controllers/agentController");

/**
 * Internal server-to-server endpoint gate. `/parse-report` accepts a userId in
 * its body and writes parsed lab data into that user's account, and fetches a
 * remote fileUrl — so it must never be publicly reachable. Callers present the
 * shared AGENT_SECRET via the `x-agent-secret` header.
 *
 * Fails CLOSED: if AGENT_SECRET is unset the endpoint is disabled entirely. A
 * previous version had no auth at all, exposing SSRF + arbitrary-user report
 * writes + AI-cost abuse to anonymous callers.
 */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function requireAgentSecret(req, res, next) {
  const configured = process.env.AGENT_SECRET;
  if (!configured) {
    return res.sendError("Endpoint disabled", 503);
  }
  if (!safeEqual(req.get("x-agent-secret") || "", configured)) {
    return res.sendError("Unauthorized", 401);
  }
  next();
}

router.post("/parse-report", requireAgentSecret, agentController.parseReport);

module.exports = router;
