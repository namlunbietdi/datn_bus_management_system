import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { deviceHistory, vehicleHistory, vehicles } from "../controllers/monitoringController.js";

const router = Router();
router.get("/vehicles", requireAuth, asyncHandler(vehicles));
router.get("/vehicles/:id/history", requireAuth, asyncHandler(vehicleHistory));
router.get("/devices/:deviceId/history", requireAuth, asyncHandler(deviceHistory));
export default router;
