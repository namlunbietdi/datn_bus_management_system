import mongoose from "mongoose";

const deviceEventLogSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    routeCode: String,
    direction: { type: String, enum: ["outbound", "inbound", null], default: null },
    stopCode: String,
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

export default mongoose.model("DeviceEventLog", deviceEventLogSchema);
