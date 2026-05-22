import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { adminOnly, requireAuth } from "../middleware/auth.js";
import {
  createRoute,
  deleteGeoJson,
  deleteRoute,
  exportAll,
  exportOne,
  getRoute,
  increaseVersion,
  listRoutes,
  updateGeoJson,
  updateDirection,
  updateRoute
} from "../controllers/routeController.js";

const router = Router();
router.get("/", requireAuth, asyncHandler(listRoutes));
router.post("/", requireAuth, adminOnly, asyncHandler(createRoute));
router.get("/export-all", requireAuth, asyncHandler(exportAll));
router.get("/export/:routeCode", requireAuth, asyncHandler(exportOne));
router.put("/:routeCode/direction", requireAuth, adminOnly, asyncHandler(updateDirection));
router.put("/:id/increase-version", requireAuth, adminOnly, asyncHandler(increaseVersion));
router.put("/:id/geojson", requireAuth, adminOnly, asyncHandler(updateGeoJson));
router.delete("/:id/geojson", requireAuth, adminOnly, asyncHandler(deleteGeoJson));
router.get("/:id", requireAuth, asyncHandler(getRoute));
router.put("/:id", requireAuth, adminOnly, asyncHandler(updateRoute));
router.delete("/:id", requireAuth, adminOnly, asyncHandler(deleteRoute));
export default router;
