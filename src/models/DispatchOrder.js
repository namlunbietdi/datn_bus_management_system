import mongoose from "mongoose";

const dispatchOrderSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, trim: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    routeCode: { type: String, trim: true },
    direction: { type: String, enum: ["outbound", "inbound", null], default: null },
    commandType: {
      type: String,
      enum: ["ROUTE_OVERRIDE", "ROUTE_VERSION", "UNLOCK_TRIP", "LOCK_TRIP"],
      required: true
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["created", "published", "failed", "returned"], default: "created" },
    departureAt: Date,
    returnAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export default mongoose.model("DispatchOrder", dispatchOrderSchema);
