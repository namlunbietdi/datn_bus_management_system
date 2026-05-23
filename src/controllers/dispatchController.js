import DispatchOrder from "../models/DispatchOrder.js";
import Device from "../models/Device.js";
import Route from "../models/Route.js";
import Vehicle from "../models/Vehicle.js";
import DeviceAssignment from "../models/DeviceAssignment.js";
import { ok } from "../utils/apiResponse.js";
import { AppError } from "../utils/errors.js";
import { logActivity } from "../services/activityService.js";
import {
  publishLockTrip,
  publishRouteOverride,
  publishRouteUpdate,
  publishUnlockTrip
} from "../services/mqttService.js";

function assertDirection(direction) {
  if (!["outbound", "inbound"].includes(direction)) throw new AppError("Invalid direction", 400);
}

async function assertDevice(deviceId) {
  const device = await Device.findOne({ deviceId }).populate("vehicle");
  if (!device) throw new AppError("Device not found", 404);
  return device;
}

async function assertRoute(routeCode) {
  const route = await Route.findOne({ routeCode });
  if (!route) throw new AppError("Route not found", 404);
  return route;
}

async function assertVehicle(vehicleId) {
  if (!vehicleId) return null;
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) throw new AppError("Vehicle not found", 404);
  return vehicle;
}

async function assignVehicleToDevice({ device, vehicle, routeCode }) {
  if (!vehicle) return;
  await DeviceAssignment.updateMany(
    { device: device._id, status: "active" },
    { status: "inactive", unassignedAt: new Date() }
  );
  await DeviceAssignment.create({
    device: device._id,
    vehicle: vehicle._id,
    assignedAt: new Date(),
    status: "active"
  });
  device.vehicle = vehicle._id;
  await device.save();
  vehicle.currentRoute = routeCode;
  await vehicle.save();
}

function runtimeBaseUrl(req) {
  return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}

function routeUpdatePayload(req, route) {
  return {
    routeId: route.routeCode,
    version: String(route.version || "1.0"),
    fileName: `route_${route.routeCode}.json`,
    url: `${runtimeBaseUrl(req)}/api/runtime/routes/${encodeURIComponent(route.routeCode)}`
  };
}

function contractDirection(direction) {
  return direction === "inbound" ? "BACKWARD" : "FORWARD";
}

async function createOrder({ req, device, route, vehicle, commandType, direction, payload, departureAt }) {
  await assignVehicleToDevice({ device, vehicle, routeCode: route.routeCode });
  const order = await DispatchOrder.create({
    deviceId: device.deviceId,
    vehicle: vehicle?._id || device.vehicle?._id,
    routeCode: route.routeCode,
    direction: direction || null,
    commandType,
    payload,
    status: "created",
    departureAt: departureAt ? new Date(departureAt) : undefined,
    createdBy: req.user?._id
  });

  try {
    if (commandType === "ROUTE_OVERRIDE") await publishRouteOverride(device.deviceId, route.routeCode, direction);
    if (commandType === "ROUTE_VERSION") await publishRouteUpdate(device.deviceId, routeUpdatePayload(req, route));
    if (commandType === "UNLOCK_TRIP") await publishUnlockTrip(device.deviceId, route.routeCode, direction);
    if (commandType === "LOCK_TRIP") await publishLockTrip(device.deviceId, route.routeCode, direction);
    order.status = "published";
  } catch (error) {
    order.status = "failed";
    order.payload = { ...payload, mqttError: error.message };
  }

  await order.save();
  await logActivity({
    user: req.user,
    action: commandType,
    module: "DispatchOrder",
    targetId: order._id.toString(),
    metadata: order.payload
  });
  return order;
}

export async function listOrders(req, res) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const search = String(req.query.search || "").trim();
  const filter = search ? { deviceId: { $regex: search, $options: "i" } } : {};
  const [items, total] = await Promise.all([
    DispatchOrder.find(filter).populate("vehicle").populate("createdBy", "username fullName role").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    DispatchOrder.countDocuments(filter)
  ]);
  ok(res, { items, total, page, limit });
}

