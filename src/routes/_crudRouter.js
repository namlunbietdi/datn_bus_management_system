import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { adminOnly, requireAuth } from "../middleware/auth.js";

export default function crudRouter(controller, writeMiddleware = adminOnly) {
  const router = Router();
  router.get("/", requireAuth, asyncHandler(controller.list));
  router.post("/", requireAuth, writeMiddleware, asyncHandler(controller.create));
  router.get("/:id", requireAuth, asyncHandler(controller.get));
  router.put("/:id", requireAuth, writeMiddleware, asyncHandler(controller.update));
  router.delete("/:id", requireAuth, writeMiddleware, asyncHandler(controller.remove));
  return router;
}
