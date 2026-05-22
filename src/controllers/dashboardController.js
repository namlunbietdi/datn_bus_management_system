import Vehicle from "../models/Vehicle.js";
import Device from "../models/Device.js";
import Route from "../models/Route.js";
import DispatchOrder from "../models/DispatchOrder.js";
import { mqttStatus } from "../services/mqttService.js";
import { ok } from "../utils/apiResponse.js";

export async function summary(_req, res) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [totalVehicles, onlineDevices, totalDevices, totalRoutes, warningDevices, dispatchToday] = await Promise.all([
    Vehicle.countDocuments(),
    Device.countDocuments({ status: "online" }),
    Device.countDocuments(),
    Route.countDocuments(),
    Device.countDocuments({
      $or: [
        { status: { $in: ["maintenance", "expired"] } },
        { expiredAt: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
        { nextMaintenanceAt: { $lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } }
      ]
    }),
    DispatchOrder.countDocuments({ createdAt: { $gte: today } })
  ]);

  ok(res, {
    totalVehicles,
    onlineVehicles: onlineDevices,
    offlineVehicles: Math.max(totalDevices - onlineDevices, 0),
    totalRoutes,
    totalDevices,
    warningDevices,
    dispatchToday,
    mqtt: mqttStatus()
  });
}
