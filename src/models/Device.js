import mongoose from "mongoose";

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, trim: true },
    imei: { type: String, trim: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    installedAt: Date,
    expiredAt: Date,
    nextMaintenanceAt: Date,
    status: {
      type: String,
      enum: ["online", "offline", "maintenance", "expired"],
      default: "offline"
    },
    lastSeenAt: Date
  },
  { timestamps: true }
);

export default mongoose.model("Device", deviceSchema);
