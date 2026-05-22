import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { adminOnly, requireAuth } from "../middleware/auth.js";
import { listLogs } from "../controllers/logController.js";

const router = Router();
router.get("/", requireAuth, adminOnly, asyncHandler(listLogs));
export default router;
