import mongoose from "mongoose";

const deviceAssignmentSchema = new mongoose.Schema(
  {
    device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
    assignedAt: { type: Date, default: Date.now },
    unassignedAt: Date,
    status: { type: String, enum: ["active", "inactive"], default: "active" }
  },
  { timestamps: true }
);

export default mongoose.model("DeviceAssignment", deviceAssignmentSchema);
