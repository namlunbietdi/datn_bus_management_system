export const DIRECTIONS = ["FORWARD", "BACKWARD"];
export const TRIP_STATES = ["IDLE", "RUNNING", "PAUSED", "STOPPED", "ERROR"];
export const RUNTIME_STATES = ["BOOTING", "IDLE", "RUNNING", "PAUSED", "STOPPED", "ERROR"];
export const EVENT_TYPES = [
  "GPS_LOST",
  "MQTT_LOST",
  "MQTT_RESTORED",
  "ROUTE_RELOADED",
  "REVERSE_ROUTE",
  "STOP_TRIGGERED",
  "CRASH_RECOVERY",
  "CONFIG_REQUEST",
  "ROUTE_CONFIG_REQUEST",
  "BUTTON_ACTION"
];
export const COMMANDS = [
  "NEXT_STOP",
  "PREV_STOP",
  "SET_ROUTE",
  "RELOAD_ROUTE",
  "LOCK_TRIP",
  "UNLOCK_TRIP"
];
export const UPDATE_TYPES = ["ROUTE_UPDATE_AVAILABLE"];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isUnixTimestamp(value) {
  return Number.isInteger(value) && value > 0;
}

function hasEnum(value, allowed) {
  return allowed.includes(value);
}

function pushRequired(errors, condition, path, expected) {
  if (!condition) errors.push(`${path} must be ${expected}`);
}

function result(errors, value) {
  return { valid: errors.length === 0, errors, value };
}

export function unixToDate(timestamp) {
  return new Date(timestamp * 1000);
}

export function directionToContract(direction) {
  const value = String(direction || "").toLowerCase();
  if (["inbound", "backward", "ve", "down"].includes(value)) return "BACKWARD";
  if (["outbound", "forward", "di", "up"].includes(value)) return "FORWARD";
  return "FORWARD";
}

export function directionToDb(direction) {
  const value = String(direction || "").toLowerCase();
  if (["backward", "inbound", "ve", "down"].includes(value)) return "inbound";
  if (["forward", "outbound", "di", "up"].includes(value)) return "outbound";
  return null;
}

function isDirectionLike(value) {
  return directionToDb(value) !== null;
}

export function validateTelemetry(payload) {
  const errors = [];
  pushRequired(errors, isObject(payload), "$", "an object");
  if (!isObject(payload)) return result(errors);

  pushRequired(errors, isNonEmptyString(payload.deviceId), "deviceId", "a non-empty string");
  pushRequired(errors, isUnixTimestamp(payload.timestamp), "timestamp", "a unix timestamp in seconds");
  pushRequired(errors, isObject(payload.gps), "gps", "an object");
  pushRequired(errors, isObject(payload.runtime), "runtime", "an object");
  pushRequired(errors, isObject(payload.network), "network", "an object");

  if (isObject(payload.gps)) {
    pushRequired(errors, isFiniteNumber(payload.gps.lat), "gps.lat", "a finite number");
    pushRequired(errors, isFiniteNumber(payload.gps.lng), "gps.lng", "a finite number");
    pushRequired(errors, isFiniteNumber(payload.gps.speed), "gps.speed", "a finite number");
    pushRequired(errors, isFiniteNumber(payload.gps.heading), "gps.heading", "a finite number");
    pushRequired(errors, Number.isInteger(payload.gps.sat), "gps.sat", "an integer");
    pushRequired(errors, typeof payload.gps.fix === "boolean", "gps.fix", "a boolean");
  }

  if (isObject(payload.runtime)) {
    pushRequired(errors, isNonEmptyString(payload.runtime.routeId), "runtime.routeId", "a non-empty string");
    pushRequired(errors, isDirectionLike(payload.runtime.direction), "runtime.direction", "FORWARD|BACKWARD|DI|VE");
    pushRequired(errors, Number.isInteger(payload.runtime.currentStop), "runtime.currentStop", "an integer");
    pushRequired(errors, Number.isInteger(payload.runtime.nextStop), "runtime.nextStop", "an integer");
    pushRequired(errors, hasEnum(payload.runtime.tripState, TRIP_STATES), "runtime.tripState", TRIP_STATES.join("|"));
  }

  if (isObject(payload.network)) {
    pushRequired(errors, typeof payload.network.mqtt === "boolean", "network.mqtt", "a boolean");
    pushRequired(errors, Number.isInteger(payload.network.signal), "network.signal", "an integer");
  }

  return result(errors, payload);
}

export function validateStatus(payload) {
  const errors = [];
  pushRequired(errors, isObject(payload), "$", "an object");
  if (!isObject(payload)) return result(errors);

  pushRequired(errors, isNonEmptyString(payload.deviceId), "deviceId", "a non-empty string");
  pushRequired(errors, Number.isInteger(payload.uptime), "uptime", "an integer");
  pushRequired(errors, Number.isInteger(payload.freeHeap), "freeHeap", "an integer");
  pushRequired(errors, typeof payload.sdReady === "boolean", "sdReady", "a boolean");
  pushRequired(errors, Number.isInteger(payload.queueDepth), "queueDepth", "an integer");
  pushRequired(errors, hasEnum(payload.runtimeState, RUNTIME_STATES), "runtimeState", RUNTIME_STATES.join("|"));
  pushRequired(errors, isNonEmptyString(payload.routeVersion), "routeVersion", "a non-empty string");

  return result(errors, payload);
}

