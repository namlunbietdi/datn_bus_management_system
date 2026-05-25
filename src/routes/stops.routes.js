import { Router } from "express";
import Stop from "../models/Stop.js";
import { createCrudController } from "../controllers/crudController.js";
import crudRouter from "./_crudRouter.js";
import asyncHandler from "../utils/asyncHandler.js";
import { adminOnly, requireAuth } from "../middleware/auth.js";
import { exportStopTemplate, importStopsCsv } from "../controllers/stopImportController.js";

const STOP_CODE_PREFIX = "HBS";
const STOP_CODE_WIDTH = 4;

async function nextStopCode() {
  const stops = await Stop.find({ stopCode: { $regex: `^${STOP_CODE_PREFIX}\\d+$` } }).select("stopCode").lean();
  const maxNumber = stops.reduce((max, stop) => {
    const number = Number(String(stop.stopCode).slice(STOP_CODE_PREFIX.length));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return `${STOP_CODE_PREFIX}${String(maxNumber + 1).padStart(STOP_CODE_WIDTH, "0")}`;
}

function normalizeStopPayload(payload = {}) {
  const next = { ...payload };
  if (next.stopCode) next.stopCode = String(next.stopCode).trim();
  if (next.stopCode) next.audio = next.stopCode;
  return next;
}

const controller = createCrudController(Stop, {
  moduleName: "Stop",
  searchable: ["stopCode", "name", "address"],
  filterBuilder: (query) => {
    if (query.terminal === "true") return { terminal: true };
    if (query.terminal === "false") return { terminal: false };
    return null;
  },
  beforeCreate: async (payload) => {
    const next = normalizeStopPayload(payload);
    if (!next.stopCode) next.stopCode = await nextStopCode();
    next.audio = next.stopCode;
    return next;
  },
  beforeUpdate: async (payload) => normalizeStopPayload(payload)
});

const router = Router();
router.get("/next-code", requireAuth, asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { stopCode: await nextStopCode() } });
}));
router.get("/import-template", requireAuth, asyncHandler(exportStopTemplate));
router.post("/import-csv", requireAuth, adminOnly, asyncHandler(importStopsCsv));
router.use("/", crudRouter(controller));

export default router;
