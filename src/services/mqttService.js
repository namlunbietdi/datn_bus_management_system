import mqtt from "mqtt";
import Device from "../models/Device.js";
import LocationLog from "../models/LocationLog.js";
import DeviceLastState from "../models/DeviceLastState.js";
import DeviceEventLog from "../models/DeviceEventLog.js";
import { logActivity } from "./activityService.js";
import {
  assertValidCommand,
  assertValidUpdateNotification,
  directionToDb,
  validateEvent,
  validateStatus,
  validateTelemetry,
  unixToDate
} from "../contracts/runtimeJsonContract.js";

let client = null;
let connected = false;

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

function topicPrefix() {
  const prefix = process.env.MQTT_TOPIC_COMMAND_PREFIX || "bus";
  return prefix.replace(/\/+$/, "");
}

function commandTopic(deviceId) {
  return `${topicPrefix()}/${deviceId}/cmd`;
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
  return {
    value: compactObject({
      deviceId,
      timestamp: dateFromPayloadTimestamp(payload.timestamp ?? gps.timestamp),
      routeCode: runtime.routeId || runtime.routeCode,
      direction: directionToDb(runtime.direction) || runtime.direction,
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
  await LocationLog.create({
    deviceId,
    routeCode: payload.runtime.routeId,
    direction: runtime.direction,
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
      routeCode: payload.runtime.routeId,
      direction: runtime.direction,
      lat: payload.gps.lat,
      lon: payload.gps.lng,
      speed: payload.gps.speed,
      heading: payload.gps.heading,
      status: payload.gps.speed > 1 ? "running" : "stopped",
      ...runtime,
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
  await LocationLog.create({
    deviceId: gps.deviceId,
    routeCode: gps.routeCode,
    direction: gps.direction,
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
      routeCode: gps.routeCode,
      direction: gps.direction,
      lat: gps.lat,
      lon: gps.lon,
      speed: gps.speed,
      heading: gps.heading,
      status: gps.speed > 1 ? "running" : "stopped",
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
  const check = validateEvent(payload);
  if (!check.valid) {
    rejectInvalid("event", topic, check.errors);
    return;
  }

  const deviceId = topicDeviceId(topic);
  if (!deviceId) {
    rejectInvalid("event", topic, ["topic device id is missing"]);
    return;
  }
  const timestamp = unixToDate(payload.timestamp);
  const direction = directionToDb(payload.direction);
  await DeviceEventLog.create({
    deviceId,
    type: payload.type,
    routeCode: payload.routeId,
    direction,
    stopCode: payload.stopCode,
    payload,
    timestamp
  });

  await logActivity({
    action: payload.type,
    module: "DeviceEvent",
    targetId: deviceId,
    metadata: { routeId: payload.routeId, stopCode: payload.stopCode }
  });
}

export function connectMqtt() {
  if (!shouldConnect()) {
    console.log("MQTT is not configured. Skipping HiveMQ connection.");
    return null;
  }

  const url = mqttUrl();

  client = mqtt.connect(url, {
    clientId: process.env.MQTT_CLIENT_ID || `bus-monitor-${process.pid}`,
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
    clientId: process.env.MQTT_CLIENT_ID || null,
    topics: {
      telemetry: process.env.MQTT_TOPIC_TELEMETRY || "bus/+/telemetry",
      gps: process.env.MQTT_TOPIC_GPS || "bus/+/gps",
      event: process.env.MQTT_TOPIC_EVENT || "bus/+/event",
      status: process.env.MQTT_TOPIC_STATUS || "bus/+/status",
      cmd: `${topicPrefix()}/{deviceId}/cmd`,
      update: `${topicPrefix()}/{deviceId}/update`
    }
  };
}

function publishToTopic(topic, payload) {
  return new Promise((resolve, reject) => {
    if (!client || !connected) {
      reject(new Error("MQTT client is not connected"));
      return;
    }
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (error) => {
      if (error) reject(error);
      else resolve({ topic, payload });
    });
  });
}

function publishCommand(deviceId, payload) {
  return publishToTopic(commandTopic(deviceId), assertValidCommand(payload));
}

export function publishRouteOverride(deviceId, routeCode, direction) {
  return publishCommand(deviceId, { cmd: "SET_ROUTE", routeId: routeCode, direction: direction === "inbound" ? "BACKWARD" : "FORWARD" });
}

export function publishRouteUpdate(deviceId, payload) {
  const updatePayload = assertValidUpdateNotification({
    type: "ROUTE_UPDATE_AVAILABLE",
    ...payload
  });
  return publishToTopic(updateTopic(deviceId), updatePayload);
}

export function publishUnlockTrip(deviceId, routeCode, direction) {
  return publishCommand(deviceId, { cmd: "UNLOCK_TRIP", routeId: routeCode, direction: direction === "inbound" ? "BACKWARD" : "FORWARD" });
}

export function publishLockTrip(deviceId, routeCode, direction) {
  return publishCommand(deviceId, { cmd: "LOCK_TRIP", routeId: routeCode, direction: direction === "inbound" ? "BACKWARD" : "FORWARD" });
}
