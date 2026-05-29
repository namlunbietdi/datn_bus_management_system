import path from "node:path";
import Route from "../models/Route.js";
import RouteDirection from "../models/RouteDirection.js";
import Stop from "../models/Stop.js";
import { ok } from "../utils/apiResponse.js";
import { AppError } from "../utils/errors.js";
import { exportAllRoutes, exportRoute } from "../services/routeExportService.js";
import { logActivity } from "../services/activityService.js";

const routeWritableFields = ["routeCode", "displayName", "startPoint", "endPoint", "operatingTime", "frequency", "fare", "status"];

async function routePayload(body = {}) {
  const payload = {};
  for (const field of routeWritableFields) {
    if (Object.hasOwn(body, field)) payload[field] = body[field];
  }

  if (Object.hasOwn(payload, "fare")) {
    if (payload.fare === "" || payload.fare === null) {
      delete payload.fare;
    } else {
      const fare = Number(payload.fare);
      if (!Number.isFinite(fare) || fare < 0) throw new AppError("Giá vé không hợp lệ", 400);
      payload.fare = fare;
    }
  }

  for (const field of ["startPoint", "endPoint"]) {
    const value = String(payload[field] || "").trim();
    if (!value) continue;
    const stop = await Stop.findOne({
      terminal: true,
      $or: [{ stopCode: value }, { name: value }]
    }).select("stopCode name").lean();
    if (!stop) throw new AppError("Điểm đầu/cuối phải là điểm dừng terminal", 400);
    payload[field] = stop.name || stop.stopCode;
  }

  return payload;
}

