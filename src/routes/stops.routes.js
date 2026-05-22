import Stop from "../models/Stop.js";
import { createCrudController } from "../controllers/crudController.js";
import crudRouter from "./_crudRouter.js";

const controller = createCrudController(Stop, {
  moduleName: "Stop",
  searchable: ["stopCode", "name", "address"]
});

export default crudRouter(controller);