export function validateEvent(payload) {
  const errors = [];
  pushRequired(errors, isObject(payload), "$", "an object");
  if (!isObject(payload)) return result(errors);

  pushRequired(errors, hasEnum(payload.type, EVENT_TYPES), "type", EVENT_TYPES.join("|"));
  pushRequired(errors, isUnixTimestamp(payload.timestamp), "timestamp", "a unix timestamp in seconds");
  if (payload.type === "BUTTON_ACTION") {
    pushRequired(errors, isNonEmptyString(payload.action), "action", "a non-empty string");
    pushRequired(errors, isNonEmptyString(payload.result), "result", "a non-empty string");
    pushRequired(errors, payload.routeId === undefined || typeof payload.routeId === "string", "routeId", "a string when present");
    pushRequired(errors, payload.direction === undefined || isDirectionLike(payload.direction), "direction", "FORWARD|BACKWARD|DI|VE when present");
    pushRequired(errors, payload.stopCode === undefined || typeof payload.stopCode === "string", "stopCode", "a string when present");
    pushRequired(errors, payload.currentStop === undefined || typeof payload.currentStop === "string", "currentStop", "a string when present");
    pushRequired(errors, payload.nextStop === undefined || typeof payload.nextStop === "string", "nextStop", "a string when present");
    pushRequired(errors, payload.currentStopCode === undefined || typeof payload.currentStopCode === "string", "currentStopCode", "a string when present");
    pushRequired(errors, payload.nextStopCode === undefined || typeof payload.nextStopCode === "string", "nextStopCode", "a string when present");
    return result(errors, payload);
  }
  if (payload.type === "ROUTE_CONFIG_REQUEST") {
    pushRequired(errors, isNonEmptyString(payload.routeCode), "routeCode", "a non-empty string");
    pushRequired(errors, payload.currentVersion === undefined || typeof payload.currentVersion === "string", "currentVersion", "a string when present");
  } else if (payload.type !== "CONFIG_REQUEST") {
    pushRequired(errors, isNonEmptyString(payload.routeId), "routeId", "a non-empty string");
  } else {
    pushRequired(errors, payload.routeId === undefined || isNonEmptyString(payload.routeId), "routeId", "a string when present");
  }
  pushRequired(errors, isNonEmptyString(payload.stopCode) || payload.stopCode === undefined, "stopCode", "a string when present");
  pushRequired(errors, payload.type === "CONFIG_REQUEST" || payload.type === "ROUTE_CONFIG_REQUEST"
    ? payload.direction === undefined || isDirectionLike(payload.direction)
    : isDirectionLike(payload.direction), "direction", "FORWARD|BACKWARD|DI|VE");

  return result(errors, payload);
}

export function validateCommand(payload) {
  const errors = [];
  pushRequired(errors, isObject(payload), "$", "an object");
  if (!isObject(payload)) return result(errors);

  pushRequired(errors, hasEnum(payload.cmd, COMMANDS), "cmd", COMMANDS.join("|"));
  if (payload.cmd === "SET_ROUTE") {
    pushRequired(errors, isNonEmptyString(payload.routeId), "routeId", "a non-empty string for SET_ROUTE");
  } else {
    pushRequired(errors, payload.routeId === undefined || isNonEmptyString(payload.routeId), "routeId", "a string when present");
  }
  pushRequired(errors, payload.direction === undefined || hasEnum(payload.direction, DIRECTIONS), "direction", DIRECTIONS.join("|"));

  return result(errors, payload);
}

export function validateUpdateNotification(payload) {
  const errors = [];
  pushRequired(errors, isObject(payload), "$", "an object");
  if (!isObject(payload)) return result(errors);

  pushRequired(errors, hasEnum(payload.type, UPDATE_TYPES), "type", UPDATE_TYPES.join("|"));
  pushRequired(errors, isNonEmptyString(payload.routeId), "routeId", "a non-empty string");
  pushRequired(errors, isNonEmptyString(payload.version), "version", "a non-empty string");
  pushRequired(errors, isNonEmptyString(payload.url), "url", "a non-empty string");
  pushRequired(errors, payload.checksum === undefined || isNonEmptyString(payload.checksum), "checksum", "a string when present");

  return result(errors, payload);
}

export function assertValidCommand(payload) {
  const check = validateCommand(payload);
  if (!check.valid) throw new Error(`Invalid command payload: ${check.errors.join("; ")}`);
  return payload;
}

export function assertValidUpdateNotification(payload) {
  const check = validateUpdateNotification(payload);
  if (!check.valid) throw new Error(`Invalid update payload: ${check.errors.join("; ")}`);
  return payload;
}
