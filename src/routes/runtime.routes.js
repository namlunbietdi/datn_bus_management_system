import { Router } from "express";
import { routeConfig, routeManifest } from "../controllers/runtimeController.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

router.get("/manifest", asyncHandler(routeManifest));
router.get("/routes/:routeCode", asyncHandler(routeConfig));

export default router;
