import mqtt from "mqtt";
import Device from "../models/Device.js";
import LocationLog from "../models/LocationLog.js";
import DeviceLastState from "../models/DeviceLastState.js";
import DeviceEventLog from "../models/DeviceEventLog.js";
import DispatchOrder from "../models/DispatchOrder.js";
import Route from "../models/Route.js";
import { getEspRouteMetadata } from "./espRouteConfigService.js";
import { logActivity } from "./activityService.js";
import {
  assertValidCommand,
  directionToContract,
  directionToDb,
  validateEvent,
  validateStatus,
  validateTelemetry,
  unixToDate
} from "../contracts/runtimeJsonContract.js";

let client = null;
let connected = false;
const ROUTE_CONFIG_CHUNK_SIZE = 800;
const ROUTE_CONFIG_CHUNK_DELAY_MS = 200;

function shouldConnect() {
  if (process.env.MQTT_URL) return !process.env.MQTT_URL.includes("xxxxxxxx");
  return process.env.MQTT_HOST && !process.env.MQTT_HOST.startsWith("xxxx");
}

function mqttUrl() {
  if (process.env.MQTT_URL) return process.env.MQTT_URL;
  const protocol = process.env.MQTT_PROTOCOL || "mqtts";
  const port = Number(process.env.MQTT_PORT || 8883);
  return `${protocol}://${process.env.MQTT_HOST}:${port}`;
}

function mqttClientId() {
  const base = process.env.MQTT_CLIENT_ID || "bus-monitor";
  return `${base}-${process.pid}`;
}

function topicPrefix() {
  const prefix = process.env.MQTT_TOPIC_COMMAND_PREFIX || "bus";
  return prefix.replace(/\/+$/, "");
}

function commandTopic(deviceId) {
  return `${topicPrefix()}/${deviceId}/cmd`;
}

function configTopic(deviceId) {
  return `${topicPrefix()}/${deviceId}/config`;
}

function normalizeDisplayDirection(direction) {
  const value = String(direction || "").toLowerCase();

  if (
    value === "ve" ||
    value === "về" ||
    value === "backward" ||
    value === "inbound" ||
    value === "down"
  ) {
    return "VE";
  }

  if (
    value === "di" ||
    value === "đi" ||
    value === "forward" ||
    value === "outbound" ||
    value === "up"
  ) {
    return "DI";
  }

  return direction ? String(direction).toUpperCase() : "";
}

