import Employee from "../models/Employee.js";
import { createCrudController } from "../controllers/crudController.js";
import crudRouter from "./_crudRouter.js";

const controller = createCrudController(Employee, {
  moduleName: "Employee",
  searchable: ["employeeCode", "fullName", "phone", "licenseNumber"]
});

export default crudRouter(controller);
