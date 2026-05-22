import VehicleType from "../models/VehicleType.js";
import { createCrudController } from "../controllers/crudController.js";
import crudRouter from "./_crudRouter.js";

const controller = createCrudController(VehicleType, {
  moduleName: "VehicleType",
  searchable: ["name", "description"]
});

export default crudRouter(controller);
