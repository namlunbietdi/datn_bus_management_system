import { Router } from "express";
import { publicStops, stopArrivals } from "../controllers/publicController.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

router.get("/stops", asyncHandler(publicStops));
router.get("/stops/:stopCode/arrivals", asyncHandler(stopArrivals));

export default router;
