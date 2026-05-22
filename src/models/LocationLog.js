import mongoose from "mongoose";

const locationLogSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    vehiclePlate: String,
    routeCode: String,
    direction: { type: String, enum: ["outbound", "inbound", null], default: null },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    speed: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

export default mongoose.model("LocationLog", locationLogSchema);
