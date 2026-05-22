import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { canWrite, requireAuth } from "../middleware/auth.js";
import { createDispatchOrder, getOrder, listOrders, returnToDepot } from "../controllers/dispatchController.js";

const router = Router();
router.get("/", requireAuth, asyncHandler(listOrders));
router.post("/", requireAuth, canWrite, asyncHandler(createDispatchOrder));
router.post("/:id/return-depot", requireAuth, canWrite, asyncHandler(returnToDepot));
router.get("/:id", requireAuth, asyncHandler(getOrder));
export default router;