function firstDisplayValue(...values) {
  const value = values.find((item) => item !== undefined && item !== null && item !== "");
  return value === undefined ? "" : value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkString(value, chunkSize = ROUTE_CONFIG_CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
}

function updateTopic(deviceId) {
  return `${topicPrefix()}/${deviceId}/update`;
}

function parseMessage(message) {
  try {
    return JSON.parse(message.toString("utf8"));
  } catch {
    return null;
  }
}

function topicDeviceId(topic) {
  const parts = topic.split("/");
  return parts.length >= 3 ? parts[1] : null;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function integerOrUndefined(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
}

function dateFromPayloadTimestamp(value) {
  if (Number.isInteger(value)) {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function rejectInvalid(kind, topic, errors) {
  console.warn(`Invalid ${kind} payload rejected on ${topic}: ${errors.join("; ")}`);
}

function assertTopicDevice(kind, topic, payload) {
  const deviceId = topicDeviceId(topic);
  if (!deviceId || payload.deviceId !== deviceId) {
    return [`deviceId must match topic device id (${deviceId || "missing"})`];
  }
  return [];
}

function runtimeFieldsFromTelemetry(payload) {
  return {
    routeCode: payload.runtime.routeId,
    direction: directionToDb(payload.runtime.direction),
    runtimeStatus: payload.runtime.tripState,
    tripState: payload.runtime.tripState,
    currentStop: payload.runtime.currentStop,
    nextStop: payload.runtime.nextStop,
    gpsSat: payload.gps.sat,
    gpsFix: payload.gps.fix,
    networkMqtt: payload.network.mqtt,
    networkSignal: payload.network.signal
  };
}

async function activeDispatchContext(deviceId) {
  if (!deviceId) return {};
  const order = await DispatchOrder.findOne({
    deviceId,
    status: { $in: ["created", "published"] }
  })
    .sort({ departureAt: -1, createdAt: -1 })
    .select("_id routeCode direction")
    .lean();

  return {
    dispatchId: order?._id?.toString?.() || "",
    routeCode: order?.routeCode || "",
    direction: order?.direction || ""
  };
}

function isActiveDispatch(context) {
  return Boolean(context?.dispatchId && context?.routeCode);
}

function dispatchTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function routeFareValue(route) {
  return String(firstDisplayValue(route?.fare, route?.ticketPrice, route?.price));
}

async function routeFare(routeCode) {
  if (!routeCode) return "";
  const route = await Route.findOne({ routeCode }).select("fare ticketPrice price").lean();
  return routeFareValue(route);
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function gpsPayloadFromMessage(topic, payload) {
  if (!isObject(payload)) return { errors: ["payload must be an object"] };

  const topicId = topicDeviceId(topic);
  const deviceId = payload.deviceId || topicId;
  const topicErrors = payload.deviceId ? assertTopicDevice("gps", topic, payload) : [];
  if (!deviceId || topicErrors.length) {
    return { errors: topicErrors.length ? topicErrors : ["topic device id is missing"] };
  }

  const gps = isObject(payload.gps) ? payload.gps : payload;
  const lat = numberOrUndefined(gps.lat ?? gps.latitude);
  const lon = numberOrUndefined(gps.lng ?? gps.lon ?? gps.longitude);
  const speed = numberOrUndefined(gps.speed) ?? 0;
  const heading = numberOrUndefined(gps.heading ?? gps.course) ?? 0;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { errors: ["gps.lat/lng or lat/lng must be finite numbers"] };
  }

  const runtime = isObject(payload.runtime) ? payload.runtime : payload;
  const network = isObject(payload.network) ? payload.network : payload;
  const currentStop = integerOrUndefined(runtime.currentStop);
  const nextStop = integerOrUndefined(runtime.nextStop);
  return {
    value: compactObject({
      deviceId,
      timestamp: dateFromPayloadTimestamp(payload.timestamp ?? gps.timestamp),
      routeCode: runtime.routeId || runtime.routeCode,
      direction: directionToDb(runtime.direction) || runtime.direction,
      runtimeStatus: runtime.tripState || runtime.runtimeStatus,
      tripState: runtime.tripState,
      activeStopCode: runtime.activeStopCode || runtime.currentStopCode,
      nextStopCode: runtime.nextStopCode,
      currentStop,
      nextStop,
      lat,
      lon,
      speed,
      heading,
      gpsSat: Number.isInteger(gps.sat) ? gps.sat : numberOrUndefined(gps.sat ?? gps.satellites),
      gpsFix: typeof gps.fix === "boolean" ? gps.fix : (typeof gps.gpsFix === "boolean" ? gps.gpsFix : true),
      networkMqtt: typeof network.mqtt === "boolean" ? network.mqtt : (typeof network.mqttConnected === "boolean" ? network.mqttConnected : undefined),
      networkSignal: Number.isInteger(network.signal) ? network.signal : numberOrUndefined(network.signal)
    })
  };
}

async function handleTelemetry(topic, message) {
  const payload = parseMessage(message);
  const check = validateTelemetry(payload);
  const topicErrors = check.valid ? assertTopicDevice("telemetry", topic, payload) : [];
  if (!check.valid || topicErrors.length) {
    rejectInvalid("telemetry", topic, [...check.errors, ...topicErrors]);
    return;
  }

  const timestamp = unixToDate(payload.timestamp);
  const deviceId = payload.deviceId;
  const runtime = runtimeFieldsFromTelemetry(payload);
  const dispatch = await activeDispatchContext(deviceId);
  const routeCode = dispatch.routeCode || payload.runtime.routeId;
  const direction = runtime.direction || directionToDb(dispatch.direction);
  await LocationLog.create({
    deviceId,
    routeCode,
    direction,
    lat: payload.gps.lat,
    lon: payload.gps.lng,
    speed: payload.gps.speed,
    heading: payload.gps.heading,
    timestamp
  });

  await DeviceLastState.findOneAndUpdate(
    { deviceId },
    compactObject({
      deviceId,
      lat: payload.gps.lat,
      lon: payload.gps.lng,
      speed: payload.gps.speed,
      heading: payload.gps.heading,
      status: payload.gps.speed > 1 ? "running" : "stopped",
      ...runtime,
      routeCode,
      direction,
      lastSeenAt: timestamp
    }),
    { upsert: true, new: true }
  );

  await Device.findOneAndUpdate({ deviceId }, { status: "online", lastSeenAt: timestamp });
}

async function handleGps(topic, message) {
  const payload = parseMessage(message);
  const normalized = gpsPayloadFromMessage(topic, payload);
  if (normalized.errors) {
    rejectInvalid("gps", topic, normalized.errors);
    return;
  }

  const gps = normalized.value;
  const dispatch = await activeDispatchContext(gps.deviceId);
  const routeCode = dispatch.routeCode || gps.routeCode;
  const direction = gps.direction || directionToDb(dispatch.direction);
  await LocationLog.create({
    deviceId: gps.deviceId,
    routeCode,
    direction,
    lat: gps.lat,
    lon: gps.lon,
    speed: gps.speed,
    heading: gps.heading,
    timestamp: gps.timestamp
  });

  await DeviceLastState.findOneAndUpdate(
    { deviceId: gps.deviceId },
    compactObject({
      deviceId: gps.deviceId,
      routeCode,
      direction,
      lat: gps.lat,
      lon: gps.lon,
      speed: gps.speed,
      heading: gps.heading,
      status: gps.speed > 1 ? "running" : "stopped",
      runtimeStatus: gps.runtimeStatus,
      tripState: gps.tripState,
      activeStopCode: gps.activeStopCode,
      nextStopCode: gps.nextStopCode,
      currentStop: gps.currentStop,
      nextStop: gps.nextStop,
      gpsSat: gps.gpsSat,
      gpsFix: gps.gpsFix,
      networkMqtt: gps.networkMqtt,
      networkSignal: gps.networkSignal,
      lastSeenAt: gps.timestamp
    }),
    { upsert: true, new: true }
  );

  await Device.findOneAndUpdate({ deviceId: gps.deviceId }, { status: "online", lastSeenAt: gps.timestamp });
}

async function handleStatus(topic, message) {
  const payload = parseMessage(message);
  const check = validateStatus(payload);
  const topicErrors = check.valid ? assertTopicDevice("status", topic, payload) : [];
  if (!check.valid || topicErrors.length) {
    rejectInvalid("status", topic, [...check.errors, ...topicErrors]);
    return;
  }

  const timestamp = new Date();
  const update = compactObject({
    deviceId: payload.deviceId,
    status: payload.online === false ? "offline" : "online",
    uptime: payload.uptime,
    freeHeap: payload.freeHeap,
    sdReady: payload.sdReady,
    queueDepth: payload.queueDepth,
    runtimeStatus: payload.runtimeState,
    routeVersion: payload.routeVersion,
    lastSeenAt: timestamp
  });

  if (typeof payload.lat === "number" && typeof payload.lon === "number") {
    update.lat = payload.lat;
    update.lon = payload.lon;
  }
  if (typeof payload.speed === "number") update.speed = payload.speed;
  if (typeof payload.heading === "number") update.heading = payload.heading;

  await DeviceLastState.findOneAndUpdate({ deviceId: payload.deviceId }, update, { upsert: true, new: true });
  await Device.findOneAndUpdate(
    { deviceId: payload.deviceId },
    { status: payload.online === false ? "offline" : "online", lastSeenAt: timestamp }
  );
}

async function handleEvent(topic, message) {
  const payload = parseMessage(message);
  const deviceId = topicDeviceId(topic);
  if (!deviceId) {
    rejectInvalid("event", topic, ["topic device id is missing"]);
    return;
  }
  const dispatch = await activeDispatchContext(deviceId);
  const rawDirection = payload?.type === "BUTTON_ACTION"
    ? payload?.direction || payload?.dir || payload?.chieu || dispatch.direction
    : dispatch.direction || payload?.direction || payload?.dir || payload?.chieu;
  const rawRouteId = payload?.type === "BUTTON_ACTION"
    ? payload?.routeId || payload?.routeCode || payload?.routeNo
    : dispatch.routeCode || payload?.routeId || payload?.routeCode || payload?.routeNo;
  const normalizedPayload = isObject(payload)
    ? {
      ...payload,
      timestamp: payload.timestamp || Math.floor(Date.now() / 1000),
      routeId: rawRouteId,
      direction: rawDirection ? directionToContract(rawDirection) : payload.direction
    }
    : payload;
  const check = validateEvent(normalizedPayload);
  if (!check.valid) {
    rejectInvalid("event", topic, check.errors);
    return;
  }

  if (normalizedPayload.type === "ROUTE_CONFIG_REQUEST") {
    await handleRouteConfigRequest(deviceId, normalizedPayload);
    return;
  }

  const timestamp = unixToDate(normalizedPayload.timestamp);
  const direction = directionToDb(normalizedPayload.direction);
  await DeviceEventLog.create({
    deviceId,
    type: normalizedPayload.type,
    routeCode: normalizedPayload.routeId || normalizedPayload.routeCode,
    direction,
    stopCode: normalizedPayload.stopCode,
    payload: normalizedPayload,
    timestamp
  });

  await logActivity({
    action: normalizedPayload.type,
    module: "DeviceEvent",
    targetId: deviceId,
    metadata: {
      routeId: normalizedPayload.routeId,
      action: normalizedPayload.action,
      result: normalizedPayload.result,
      stopCode: normalizedPayload.stopCode
    }
  });

  if (normalizedPayload.type === "BUTTON_ACTION") {
    console.log(`Device event BUTTON_ACTION saved for ${deviceId} action=${normalizedPayload.action} result=${normalizedPayload.result}`);
  }

  if (normalizedPayload.type === "CONFIG_REQUEST") {
    if (!dispatch.routeCode) {
      console.warn(`CONFIG_REQUEST ignored for ${deviceId}: active dispatch order not found`);
      await publishNoDispatch(deviceId);
      return;
    }
    await publishDispatchAssigned(deviceId, {
      dispatchId: dispatch.dispatchId,
      routeCode: dispatch.routeCode,
      fare: await routeFare(dispatch.routeCode),
      direction: dispatch.direction || normalizedPayload.direction
    });
    console.log(`MQTT CONFIG_REQUEST handled for ${deviceId}`);
  }
}

async function publishRouteConfigResponse(deviceId, payload, options = {}) {
  const topic = configTopic(deviceId);
  const result = await publishToTopic(topic, payload, {
    qos: 1,
    retain: options.retain ?? false
  });
  console.log(`MQTT ${payload.cmd} published to ${topic}`);
  return result;
}

async function publishRetainedDispatchState(deviceId, payload) {
  const topic = configTopic(deviceId);
  const message = {
    deviceId,
    timestamp: dispatchTimestamp(),
    ...payload
  };
  const result = await publishToTopic(topic, message, { qos: 1, retain: true });
  console.log(`${message.cmd} retained to ${topic}`);
  return { topic, payload: message, retained: true, result };
}

export function publishNoDispatch(deviceId, cmd = "NO_DISPATCH") {
  return publishRetainedDispatchState(deviceId, {
    cmd,
    dispatchActive: false,
    dispatchId: "",
    routeCode: "",
    fare: "",
    direction: "",
    currentStop: "",
    nextStop: "",
    routeLoaded: false
  });
}

export function publishDispatchEnded(deviceId) {
  return publishRetainedDispatchState(deviceId, {
    cmd: "DISPATCH_ENDED",
    dispatchActive: false,
    dispatchId: "",
    routeCode: "",
    fare: "",
    direction: "",
    currentStop: "",
    nextStop: "",
    routeLoaded: false
  });
}

export function publishDispatchAssigned(deviceId, payload = {}) {
  return publishRetainedDispatchState(deviceId, {
    cmd: payload.cmd || "DISPATCH_ASSIGNED",
    dispatchActive: true,
    dispatchId: String(payload.dispatchId || ""),
    routeCode: String(payload.routeCode || ""),
    fare: String(payload.fare ?? ""),
    direction: normalizeDisplayDirection(payload.direction)
  });
}

export function publishDispatchDirectionChanged(deviceId, payload = {}) {
  return publishDispatchAssigned(deviceId, {
    ...payload,
    cmd: "DISPATCH_DIRECTION_CHANGED"
  });
}

export async function publishCurrentDispatchState(deviceId) {
  const dispatch = await activeDispatchContext(deviceId);
  if (!isActiveDispatch(dispatch)) {
    console.log(`No active dispatch found for ${deviceId}`);
    return publishNoDispatch(deviceId);
  }
  return publishDispatchAssigned(deviceId, {
    dispatchId: dispatch.dispatchId,
    routeCode: dispatch.routeCode,
    fare: await routeFare(dispatch.routeCode),
    direction: dispatch.direction
  });
}

export async function publishRouteConfigChunks(deviceId, routeCode, options = {}) {
  const normalizedRouteCode = String(routeCode || "").trim();
  const timestamp = options.timestamp || dispatchTimestamp();
  if (!normalizedRouteCode) {
    await publishRouteConfigResponse(deviceId, {
      cmd: "ROUTE_CONFIG_ERROR",
      deviceId,
      routeCode: normalizedRouteCode,
      message: "routeCode is required",
      timestamp
    });
    return { skipped: true, reason: "missing_route_code" };
  }

  const metadata = await getEspRouteMetadata(normalizedRouteCode);
  const currentVersion = String(options.currentVersion || "");
  if (currentVersion && currentVersion === metadata.version) {
    await publishRouteConfigResponse(deviceId, {
      cmd: "ROUTE_CONFIG_NOT_MODIFIED",
      deviceId,
      routeCode: normalizedRouteCode,
      version: metadata.version,
      timestamp
    });
    return { skipped: true, reason: "not_modified", version: metadata.version };
  }

  const chunks = chunkString(metadata.jsonString);
  console.log(`ROUTE_CONFIG chunk transfer started for ${deviceId} ${normalizedRouteCode}`);
  await publishRouteConfigResponse(deviceId, {
    cmd: "ROUTE_CONFIG_BEGIN",
    deviceId,
    routeCode: normalizedRouteCode,
    version: metadata.version,
    totalSize: metadata.size,
    totalParts: chunks.length,
    checksum: metadata.checksum,
    chunkSize: ROUTE_CONFIG_CHUNK_SIZE,
    timestamp
  });

  for (let index = 0; index < chunks.length; index += 1) {
    await delay(ROUTE_CONFIG_CHUNK_DELAY_MS);
    await publishRouteConfigResponse(deviceId, {
      cmd: "ROUTE_CONFIG_PART",
      deviceId,
      routeCode: normalizedRouteCode,
      version: metadata.version,
      partIndex: index,
      totalParts: chunks.length,
      data: chunks[index]
    });
  }

  await delay(ROUTE_CONFIG_CHUNK_DELAY_MS);
  await publishRouteConfigResponse(deviceId, {
    cmd: "ROUTE_CONFIG_END",
    deviceId,
    routeCode: normalizedRouteCode,
    version: metadata.version,
    totalSize: metadata.size,
    totalParts: chunks.length,
    checksum: metadata.checksum,
    timestamp
  });
  console.log(`ROUTE_CONFIG chunk transfer completed for ${deviceId} ${normalizedRouteCode}`);
  return {
    routeCode: normalizedRouteCode,
    version: metadata.version,
    totalSize: metadata.size,
    totalParts: chunks.length,
    checksum: metadata.checksum
  };
}

async function handleRouteConfigRequest(deviceId, payload) {
  const requestedRouteCode = String(payload.routeCode || "").trim();
  const transferMode = String(payload.transferMode || "MQTT_CHUNK");
  const timestamp = payload.timestamp || Math.floor(Date.now() / 1000);
  console.log(`ROUTE_CONFIG_REQUEST received from ${deviceId} routeCode=${requestedRouteCode || "(missing)"} transferMode=${transferMode}`);

  const dispatch = await activeDispatchContext(deviceId);
  if (!isActiveDispatch(dispatch)) {
    console.log(`No active dispatch found for ${deviceId}`);
    await publishNoDispatch(deviceId);
    return;
  }

  const activeRouteCode = dispatch.routeCode || requestedRouteCode;
  await publishDispatchAssigned(deviceId, {
    dispatchId: dispatch.dispatchId,
    routeCode: activeRouteCode,
    fare: await routeFare(activeRouteCode),
    direction: dispatch.direction
  });

  try {
    await publishRouteConfigChunks(deviceId, activeRouteCode, {
      currentVersion: payload.currentVersion,
      timestamp
    });
  } catch (error) {
    await publishRouteConfigResponse(deviceId, {
      cmd: "ROUTE_CONFIG_ERROR",
      deviceId,
      routeCode: activeRouteCode,
      message: error.message || "Route config failed",
      timestamp
    });
  }
}

async function syncDispatchStates() {
  const devices = await Device.find({}).select("deviceId").lean();
  for (const device of devices) {
    if (!device.deviceId) continue;
    try {
      await publishCurrentDispatchState(device.deviceId);
    } catch (error) {
      console.warn(`Dispatch state sync failed for ${device.deviceId}: ${error.message}`);
    }
  }
}

export function connectMqtt() {
  if (!shouldConnect()) {
    console.log("MQTT is not configured. Skipping HiveMQ connection.");
    return null;
  }

  const url = mqttUrl();

  client = mqtt.connect(url, {
    clientId: mqttClientId(),
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    clean: true
  });

  client.on("connect", () => {
    connected = true;
    console.log("MQTT connected to HiveMQ");
    client.subscribe(process.env.MQTT_TOPIC_TELEMETRY || "bus/+/telemetry");
    client.subscribe(process.env.MQTT_TOPIC_GPS || "bus/+/gps");
    client.subscribe(process.env.MQTT_TOPIC_EVENT || "bus/+/event");
    client.subscribe(process.env.MQTT_TOPIC_STATUS || "bus/+/status");
    syncDispatchStates().catch((error) => console.warn(`Dispatch state sync failed: ${error.message}`));
  });

  client.on("reconnect", () => console.log("MQTT reconnecting"));
  client.on("close", () => {
    connected = false;
    console.log("MQTT connection closed");
  });
  client.on("error", (error) => console.warn(`MQTT error: ${error.message}`));
  client.on("message", (topic, message) => {
    if (topic.endsWith("/telemetry")) {
      handleTelemetry(topic, message).catch((error) => console.warn(`Telemetry handling failed: ${error.message}`));
      return;
    }
    if (topic.endsWith("/gps")) {
      handleGps(topic, message).catch((error) => console.warn(`GPS handling failed: ${error.message}`));
      return;
    }
    if (topic.endsWith("/event")) {
      handleEvent(topic, message).catch((error) => console.warn(`Event handling failed: ${error.message}`));
      return;
    }
    if (topic.endsWith("/status")) {
      handleStatus(topic, message).catch((error) => console.warn(`Status handling failed: ${error.message}`));
    }
  });

  return client;
}

export function mqttStatus() {
  return {
    configured: shouldConnect(),
    connected,
    clientId: shouldConnect() ? mqttClientId() : null,
    topics: {
      telemetry: process.env.MQTT_TOPIC_TELEMETRY || "bus/+/telemetry",
      gps: process.env.MQTT_TOPIC_GPS || "bus/+/gps",
      event: process.env.MQTT_TOPIC_EVENT || "bus/+/event",
      status: process.env.MQTT_TOPIC_STATUS || "bus/+/status",
      cmd: `${topicPrefix()}/{deviceId}/cmd`,
      config: `${topicPrefix()}/{deviceId}/config`,
      update: `${topicPrefix()}/{deviceId}/update`
    }
  };
}

function publishToTopic(topic, payload, options = {}) {
  return new Promise((resolve, reject) => {
    if (!client || !connected || !client.connected) {
      reject(new Error("MQTT client is not connected"));
      return;
    }
    const message = typeof payload === "string" ? payload : JSON.stringify(payload);
    const publishOptions = {
      qos: options.qos ?? 0,
      retain: options.retain ?? false
    };
    client.publish(topic, message, publishOptions, (error) => {
      if (error) reject(error);
      else resolve({ topic, payload, options: publishOptions });
    });
  });
}

function publishCommand(deviceId, payload) {
  return publishToTopic(commandTopic(deviceId), assertValidCommand(payload), { qos: 1, retain: false });
}

export function publishRouteOverride(deviceId, routeCode, direction) {
  return publishCommand(deviceId, { cmd: "SET_ROUTE", routeId: routeCode, direction: direction === "inbound" ? "BACKWARD" : "FORWARD" });
}

export function publishUnlockTrip(deviceId, routeCode, direction) {
  return publishCommand(deviceId, { cmd: "UNLOCK_TRIP", routeId: routeCode, direction: direction === "inbound" ? "BACKWARD" : "FORWARD" });
}

export function publishLockTrip(deviceId, routeCode, direction) {
  return publishCommand(deviceId, { cmd: "LOCK_TRIP", routeId: routeCode, direction: direction === "inbound" ? "BACKWARD" : "FORWARD" });
}