export async function listRoutes(req, res) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "").trim();
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { routeCode: { $regex: search, $options: "i" } },
      { displayName: { $regex: search, $options: "i" } }
    ];
  }

  const [routes, total] = await Promise.all([
    Route.find(filter).select("-geoJson").sort({ routeCode: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Route.countDocuments(filter)
  ]);

  const counts = await RouteDirection.find({ routeCode: { $in: routes.map((route) => route.routeCode) } }).lean();
  const countMap = new Map(counts.map((item) => [`${item.routeCode}:${item.direction}`, item.stops.length]));
  ok(res, {
    items: routes.map((route) => ({
      ...route,
      hasGeoJson: Boolean(route.outboundGeoJsonName || route.inboundGeoJsonName || route.geoJsonName),
      hasOutboundGeoJson: Boolean(route.outboundGeoJsonName || route.outboundGeoJsonUpdatedAt),
      hasInboundGeoJson: Boolean(route.inboundGeoJsonName || route.inboundGeoJsonUpdatedAt),
      outboundCount: countMap.get(`${route.routeCode}:outbound`) || 0,
      inboundCount: countMap.get(`${route.routeCode}:inbound`) || 0
    })),
    total,
    page,
    limit
  });
}

export async function getRoute(req, res) {
  const route = await Route.findById(req.params.id).lean();
  if (!route) throw new AppError("Route not found", 404);
  const directions = await RouteDirection.find({ routeCode: route.routeCode }).populate("stops.stop").lean();
  ok(res, { ...route, directions });
}

function normalizeDirection(direction) {
  if (direction === "BACKWARD" || direction === "inbound") return "inbound";
  if (direction === "FORWARD" || direction === "outbound") return "outbound";
  return null;
}

function routeGeoJsonByDirection(route, direction) {
  if (direction === "inbound") {
    return {
      direction,
      geoJson: route.inboundGeoJson,
      name: route.inboundGeoJsonName,
      updatedAt: route.inboundGeoJsonUpdatedAt
    };
  }
  return {
    direction: "outbound",
    geoJson: route.outboundGeoJson || route.geoJson,
    name: route.outboundGeoJsonName || route.geoJsonName,
    updatedAt: route.outboundGeoJsonUpdatedAt || route.geoJsonUpdatedAt
  };
}

function normalizeDirectionStop(stop, directionStop) {
  return {
    stopCode: String(stop?.stopCode || directionStop.stopCode || ""),
    name: String(stop?.name || ""),
    lat: Number(stop?.lat),
    lon: Number(stop?.lon),
    order: Number(directionStop.order),
    terminal: Boolean(directionStop.terminal)
  };
}

async function routeStopsByDirection(routeCode, direction) {
  const routeDirection = await RouteDirection.findOne({ routeCode, direction, status: "active" })
    .populate("stops.stop")
    .lean();
  if (!routeDirection?.stops?.length) return [];

  const sortedDirectionStops = [...routeDirection.stops].sort((a, b) => Number(a.order) - Number(b.order));
  const stopCodes = sortedDirectionStops.map((item) => item.stopCode).filter(Boolean);
  const fallbackStops = stopCodes.length ? await Stop.find({ stopCode: { $in: stopCodes } }).lean() : [];
  const stopByCode = new Map(fallbackStops.map((stop) => [stop.stopCode, stop]));

  return sortedDirectionStops
    .map((item) => normalizeDirectionStop(item.stop || stopByCode.get(item.stopCode), item))
    .filter((stop) => stop.stopCode && Number.isFinite(stop.lat) && Number.isFinite(stop.lon));
}

export async function getGeoJsonByRouteCode(req, res) {
  const direction = normalizeDirection(req.query.direction);
  if (!direction) throw new AppError("Invalid GeoJSON direction", 400);

  const route = await Route.findOne({ routeCode: req.params.routeCode }).lean();
  if (!route) throw new AppError("Route not found", 404);

  const result = routeGeoJsonByDirection(route, direction);
  if (!result.geoJson) throw new AppError("GeoJSON route direction not found", 404);
  const stops = await routeStopsByDirection(route.routeCode, direction);

  ok(res, {
    routeCode: route.routeCode,
    displayName: route.displayName,
    stops,
    ...result
  });
}

export async function createRoute(req, res) {
  const route = await Route.create(await routePayload(req.body));
  await logActivity({ user: req.user, action: "create", module: "Route", targetId: route._id.toString() });
  ok(res, route, 201);
}

export async function updateRoute(req, res) {
  const route = await Route.findByIdAndUpdate(req.params.id, await routePayload(req.body), { new: true, runValidators: true });
  if (!route) throw new AppError("Route not found", 404);
  await logActivity({ user: req.user, action: "update", module: "Route", targetId: route._id.toString() });
  ok(res, route);
}

export async function deleteRoute(req, res) {
  const route = await Route.findByIdAndDelete(req.params.id);
  if (!route) throw new AppError("Route not found", 404);
  await RouteDirection.deleteMany({ routeCode: route.routeCode });
  await logActivity({ user: req.user, action: "delete", module: "Route", targetId: route._id.toString() });
  ok(res, { id: req.params.id });
}

export async function updateDirection(req, res) {
  const { direction, stops } = req.body;
  if (!["outbound", "inbound"].includes(direction)) throw new AppError("Invalid direction", 400);
  if (!Array.isArray(stops)) throw new AppError("Stops must be an array", 400);
  const route = await Route.findOne({ routeCode: req.params.routeCode });
  if (!route) throw new AppError("Route not found", 404);

  const stopCodes = stops.map((item) => item.stopCode).filter(Boolean);
  const stopDocs = await Stop.find({ stopCode: { $in: stopCodes } }).lean();
  const byCode = new Map(stopDocs.map((stop) => [stop.stopCode, stop]));
  const ordered = stops.map((item, index) => {
    const stop = byCode.get(item.stopCode);
    if (!stop) throw new AppError(`Stop not found: ${item.stopCode}`, 400);
    return {
      stop: stop._id,
      stopCode: stop.stopCode,
      order: Number(item.order ?? index + 1),
      terminal: item.terminal
    };
  });

  const routeDirection = await RouteDirection.findOneAndUpdate(
    { routeCode: route.routeCode, direction },
    { route: route._id, routeCode: route.routeCode, direction, stops: ordered, status: "active" },
    { upsert: true, new: true, runValidators: true }
  );
  route.updatedAt = new Date();
  await route.save();
  await logActivity({ user: req.user, action: "update_direction", module: "Route", targetId: route._id.toString() });
  ok(res, routeDirection);
}

export async function increaseVersion(req, res) {
  const route = await Route.findByIdAndUpdate(req.params.id, { $inc: { version: 1 } }, { new: true });
  if (!route) throw new AppError("Route not found", 404);
  await logActivity({ user: req.user, action: "increase_version", module: "Route", targetId: route._id.toString() });
  ok(res, route);
}

function validateGeoJson(value) {
  if (!value || typeof value !== "object") throw new AppError("GeoJSON is required", 400);
  const allowedTypes = new Set([
    "FeatureCollection",
    "Feature",
    "GeometryCollection",
    "LineString",
    "MultiLineString",
    "Point",
    "MultiPoint",
    "Polygon",
    "MultiPolygon"
  ]);
  if (!allowedTypes.has(value.type)) throw new AppError("Invalid GeoJSON type", 400);
}

export async function updateGeoJson(req, res) {
  const route = await Route.findById(req.params.id);
  if (!route) throw new AppError("Route not found", 404);
  const { geoJson, fileName, direction } = req.body;
  validateGeoJson(geoJson);
  if (!["outbound", "inbound"].includes(direction)) throw new AppError("Invalid GeoJSON direction", 400);
  const now = new Date();
  if (direction === "outbound") {
    route.outboundGeoJson = geoJson;
    route.outboundGeoJsonName = fileName || `${route.routeCode}_outbound.geojson`;
    route.outboundGeoJsonUpdatedAt = now;
  } else {
    route.inboundGeoJson = geoJson;
    route.inboundGeoJsonName = fileName || `${route.routeCode}_inbound.geojson`;
    route.inboundGeoJsonUpdatedAt = now;
  }
  await route.save();
  await logActivity({
    user: req.user,
    action: "update_geojson",
    module: "Route",
    targetId: route._id.toString(),
    metadata: { routeCode: route.routeCode, direction, fileName }
  });
  ok(res, {
    id: route._id,
    routeCode: route.routeCode,
    direction,
    geoJsonName: direction === "outbound" ? route.outboundGeoJsonName : route.inboundGeoJsonName,
    geoJsonUpdatedAt: direction === "outbound" ? route.outboundGeoJsonUpdatedAt : route.inboundGeoJsonUpdatedAt
  });
}

export async function deleteGeoJson(req, res) {
  const { direction } = req.query;
  if (!["outbound", "inbound"].includes(direction)) throw new AppError("Invalid GeoJSON direction", 400);
  const unset = direction === "outbound"
    ? { outboundGeoJson: "", outboundGeoJsonName: "", outboundGeoJsonUpdatedAt: "" }
    : { inboundGeoJson: "", inboundGeoJsonName: "", inboundGeoJsonUpdatedAt: "" };
  const route = await Route.findByIdAndUpdate(req.params.id, { $unset: unset }, { new: true });
  if (!route) throw new AppError("Route not found", 404);
  await logActivity({
    user: req.user,
    action: "delete_geojson",
    module: "Route",
    targetId: route._id.toString(),
    metadata: { routeCode: route.routeCode, direction }
  });
  ok(res, { id: route._id, routeCode: route.routeCode, direction });
}

export async function exportOne(req, res) {
  const pretty = req.query.pretty === "1";
  const { filePath, fileName, config } = await exportRoute(req.params.routeCode, pretty);
  await logActivity({
    user: req.user,
    action: "export_route_json",
    module: "Route",
    targetId: req.params.routeCode,
    metadata: { fileName }
  });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  if (req.query.inline === "1") {
    ok(res, config);
    return;
  }
  res.sendFile(path.resolve(filePath));
}

export async function exportAll(req, res) {
  const { zipPath, manifest } = await exportAllRoutes();
  await logActivity({ user: req.user, action: "export_all_routes", module: "Route", metadata: manifest });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="routes_export.zip"');
  res.sendFile(path.resolve(zipPath));
}
