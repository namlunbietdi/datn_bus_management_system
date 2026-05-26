import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { apiError, notFound } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import monitoringRoutes from "./routes/monitoring.routes.js";
import devicesRoutes from "./routes/devices.routes.js";
import vehiclesRoutes from "./routes/vehicles.routes.js";
import vehicleTypesRoutes from "./routes/vehicleTypes.routes.js";
import busRoutes from "./routes/routes.routes.js";
import stopsRoutes from "./routes/stops.routes.js";
import employeesRoutes from "./routes/employees.routes.js";
import usersRoutes from "./routes/users.routes.js";
import dispatchOrdersRoutes from "./routes/dispatchOrders.routes.js";
import logsRoutes from "./routes/logs.routes.js";
import runtimeRoutes from "./routes/runtime.routes.js";
import espRoutes from "./routes/esp.routes.js";
import publicRoutes from "./routes/public.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "healthy" } });
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/monitoring", monitoringRoutes);
app.use("/api/devices", devicesRoutes);
app.use("/api/vehicles", vehiclesRoutes);
app.use("/api/vehicle-types", vehicleTypesRoutes);
app.use("/api/routes", busRoutes);
app.use("/api/stops", stopsRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/dispatch-orders", dispatchOrdersRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/runtime", runtimeRoutes);
app.use("/api/esp", espRoutes);
app.use("/api/public", publicRoutes);

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/app", (_req, res) => {
  res.sendFile(path.join(publicDir, "app.html"));
});

app.get("/guest", (_req, res) => {
  res.sendFile(path.join(publicDir, "guest.html"));
});

app.use("/api", notFound);
app.use(apiError);

export default app;
