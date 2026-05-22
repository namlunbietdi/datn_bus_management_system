import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
  {
    vehicleCode: { type: String, required: true, unique: true, trim: true },
    plateNumber: { type: String, required: true, unique: true, trim: true },
    vehicleType: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleType" },
    seatCount: { type: Number, default: 0 },
    manufactureYear: Number,
    currentRoute: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "maintenance", "inactive"],
      default: "active"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Vehicle", vehicleSchema);
