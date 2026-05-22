import Vehicle from "../models/Vehicle.js";
import VehicleType from "../models/VehicleType.js";
import { createCrudController } from "../controllers/crudController.js";
import crudRouter from "./_crudRouter.js";
import { AppError } from "../utils/errors.js";

async function syncVehicleTypeSeatCount(payload, req) {
  const next = { ...payload };
  if (req.method === "POST" && !next.vehicleType) {
    throw new AppError("Vehicle type is required", 400);
  }
  if (!next.vehicleType) return next;
  const vehicleType = await VehicleType.findById(next.vehicleType).lean();
  if (!vehicleType) throw new AppError("Vehicle type not found", 400);
  next.seatCount = Number(vehicleType.seatCount || 0);
  return next;
}

const controller = createCrudController(Vehicle, {
  moduleName: "Vehicle",
  searchable: ["vehicleCode", "plateNumber", "currentRoute"],
  populate: "vehicleType",
  beforeCreate: syncVehicleTypeSeatCount,
  beforeUpdate: syncVehicleTypeSeatCount
});

export default crudRouter(controller);
