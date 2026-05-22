import mqtt from "mqtt";
import Device from "../models/Device.js";
import LocationLog from "../models/LocationLog.js";
import DeviceLastState from "../models/DeviceLastState.js";
import DeviceEventLog from "../models/DeviceEventLog.js";
import { logActivity } from "./activityService.js";

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

function commandTopic(deviceId) {
  const prefix = process.env.MQTT_TOPIC_COMMAND_PREFIX || "bus";
  return `${prefix}/${deviceId}/command`;
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

function isValidDirection(direction) {
  return !direction || ["outbound", "inbound"].includes(direction);
}

async function handleTelemetry(topic, message) {
  const payload = parseMessage(message);
  const deviceId = payload?.deviceId || topicDeviceId(topic);
  if (!payload || !deviceId || typeof payload.lat !== "number" || typeof payload.lon !== "number") {
    console.warn("Invalid telemetry payload ignored");
    return;
  }
  if (!isValidDirection(payload.direction)) {
    console.warn("Invalid telemetry direction ignored");
    return;
  }

  const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
  await LocationLog.create({
    deviceId,
    vehiclePlate: payload.vehiclePlate,
    routeCode: payload.routeCode,
    direction: payload.direction || null,
    lat: payload.lat,
    lon: payload.lon,
    speed: Number(payload.speed || 0),
    heading: Number(payload.heading || 0),
    timestamp
  });

  await DeviceLastState.findOneAndUpdate(
    { deviceId },
    {
      deviceId,
      vehiclePlate: payload.vehiclePlate,
      routeCode: payload.routeCode,
      direction: payload.direction || null,
      lat: payload.lat,
      lon: payload.lon,
      speed: Number(payload.speed || 0),
      heading: Number(payload.heading || 0),
      status: Number(payload.speed || 0) > 1 ? "running" : "stopped",
      lastSeenAt: timestamp
    },
    { upsert: true, new: true }
  );

  await Device.findOneAndUpdate({ deviceId }, { status: "online", lastSeenAt: timestamp });
}

async function handleEvent(topic, message) {
  const payload = parseMessage(message);
  const deviceId = payload?.deviceId || topicDeviceId(topic);
  if (!payload || !deviceId || !payload.type) {
    console.warn("Invalid event payload ignored");
    return;
  }
  if (!isValidDirection(payload.direction)) {
    console.warn("Invalid event direction ignored");
    return;
  }

  const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
  await DeviceEventLog.create({
    deviceId,
    type: payload.type,
    routeCode: payload.routeCode,
    direction: payload.direction || null,
    stopCode: payload.stopCode,
    payload,
    timestamp
  });

  await logActivity({
    action: payload.type,
    module: "DeviceEvent",
    targetId: deviceId,
    metadata: { routeCode: payload.routeCode, stopCode: payload.stopCode }
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
    client.subscribe(process.env.MQTT_TOPIC_EVENT || "bus/+/event");
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
    if (topic.endsWith("/event")) {
      handleEvent(topic, message).catch((error) => console.warn(`Event handling failed: ${error.message}`));
    }
  });

  return client;
}

export function mqttStatus() {
  return {
    configured: shouldConnect(),
    connected,
    clientId: process.env.MQTT_CLIENT_ID || null
  };
}

function publishCommand(deviceId, payload) {
  return new Promise((resolve, reject) => {
    if (!client || !connected) {
      reject(new Error("MQTT client is not connected"));
      return;
    }
    client.publish(commandTopic(deviceId), JSON.stringify(payload), { qos: 1 }, (error) => {
      if (error) reject(error);
      else resolve({ topic: commandTopic(deviceId), payload });
    });
  });
}

export function publishRouteOverride(deviceId, routeCode, direction) {
  return publishCommand(deviceId, { type: "ROUTE_OVERRIDE", routeCode, direction });
}

export function publishRouteVersion(deviceId, routeCode, version) {
  return publishCommand(deviceId, { type: "ROUTE_VERSION", routeCode, version });
}

export function publishUnlockTrip(deviceId, routeCode, direction) {
  return publishCommand(deviceId, { type: "UNLOCK_TRIP", routeCode, direction });
}

export function publishLockTrip(deviceId, routeCode, direction) {
  return publishCommand(deviceId, { type: "LOCK_TRIP", routeCode, direction });
}
