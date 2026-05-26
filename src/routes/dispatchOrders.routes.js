import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { canWrite, requireAuth } from "../middleware/auth.js";
import { changeDirection, createDispatchOrder, deleteDispatchOrder, getOrder, listOrders, returnToDepot } from "../controllers/dispatchController.js";

const router = Router();
router.get("/", requireAuth, asyncHandler(listOrders));
router.post("/", requireAuth, canWrite, asyncHandler(createDispatchOrder));
router.post("/:id/change-direction", requireAuth, canWrite, asyncHandler(changeDirection));
router.post("/:id/return-depot", requireAuth, canWrite, asyncHandler(returnToDepot));
router.delete("/:id", requireAuth, canWrite, asyncHandler(deleteDispatchOrder));
router.get("/:id", requireAuth, asyncHandler(getOrder));
export default router;
