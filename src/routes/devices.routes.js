import { Router } from "express";
import Device from "../models/Device.js";
import DispatchOrder from "../models/DispatchOrder.js";
import { createCrudController } from "../controllers/crudController.js";
import crudRouter from "./_crudRouter.js";
import asyncHandler from "../utils/asyncHandler.js";
import { canWrite, requireAuth } from "../middleware/auth.js";
import { lockTrip, routeOverride, routeVersion, unlockTrip } from "../controllers/dispatchController.js";

const controller = createCrudController(Device, {
  moduleName: "Device",
  searchable: ["deviceId", "imei"],
  populate: "vehicle",
  afterList: async (items) => {
    const deviceIds = items.map((item) => item.deviceId);
    const activeOrders = await DispatchOrder.find({
      deviceId: { $in: deviceIds },
      status: { $ne: "returned" }
    })
      .populate("vehicle")
      .sort({ departureAt: -1, createdAt: -1 })
      .lean();
    const byDevice = new Map();
    for (const order of activeOrders) {
      if (!byDevice.has(order.deviceId)) byDevice.set(order.deviceId, order);
    }
    return items.map((item) => {
      const order = byDevice.get(item.deviceId);
      return {
        ...item,
        activeVehicle: order?.vehicle || null,
        activeRouteCode: order?.routeCode || ""
      };
    });
  },
  filterBuilder: (query) => {
    const now = new Date();
    if (query.status === "expiring") {
      return {
        skipStatus: true,
        expiredAt: { $lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) }
      };
    }
    if (query.status === "maintenance_due") {
      return {
        skipStatus: true,
        nextMaintenanceAt: { $lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) }
      };
    }
    return null;
  }
});

const router = Router();
router.post("/:deviceId/route-override", requireAuth, canWrite, asyncHandler(routeOverride));
router.post("/:deviceId/route-version", requireAuth, canWrite, asyncHandler(routeVersion));
router.post("/:deviceId/unlock-trip", requireAuth, canWrite, asyncHandler(unlockTrip));
router.post("/:deviceId/lock-trip", requireAuth, canWrite, asyncHandler(lockTrip));
router.use("/", crudRouter(controller));

export default router;
