import crypto from "node:crypto";
import Route from "../models/Route.js";
import RouteDirection from "../models/RouteDirection.js";
import Stop from "../models/Stop.js";
import { AppError } from "../utils/errors.js";

function routeVersion(route) {
  if (route.version !== undefined && route.version !== null && route.version !== "") {
    return String(route.version);
  }
  return route.updatedAt?.toISOString?.() || route.createdAt?.toISOString?.() || "";
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");
}

function normalizeStop(stop, directionStop) {
  return {
    stopCode: String(stop.stopCode || stop.code || directionStop.stopCode || ""),
    name: String(stop.name || stop.stopName || ""),
    lat: Number(stop.lat ?? stop.latitude),
    lng: Number(stop.lng ?? stop.lon ?? stop.longitude),
    audio: String(stop.audio || stop.audioFile || stop.stopCode || directionStop.stopCode || ""),
    order: Number(directionStop.order)
  };
}

function reorderStops(stops) {
  return stops.map((stop, index) => ({
    ...stop,
    order: index + 1
  }));
}

async function buildDirectionStops(routeCode, direction) {
  const routeDirection = await RouteDirection.findOne({ routeCode, direction, status: "active" })
    .populate("stops.stop")
    .lean();
  if (!routeDirection?.stops?.length) return [];

  const sortedDirectionStops = [...routeDirection.stops].sort((a, b) => Number(a.order) - Number(b.order));
  const stopCodes = sortedDirectionStops.map((item) => item.stopCode).filter(Boolean);
  const fallbackStops = await Stop.find({ stopCode: { $in: stopCodes } }).lean();
  const stopByCode = new Map(fallbackStops.map((stop) => [stop.stopCode, stop]));

  return reorderStops(sortedDirectionStops
    .map((item) => ({ directionStop: item, stop: item.stop || stopByCode.get(item.stopCode) }))
    .filter((item) => item.stop)
    .map((item) => normalizeStop(item.stop, item.directionStop)));
}

export function espRouteDownloadUrl(routeCode) {
  const encoded = encodeURIComponent(routeCode);
  const token = process.env.ESP_ROUTE_DOWNLOAD_TOKEN;
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${publicBaseUrl()}/api/esp/routes/${encoded}.json${tokenQuery}`;
}

export async function buildEspRouteJson(routeCode) {
  const route = await Route.findOne({ routeCode }).lean();
  if (!route) throw new AppError("Route not found", 404);

  const forwardStops = await buildDirectionStops(route.routeCode, "outbound");
  const explicitBackwardStops = await buildDirectionStops(route.routeCode, "inbound");
  const backwardStops = explicitBackwardStops.length
    ? explicitBackwardStops
    : reorderStops([...forwardStops].reverse());

  if (!forwardStops.length && !backwardStops.length) throw new AppError("Route stops not found", 404);

  return {
    routeCode: String(route.routeCode || route.code || ""),
    version: routeVersion(route),
    fare: String(route.fare ?? route.ticketPrice ?? ""),
    updatedAt: route.updatedAt?.toISOString?.() || route.createdAt?.toISOString?.() || "",
    directions: {
      FORWARD: {
        label: "DI",
        stops: forwardStops
      },
      BACKWARD: {
        label: "VE",
        stops: backwardStops
      }
    }
  };
}

export async function getEspRouteMetadata(routeCode) {
  const routeJson = await buildEspRouteJson(routeCode);
  const jsonString = JSON.stringify(routeJson);
  return {
    routeJson,
    jsonString,
    version: routeJson.version,
    size: Buffer.byteLength(jsonString, "utf8"),
    checksum: crypto.createHash("sha256").update(jsonString, "utf8").digest("hex"),
    url: espRouteDownloadUrl(routeJson.routeCode)
  };
}