export async function getOrder(req, res) {
  const order = await DispatchOrder.findById(req.params.id).populate("vehicle").populate("createdBy", "username fullName role").lean();
  if (!order) throw new AppError("Dispatch order not found", 404);
  ok(res, order);
}

export async function createDispatchOrder(req, res) {
  const { deviceId, routeCode, direction, commandType, vehicleId, departureAt } = req.body;
  if (!deviceId || !routeCode || !commandType) throw new AppError("deviceId, routeCode and commandType are required", 400);
  if (!vehicleId) throw new AppError("vehicleId is required", 400);
  if (commandType !== "ROUTE_VERSION") assertDirection(direction);
  const device = await assertDevice(deviceId);
  const route = await assertRoute(routeCode);
  const vehicle = await assertVehicle(vehicleId);
  const payload = commandType === "ROUTE_VERSION"
    ? { type: "ROUTE_UPDATE_AVAILABLE", ...routeUpdatePayload(req, route) }
    : { cmd: commandType === "ROUTE_OVERRIDE" ? "SET_ROUTE" : commandType, routeId: routeCode, direction: contractDirection(direction) };
  const order = await createOrder({ req, device, route, vehicle, commandType, direction, payload, departureAt });
  ok(res, order, 201);
}

export async function routeOverride(req, res) {
  const { routeCode, direction } = req.body;
  assertDirection(direction);
  const device = await assertDevice(req.params.deviceId);
  const route = await assertRoute(routeCode);
  const order = await createOrder({
    req,
    device,
    route,
    commandType: "ROUTE_OVERRIDE",
    direction,
    payload: { cmd: "SET_ROUTE", routeId: routeCode, direction: contractDirection(direction) }
  });
  ok(res, order, 201);
}

export async function returnToDepot(req, res) {
  const order = await DispatchOrder.findById(req.params.id);
  if (!order) throw new AppError("Dispatch order not found", 404);
  if (order.status === "returned") throw new AppError("Dispatch order is already returned", 400);

  const returnAt = req.body.returnAt ? new Date(req.body.returnAt) : new Date();
  order.returnAt = returnAt;
  order.status = "returned";
  order.payload = { ...order.payload, returnAt };
  await order.save();

  const device = await Device.findOne({ deviceId: order.deviceId });
  if (device) {
    await DeviceAssignment.updateMany(
      { device: device._id, status: "active" },
      { status: "inactive", unassignedAt: returnAt }
    );
    device.vehicle = undefined;
    await device.save();
  }

  if (order.vehicle) {
    await Vehicle.findByIdAndUpdate(order.vehicle, { $unset: { currentRoute: "" } });
  }

  await logActivity({
    user: req.user,
    action: "RETURN_TO_DEPOT",
    module: "DispatchOrder",
    targetId: order._id.toString(),
    metadata: { deviceId: order.deviceId, routeCode: order.routeCode, returnAt }
  });

  ok(res, order);
}

export async function routeVersion(req, res) {
  const { routeCode } = req.body;
  const device = await assertDevice(req.params.deviceId);
  const route = await assertRoute(routeCode);
  const order = await createOrder({
    req,
    device,
    route,
    commandType: "ROUTE_VERSION",
    payload: { type: "ROUTE_UPDATE_AVAILABLE", ...routeUpdatePayload(req, route) }
  });
  ok(res, order, 201);
}

export async function unlockTrip(req, res) {
  const { routeCode, direction } = req.body;
  assertDirection(direction);
  const device = await assertDevice(req.params.deviceId);
  const route = await assertRoute(routeCode);
  const order = await createOrder({
    req,
    device,
    route,
    commandType: "UNLOCK_TRIP",
    direction,
    payload: { cmd: "UNLOCK_TRIP", routeId: routeCode, direction: contractDirection(direction) }
  });
  ok(res, order, 201);
}

export async function lockTrip(req, res) {
  const { routeCode, direction } = req.body;
  assertDirection(direction);
  const device = await assertDevice(req.params.deviceId);
  const route = await assertRoute(routeCode);
  const order = await createOrder({
    req,
    device,
    route,
    commandType: "LOCK_TRIP",
    direction,
    payload: { cmd: "LOCK_TRIP", routeId: routeCode, direction: contractDirection(direction) }
  });
  ok(res, order, 201);
}
