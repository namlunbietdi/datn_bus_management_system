import mongoose from "mongoose";

const directionStopSchema = new mongoose.Schema(
  {
    stop: { type: mongoose.Schema.Types.ObjectId, ref: "Stop" },
    stopCode: { type: String, required: true },
    order: { type: Number, required: true },
    terminal: Boolean
  },
  { _id: false }
);

const routeDirectionSchema = new mongoose.Schema(
  {
    route: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true },
    routeCode: { type: String, required: true, trim: true },
    direction: { type: String, enum: ["outbound", "inbound"], required: true },
    stops: [directionStopSchema],
    status: { type: String, enum: ["active", "inactive"], default: "active" }
  },
  { timestamps: true }
);

routeDirectionSchema.index({ routeCode: 1, direction: 1 }, { unique: true });

export default mongoose.model("RouteDirection", routeDirectionSchema);
