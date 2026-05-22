import DeviceLastState from "../models/DeviceLastState.js";
import LocationLog from "../models/LocationLog.js";
import DispatchOrder from "../models/DispatchOrder.js";
import { ok } from "../utils/apiResponse.js";

export async function vehicles(req, res) {
  const search = String(req.query.search || "").trim();
  const activeOrders = await DispatchOrder.find({ status: { $ne: "returned" } })
    .populate("vehicle")
    .sort({ departureAt: -1, createdAt: -1 })
    .lean();
  const lastStates = await DeviceLastState.find({
    deviceId: { $in: activeOrders.map((order) => order.deviceId) }
  }).lean();
  const byDevice = new Map(lastStates.map((item) => [item.deviceId, item]));
  const now = Date.now();
  const gpsTimeoutMs = Number(process.env.GPS_SIGNAL_TIMEOUT_MS || 2 * 60 * 1000);

  const items = activeOrders.map((order) => {
    const lastState = byDevice.get(order.deviceId);
    const lastSeenAt = lastState?.lastSeenAt || null;
    const hasGps = Boolean(lastState && Number.isFinite(lastState.lat) && Number.isFinite(lastState.lon));
    const gpsFresh = hasGps && lastSeenAt && now - new Date(lastSeenAt).getTime() <= gpsTimeoutMs;
    const status = gpsFresh ? (lastState.speed > 1 ? "running" : "stopped") : "signal_lost";
    return {
      dispatchOrderId: order._id,
      deviceId: order.deviceId,
      vehiclePlate: order.vehicle?.plateNumber || lastState?.vehiclePlate || "",
      vehicleCode: order.vehicle?.vehicleCode || "",
      routeCode: order.routeCode,
      direction: order.direction,
      departureAt: order.departureAt,
      commandType: order.commandType,
      lat: lastState?.lat,
      lon: lastState?.lon,
      speed: lastState?.speed || 0,
      heading: lastState?.heading || 0,
      status,
      gpsStatus: gpsFresh ? "ok" : "lost",
      lastSeenAt,
      lastGpsAgeSeconds: lastSeenAt ? Math.round((now - new Date(lastSeenAt).getTime()) / 1000) : null
    };
  }).filter((item) => {
    if (!search) return true;
    const keyword = search.toLowerCase();
    return [item.deviceId, item.vehiclePlate, item.routeCode, item.vehicleCode].some((value) =>
      String(value || "").toLowerCase().includes(keyword)
    );
  });

  ok(res, { items, total: items.length });
}

export async function vehicleHistory(req, res) {
  const items = await LocationLog.find({ vehiclePlate: req.params.id }).sort({ timestamp: -1 }).limit(200).lean();
  ok(res, { items });
}

export async function deviceHistory(req, res) {
  const items = await LocationLog.find({ deviceId: req.params.deviceId }).sort({ timestamp: -1 }).limit(200).lean();
  ok(res, { items });
}
