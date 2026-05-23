import mongoose from "mongoose";

const deviceLastStateSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, trim: true },
    vehiclePlate: String,
    routeCode: String,
    direction: { type: String, enum: ["outbound", "inbound", null], default: null },
    lat: Number,
    lon: Number,
    speed: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["online", "offline", "running", "stopped", "signal_lost"],
      default: "offline"
    },
    runtimeStatus: String,
    tripState: String,
    activeStopCode: String,
    nextStopCode: String,
    currentStop: Number,
    nextStop: Number,
    routeVersion: String,
    configVersion: String,
    sdReady: Boolean,
    queueDepth: Number,
    lastEventSeq: Number,
    uptime: Number,
    freeHeap: Number,
    gpsSat: Number,
    gpsFix: Boolean,
    networkMqtt: Boolean,
    networkSignal: Number,
    lastSeenAt: Date
  },
  { timestamps: true }
);

export default mongoose.model("DeviceLastState", deviceLastStateSchema);
