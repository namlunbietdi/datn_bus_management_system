import fs from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import Route from "../models/Route.js";
import RouteDirection from "../models/RouteDirection.js";
import Stop from "../models/Stop.js";
import { AppError } from "../utils/errors.js";

function exportDir() {
  return path.resolve(process.cwd(), process.env.EXPORT_DIR || "exports");
}

function routeFileName(routeCode) {
  return `route_${routeCode}.json`;
}

function compactStop(stop, index, total, directionStop = {}) {
  const terminal = typeof directionStop.terminal === "boolean"
    ? directionStop.terminal
    : index === 0 || index === total - 1 || Boolean(stop.terminal);

  return {
    stopCode: stop.stopCode,
    name: stop.name,
    lat: Number(stop.lat),
    lon: Number(stop.lon),
    terminal,
    audio: stop.audio || stop.stopCode
  };
}

async function buildDirection(routeCode, direction) {
  const routeDirection = await RouteDirection.findOne({ routeCode, direction })
    .populate("stops.stop")
    .lean();

  if (!routeDirection) return [];

  const sortedStops = [...routeDirection.stops].sort((a, b) => a.order - b.order);
  const stopCodes = sortedStops.map((item) => item.stopCode);
  const fallbackStops = await Stop.find({ stopCode: { $in: stopCodes } }).lean();
  const byCode = new Map(fallbackStops.map((stop) => [stop.stopCode, stop]));

  return sortedStops
    .map((item) => item.stop || byCode.get(item.stopCode))
    .filter(Boolean)
    .map((stop, index, all) => compactStop(stop, index, all.length, sortedStops[index]));
}

export async function buildRouteConfig(routeCode) {
  const route = await Route.findOne({ routeCode }).lean();
  if (!route) throw new AppError("Route not found", 404);

  return {
    version: Number(route.version || 1),
    routeCode: route.routeCode,
    displayName: route.displayName,
    outbound: await buildDirection(route.routeCode, "outbound"),
    inbound: await buildDirection(route.routeCode, "inbound")
  };
}

export async function exportRoute(routeCode, pretty = false) {
  const config = await buildRouteConfig(routeCode);
  const dir = exportDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, routeFileName(config.routeCode));
  await fs.writeFile(filePath, JSON.stringify(config, null, pretty ? 2 : 0));
  return { config, filePath, fileName: path.basename(filePath) };
}

function zipDirectory(files, zipPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve(zipPath));
    archive.on("error", reject);
    archive.pipe(output);
    for (const file of files) {
      archive.file(file.path, { name: file.name });
    }
    archive.finalize();
  });
}

export async function exportAllRoutes() {
  const routes = await Route.find({}).sort({ routeCode: 1 }).lean();
  const dir = exportDir();
  await fs.mkdir(dir, { recursive: true });

  const files = [];
  const manifest = { routes: [] };
  for (const route of routes) {
    const { filePath, fileName } = await exportRoute(route.routeCode, false);
    files.push({ path: filePath, name: fileName });
    manifest.routes.push({
      routeCode: route.routeCode,
      file: fileName,
      version: Number(route.version || 1)
    });
  }

  const manifestPath = path.join(dir, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  files.push({ path: manifestPath, name: "manifest.json" });

  const zipPath = path.join(dir, "routes_export.zip");
  await zipDirectory(files, zipPath);
  return { zipPath, manifest };
}
