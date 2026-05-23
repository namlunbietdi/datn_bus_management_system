import DeviceLastState from "../models/DeviceLastState.js";
import LocationLog from "../models/LocationLog.js";
import DispatchOrder from "../models/DispatchOrder.js";
import { ok } from "../utils/apiResponse.js";
import { directionToContract } from "../contracts/runtimeJsonContract.js";

export async function vehicles(req, res) {
  const search = String(req.query.search || "").trim();
  const now = Date.now();
  const gpsTimeoutMs = Number(process.env.GPS_SIGNAL_TIMEOUT_MS || 2 * 60 * 1000);
  const activeOrders = await DispatchOrder.find({ status: { $ne: "returned" } })
    .populate("vehicle")
    .sort({ departureAt: -1, createdAt: -1 })
    .lean();
  const orderByDevice = new Map();
  for (const order of activeOrders) {
    if (!orderByDevice.has(order.deviceId)) orderByDevice.set(order.deviceId, order);
  }

  const lastStates = await DeviceLastState.find({
    $or: [
      { deviceId: { $in: activeOrders.map((order) => order.deviceId) } },
      { lastSeenAt: { $gte: new Date(now - gpsTimeoutMs) } },
      { routeCode: { $exists: true, $nin: [null, ""] } }
    ]
  }).lean();
  const byDevice = new Map(lastStates.map((item) => [item.deviceId, item]));
  const deviceIds = [...new Set([...orderByDevice.keys(), ...byDevice.keys()])];

  const items = deviceIds.map((deviceId) => {
    const order = orderByDevice.get(deviceId);
    const lastState = byDevice.get(deviceId);
    const lastSeenAt = lastState?.lastSeenAt || null;
    const hasGps = Boolean(lastState && Number.isFinite(lastState.lat) && Number.isFinite(lastState.lon));
    const gpsFresh = hasGps && lastSeenAt && now - new Date(lastSeenAt).getTime() <= gpsTimeoutMs;
    const statusFresh = lastSeenAt && now - new Date(lastSeenAt).getTime() <= gpsTimeoutMs;
    const status = gpsFresh
      ? (lastState.speed > 1 ? "running" : "stopped")
      : (statusFresh ? (lastState.status || "online") : "signal_lost");
    const runtime = {
      routeId: lastState?.routeCode || order?.routeCode || "",
      direction: lastState?.direction ? directionToContract(lastState.direction) : (order?.direction ? directionToContract(order.direction) : null),
      currentStop: Number.isInteger(lastState?.currentStop) ? lastState.currentStop : null,
      nextStop: Number.isInteger(lastState?.nextStop) ? lastState.nextStop : null,
      tripState: lastState?.tripState || lastState?.runtimeStatus || ""
    };
    const gps = {
      lat: lastState?.lat,
      lng: lastState?.lon,
      speed: lastState?.speed || 0,
      heading: lastState?.heading || 0,
      sat: lastState?.gpsSat,
      fix: lastState?.gpsFix,
      status: gpsFresh ? "ok" : (hasGps ? "lost" : "no_fix"),
      ageSeconds: lastSeenAt ? Math.round((now - new Date(lastSeenAt).getTime()) / 1000) : null
    };
    const network = {
      mqtt: lastState?.networkMqtt,
      signal: lastState?.networkSignal
    };
    return {
      dispatchOrderId: order?._id,
      deviceId,
      vehiclePlate: order?.vehicle?.plateNumber || lastState?.vehiclePlate || "",
      vehicleCode: order?.vehicle?.vehicleCode || "",
      runtime,
      gps,
      network,
      planned: {
        routeId: order?.routeCode || "",
        direction: order?.direction ? directionToContract(order.direction) : null
      },
      stateSource: lastState ? "esp32" : "dispatch_order",
      departureAt: order?.departureAt,
      commandType: order?.commandType,
      routeVersion: lastState?.routeVersion,
      sdReady: lastState?.sdReady,
      queueDepth: lastState?.queueDepth,
      status,
      lastSeenAt,
      lastGpsAgeSeconds: gps.ageSeconds
    };
  }).filter((item) => {
    if (!search) return true;
    const keyword = search.toLowerCase();
    return [item.deviceId, item.vehiclePlate, item.runtime.routeId, item.vehicleCode].some((value) =>
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
