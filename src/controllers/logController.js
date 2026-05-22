import ActivityLog from "../models/ActivityLog.js";
import { ok } from "../utils/apiResponse.js";

export async function listLogs(req, res) {
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.module) filter.module = req.query.module;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  const items = await ActivityLog.find(filter)
    .populate("user", "username fullName role")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  ok(res, { items, total: items.length });
}
