import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { summary } from "../controllers/dashboardController.js";

const router = Router();
router.get("/summary", requireAuth, asyncHandler(summary));
export default router;
