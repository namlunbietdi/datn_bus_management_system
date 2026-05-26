import DeviceLastState from "../models/DeviceLastState.js";
import Route from "../models/Route.js";
import RouteDirection from "../models/RouteDirection.js";
import Stop from "../models/Stop.js";
import { ok } from "../utils/apiResponse.js";
import { AppError } from "../utils/errors.js";

function normalizeDirection(direction) {
  const value = String(direction || "").toLowerCase();
  if (["backward", "inbound", "ve", "down"].includes(value)) return "inbound";
  if (["forward", "outbound", "di", "up"].includes(value)) return "outbound";
  return "";
}

function directionLabel(direction) {
  return normalizeDirection(direction) === "inbound" ? "Chiều về" : "Chiều đi";
}

function validCoordinate(lat, lon) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));
}

function sortDirectionStops(stops = []) {
  return [...stops].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function stopPosition(routeDirection, stopCode) {
  const stops = sortDirectionStops(routeDirection.stops);
  const index = stops.findIndex((item) => item.stopCode === stopCode);
  if (index < 0) return null;
  return {
    index,
    order: Number(stops[index].order || index + 1),
    displayIndex: index + 1
  };
}

function vehiclePositionState(vehicle, target) {
  const activeStopCode = String(vehicle.activeStopCode || "");
  const nextStopCode = String(vehicle.nextStopCode || "");
  const currentStop = Number(vehicle.currentStop);
  const nextStop = Number(vehicle.nextStop);

  if (nextStopCode && nextStopCode === target.stopCode) {
    return { rank: 0, status: "approaching", etaText: "Sắp đến", stopsAway: 0 };
  }

  if (activeStopCode && activeStopCode === target.stopCode) {
    return { rank: 0, status: "at_stop", etaText: "Đang tại điểm dừng", stopsAway: 0 };
  }

  const candidateTargets = new Set([target.order, target.displayIndex]);
  if (Number.isInteger(nextStop)) {
    for (const targetNumber of candidateTargets) {
      if (nextStop === targetNumber) {
        return { rank: 0, status: "approaching", etaText: "Sắp đến", stopsAway: 0 };
      }
      if (nextStop < targetNumber) {
        const stopsAway = targetNumber - nextStop + 1;
        return {
          rank: stopsAway,
          status: "incoming",
          etaText: `Còn ${stopsAway} điểm dừng`,
          stopsAway
        };
      }
    }
  }

  if (Number.isInteger(currentStop)) {
    for (const targetNumber of candidateTargets) {
      if (currentStop < targetNumber) {
        const stopsAway = targetNumber - currentStop;
        return {
          rank: stopsAway + 0.5,
          status: "incoming",
          etaText: stopsAway <= 1 ? "Sắp đến" : `Còn ${stopsAway} điểm dừng`,
          stopsAway
        };
      }
    }
  }

  return null;
}

export async function publicStops(req, res) {
  const search = String(req.query.search || "").trim();
  const filter = {};
  if (search) {
    filter.$or = [
      { stopCode: { $regex: search, $options: "i" } },
      { name: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } }
    ];
  }

  const stops = await Stop.find(filter)
    .select("stopCode name lat lon address terminal")
    .sort({ stopCode: 1 })
    .limit(1000)
    .lean();

  const items = stops
    .filter((stop) => validCoordinate(stop.lat, stop.lon))
    .map((stop) => ({
      stopCode: stop.stopCode,
      name: stop.name,
      lat: Number(stop.lat),
      lon: Number(stop.lon),
      address: stop.address || "",
      terminal: Boolean(stop.terminal)
    }));

  ok(res, { items, total: items.length });
}

export async function stopArrivals(req, res) {
  const stopCode = String(req.params.stopCode || "").trim();
  const stop = await Stop.findOne({ stopCode }).select("stopCode name lat lon address").lean();
  if (!stop) throw new AppError("Không tìm thấy điểm dừng", 404);

  const routeDirections = await RouteDirection.find({
    status: "active",
    "stops.stopCode": stop.stopCode
  })
    .select("routeCode direction stops")
    .lean();

  if (!routeDirections.length) {
    ok(res, {
      stop: {
        stopCode: stop.stopCode,
        name: stop.name,
        lat: Number(stop.lat),
        lon: Number(stop.lon),
        address: stop.address || ""
      },
      arrivals: [],
      updatedAt: new Date().toISOString()
    });
    return;
  }

  const routeCodes = [...new Set(routeDirections.map((item) => item.routeCode))];
  const routes = await Route.find({ routeCode: { $in: routeCodes } })
    .select("routeCode displayName startPoint endPoint")
    .lean();
  const routeByCode = new Map(routes.map((route) => [route.routeCode, route]));

  const now = Date.now();
  const gpsTimeoutMs = Number(process.env.GPS_SIGNAL_TIMEOUT_MS || 2 * 60 * 1000);
  const vehicles = await DeviceLastState.find({
    routeCode: { $in: routeCodes },
    lastSeenAt: { $gte: new Date(now - gpsTimeoutMs) }
  })
    .select("vehiclePlate routeCode direction lat lon speed heading activeStopCode nextStopCode currentStop nextStop lastSeenAt status")
    .lean();

  const arrivals = [];
  for (const vehicle of vehicles) {
    if (!validCoordinate(vehicle.lat, vehicle.lon)) continue;

    const vehicleDirection = normalizeDirection(vehicle.direction);
    const candidates = routeDirections.filter((item) =>
      item.routeCode === vehicle.routeCode &&
      (!vehicleDirection || normalizeDirection(item.direction) === vehicleDirection)
    );

    for (const routeDirection of candidates) {
      const target = stopPosition(routeDirection, stop.stopCode);
      if (!target) continue;
      const position = vehiclePositionState(vehicle, { ...target, stopCode: stop.stopCode });
      if (!position) continue;

      const route = routeByCode.get(routeDirection.routeCode);
      const direction = normalizeDirection(routeDirection.direction);
      arrivals.push({
        id: `${routeDirection.routeCode}:${direction}:${vehicle.vehiclePlate || vehicle._id}`,
        routeCode: routeDirection.routeCode,
        routeName: route?.displayName || "",
        direction,
        directionLabel: directionLabel(direction),
        vehiclePlate: vehicle.vehiclePlate || "",
        status: position.status,
        etaText: position.etaText,
        stopsAway: position.stopsAway,
        currentStop: Number.isInteger(vehicle.currentStop) ? vehicle.currentStop : null,
        nextStop: Number.isInteger(vehicle.nextStop) ? vehicle.nextStop : null,
        gps: {
          lat: Number(vehicle.lat),
          lng: Number(vehicle.lon),
          speed: Number(vehicle.speed || 0),
          heading: Number(vehicle.heading || 0)
        },
        lastSeenAt: vehicle.lastSeenAt,
        lastSeenSecondsAgo: Math.max(0, Math.round((now - new Date(vehicle.lastSeenAt).getTime()) / 1000)),
        rank: position.rank
      });
    }
  }

  arrivals.sort((a, b) =>
    a.rank - b.rank ||
    String(a.routeCode).localeCompare(String(b.routeCode), "vi") ||
    String(a.vehiclePlate).localeCompare(String(b.vehiclePlate), "vi")
  );

  ok(res, {
    stop: {
      stopCode: stop.stopCode,
      name: stop.name,
      lat: Number(stop.lat),
      lon: Number(stop.lon),
      address: stop.address || ""
    },
    arrivals: arrivals.slice(0, 30).map(({ rank, ...item }) => item),
    updatedAt: new Date().toISOString()
  });
}
