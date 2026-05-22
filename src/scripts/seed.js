import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import VehicleType from "../models/VehicleType.js";
import Vehicle from "../models/Vehicle.js";
import Device from "../models/Device.js";
import Route from "../models/Route.js";
import RouteDirection from "../models/RouteDirection.js";
import Stop from "../models/Stop.js";
import Employee from "../models/Employee.js";

dotenv.config();
await connectDB();

const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
await User.findOneAndUpdate(
  { username: process.env.ADMIN_USERNAME || "admin" },
  {
    username: process.env.ADMIN_USERNAME || "admin",
    passwordHash: await bcrypt.hash(adminPassword, 10),
    fullName: process.env.ADMIN_FULL_NAME || "System Admin",
    role: "admin",
    status: "active"
  },
  { upsert: true }
);

const type40 = await VehicleType.findOneAndUpdate(
  { name: "Bus 40 cho" },
  { name: "Bus 40 cho", description: "Xe buyt tieu chuan do thi", seatCount: 40 },
  { upsert: true, new: true }
);

const stops = [
  ["HBS0046", "401 Co Nhue", 21.06692, 105.775834, "401 Co Nhue"],
  ["HBS0047", "Truong Dai hoc Mo", 21.07151, 105.776673, "Truong Dai hoc Mo"],
  ["HBS0048", "Pham Van Dong", 21.05365, 105.78315, "Pham Van Dong"],
  ["HBS0049", "Cau Giay", 21.03673, 105.79082, "Cau Giay"],
  ["HBS0050", "Kim Ma", 21.03129, 105.82031, "Kim Ma"],
  ["HBS0051", "Hoan Kiem", 21.0285, 105.8542, "Hoan Kiem"]
];

for (const [stopCode, name, lat, lon, address] of stops) {
  await Stop.findOneAndUpdate(
    { stopCode },
    { stopCode, name, lat, lon, address, audio: stopCode },
    { upsert: true }
  );
}

const stopDocs = await Stop.find({ stopCode: { $in: stops.map((item) => item[0]) } }).lean();
const byCode = new Map(stopDocs.map((stop) => [stop.stopCode, stop]));

const routes = [
  ["DEMO01", "DEMO 01", "Co Nhue", "Hoan Kiem", "05:00 - 22:00", "10 phut", 1],
  ["DEMO02", "DEMO 02", "Cau Giay", "Hoan Kiem", "05:15 - 21:30", "12 phut", 5]
];

for (const [routeCode, displayName, startPoint, endPoint, operatingTime, frequency, version] of routes) {
  const route = await Route.findOneAndUpdate(
    { routeCode },
    { routeCode, displayName, startPoint, endPoint, operatingTime, frequency, version, status: "active" },
    { upsert: true, new: true }
  );
  const outboundCodes = routeCode === "DEMO01"
    ? ["HBS0046", "HBS0048", "HBS0049", "HBS0050", "HBS0051"]
    : ["HBS0049", "HBS0050", "HBS0051"];
  const inboundCodes = [...outboundCodes].reverse();
  for (const [direction, codes] of [["outbound", outboundCodes], ["inbound", inboundCodes]]) {
    await RouteDirection.findOneAndUpdate(
      { routeCode, direction },
      {
        route: route._id,
        routeCode,
        direction,
        status: "active",
        stops: codes.map((stopCode, index) => ({
          stop: byCode.get(stopCode)._id,
          stopCode,
          order: index + 1,
          terminal: index === 0 || index === codes.length - 1
        }))
      },
      { upsert: true }
    );
  }
}

await Vehicle.findOneAndUpdate(
  { vehicleCode: "BUS001" },
  {
    $set: {
      vehicleCode: "BUS001",
      plateNumber: "29B-12345",
      vehicleType: type40._id,
      seatCount: 40,
      manufactureYear: 2021,
      status: "active"
    },
    $unset: { currentRoute: "" }
  },
  { upsert: true, new: true }
);

await Vehicle.findOneAndUpdate(
  { vehicleCode: "BUS002" },
  {
    $set: {
      vehicleCode: "BUS002",
      plateNumber: "29B-67890",
      vehicleType: type40._id,
      seatCount: 40,
      manufactureYear: 2020,
      status: "maintenance"
    },
    $unset: { currentRoute: "" }
  },
  { upsert: true }
);

await Device.findOneAndUpdate(
  { deviceId: "GPS001" },
  {
    $set: {
      deviceId: "GPS001",
      imei: "867000000000001",
      installedAt: new Date("2026-01-01"),
      expiredAt: new Date("2027-01-01"),
      nextMaintenanceAt: new Date("2026-06-15"),
      status: "offline"
    },
    $unset: { vehicle: "", lastSeenAt: "" }
  },
  { upsert: true }
);

await Device.findOneAndUpdate(
  { deviceId: "GPS002" },
  {
    deviceId: "GPS002",
    imei: "867000000000002",
    installedAt: new Date("2026-02-01"),
    expiredAt: new Date("2026-12-31"),
    nextMaintenanceAt: new Date("2026-06-01"),
    status: "offline"
  },
  { upsert: true }
);

await Employee.findOneAndUpdate(
  { employeeCode: "NV001" },
  { employeeCode: "NV001", fullName: "Nguyen Van An", phone: "0901000001", role: "driver", licenseNumber: "B2-001", status: "active" },
  { upsert: true }
);

await Employee.findOneAndUpdate(
  { employeeCode: "NV002" },
  { employeeCode: "NV002", fullName: "Tran Thi Binh", phone: "0901000002", role: "attendant", status: "active" },
  { upsert: true }
);

console.log("Demo data seeded");
process.exit(0);
