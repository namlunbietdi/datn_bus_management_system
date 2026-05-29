import DeviceLastState from "../models/DeviceLastState.js";
import LocationLog from "../models/LocationLog.js";
import DispatchOrder from "../models/DispatchOrder.js";
import Device from "../models/Device.js";
import RouteDirection from "../models/RouteDirection.js";
import Stop from "../models/Stop.js";
import { ok } from "../utils/apiResponse.js";
import { directionToContract, directionToDb } from "../contracts/runtimeJsonContract.js";

function routeDirectionKey(routeCode, direction) {
  return `${routeCode}:${direction}`;
}

function stopMatchesRuntimeIndex(stop, index, runtimeIndex) {
  const order = Number(stop?.order || index + 1);
  return Number.isInteger(runtimeIndex) && (runtimeIndex === order || (runtimeIndex === 0 && index === 0));
}

function findStopByCode(stops, stopCode) {
  const code = String(stopCode || "").trim();
  return code ? stops.find((stop) => stop.stopCode === code) || null : null;
}

function findStopByRuntimeIndex(stops, runtimeIndex) {
  return stops.find((stop, index) => stopMatchesRuntimeIndex(stop, index, runtimeIndex)) || null;
}

function nextStopAfterCurrent(stops, currentStop) {
  if (!Number.isInteger(currentStop)) return null;
  if (currentStop === 0) return stops[0] || null;

  const currentIndex = stops.findIndex((stop, index) => stopMatchesRuntimeIndex(stop, index, currentStop));
  if (currentIndex < 0) return null;
  return stops[currentIndex + 1] || stops[currentIndex] || null;
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

function distanceMeters(aLat, aLon, bLat, bLon) {
  const earthRadius = 6371000;
  const dLat = degreesToRadians(bLat - aLat);
  const dLon = degreesToRadians(bLon - aLon);
  const lat1 = degreesToRadians(aLat);
  const lat2 = degreesToRadians(bLat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDegrees(aLat, aLon, bLat, bLon) {
  const lat1 = degreesToRadians(aLat);
  const lat2 = degreesToRadians(bLat);
  const dLon = degreesToRadians(bLon - aLon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angularDifference(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function inferStopFromGps(stops, gps) {
  const lat = Number(gps?.lat);
  const lon = Number(gps?.lng);
  if (!stops.length || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const heading = Number(gps?.heading);
  const candidates = stops
    .filter((stop) => Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lon)))
    .map((stop) => {
      const stopLat = Number(stop.lat);
      const stopLon = Number(stop.lon);
      const bearing = bearingDegrees(lat, lon, stopLat, stopLon);
      return {
        stop,
        distance: distanceMeters(lat, lon, stopLat, stopLon),
        angle: Number.isFinite(heading) ? angularDifference(heading, bearing) : 0
      };
    });
  if (!candidates.length) return null;

  const ahead = Number.isFinite(heading)
    ? candidates.filter((candidate) => candidate.angle <= 100)
    : [];
  const pool = ahead.length ? ahead : candidates;
  pool.sort((a, b) => a.distance - b.distance);
  const maxDistanceMeters = Number(process.env.NEXT_STOP_INFER_MAX_DISTANCE_M || 2000);
  if (Number.isFinite(maxDistanceMeters) && pool[0].distance > maxDistanceMeters) return null;
  return pool[0].stop;
}

function normalizeStopDetail(directionStop, fallbackStop, index) {
  const populatedStop = directionStop.stop
    && typeof directionStop.stop === "object"
    && (directionStop.stop.stopCode || directionStop.stop.name)
    ? directionStop.stop
    : null;
  const stop = populatedStop || fallbackStop || {};
  const lat = Number(stop.lat);
  const lon = Number(stop.lon);
  return {
    stopCode: String(directionStop.stopCode || stop.stopCode || ""),
    name: String(stop.name || ""),
    order: Number(directionStop.order || index + 1),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    terminal: Boolean(directionStop.terminal || stop.terminal)
  };
}

async function loadStopDetailsByRouteDirection(items) {
  const pairByKey = new Map();
  for (const item of items) {
    const routeCode = item.runtime?.routeId || item.planned?.routeId;
    const direction = directionToDb(item.runtime?.direction || item.planned?.direction);
    if (routeCode && direction) pairByKey.set(routeDirectionKey(routeCode, direction), { routeCode, direction });
  }

  const pairs = [...pairByKey.values()];
  if (!pairs.length) return new Map();

  const routeDirections = await RouteDirection.find({
    status: "active",
    $or: pairs.map((pair) => ({ routeCode: pair.routeCode, direction: pair.direction }))
  })
    .populate("stops.stop")
    .lean();

  const stopCodes = new Set();
  for (const routeDirection of routeDirections) {
    for (const directionStop of routeDirection.stops || []) {
      if (directionStop.stopCode) stopCodes.add(directionStop.stopCode);
    }
  }

  const fallbackStops = stopCodes.size
    ? await Stop.find({ stopCode: { $in: [...stopCodes] } }).lean()
    : [];
  const stopByCode = new Map(fallbackStops.map((stop) => [stop.stopCode, stop]));
  const detailsByKey = new Map();

  for (const routeDirection of routeDirections) {
    const stops = [...(routeDirection.stops || [])]
      .sort((a, b) => Number(a.order) - Number(b.order))
      .map((directionStop, index) => normalizeStopDetail(directionStop, stopByCode.get(directionStop.stopCode), index));
    detailsByKey.set(routeDirectionKey(routeDirection.routeCode, routeDirection.direction), stops);
  }

  return detailsByKey;
}

async function enrichRuntimeStops(items) {
  const detailsByKey = await loadStopDetailsByRouteDirection(items);
  for (const item of items) {
    const routeCode = item.runtime?.routeId || item.planned?.routeId;
    const direction = directionToDb(item.runtime?.direction || item.planned?.direction);
    const stops = detailsByKey.get(routeDirectionKey(routeCode, direction)) || [];
    const currentStop = item.runtime?.currentStop;
    const nextStop = item.runtime?.nextStop;
    item.runtime.currentStopDetail = findStopByCode(stops, item.runtime?.activeStopCode)
      || findStopByRuntimeIndex(stops, currentStop);
    item.runtime.nextStopDetail = findStopByCode(stops, item.runtime?.nextStopCode)
      || findStopByRuntimeIndex(stops, nextStop)
      || nextStopAfterCurrent(stops, currentStop)
      || inferStopFromGps(stops, item.gps)
      || stops[0]
      || null;
  }
}

export async function vehicles(req, res) {
  const search = String(req.query.search || "").trim();
  const now = Date.now();
  const gpsTimeoutMs = Number(process.env.GPS_SIGNAL_TIMEOUT_MS || 2 * 60 * 1000);
  const activeOrders = await DispatchOrder.find({ status: { $in: ["created", "published"] } })
    .populate("vehicle")
    .sort({ departureAt: -1, createdAt: -1 })
    .lean();
  const orderByDevice = new Map();
  for (const order of activeOrders) {
    if (!orderByDevice.has(order.deviceId)) orderByDevice.set(order.deviceId, order);
  }
  const deviceIds = [...orderByDevice.keys()];

  if (!deviceIds.length) {
    ok(res, { items: [], total: 0 });
    return;
  }

  const lastStates = await DeviceLastState.find({ deviceId: { $in: deviceIds } }).lean();
  const byDevice = new Map(lastStates.map((item) => [item.deviceId, item]));
  const devices = deviceIds.length
    ? await Device.find({ deviceId: { $in: deviceIds } }).populate("vehicle").lean()
    : [];
  const deviceById = new Map(devices.map((device) => [device.deviceId, device]));

  const items = deviceIds.map((deviceId) => {
    const order = orderByDevice.get(deviceId);
    const lastState = byDevice.get(deviceId);
    const device = deviceById.get(deviceId);
    const vehicle = order?.vehicle || device?.vehicle;
    const lastSeenAt = lastState?.lastSeenAt || null;
    const hasGps = Boolean(lastState && Number.isFinite(lastState.lat) && Number.isFinite(lastState.lon));
    const gpsFresh = hasGps && lastSeenAt && now - new Date(lastSeenAt).getTime() <= gpsTimeoutMs;
    const statusFresh = lastSeenAt && now - new Date(lastSeenAt).getTime() <= gpsTimeoutMs;
    const status = gpsFresh
      ? (lastState.speed > 1 ? "running" : "stopped")
      : (statusFresh ? (lastState.status || "online") : "signal_lost");
    const runtimeDirection = lastState?.direction
      ? directionToContract(lastState.direction)
      : (order?.direction ? directionToContract(order.direction) : null);
    const runtime = {
      routeId: order?.routeCode || lastState?.routeCode || "",
      direction: runtimeDirection,
      activeStopCode: lastState?.activeStopCode || "",
      nextStopCode: lastState?.nextStopCode || "",
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
      vehiclePlate: vehicle?.plateNumber || lastState?.vehiclePlate || "",
      vehicleCode: vehicle?.vehicleCode || "",
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

  await enrichRuntimeStops(items);

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
