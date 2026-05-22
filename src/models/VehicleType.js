import mongoose from "mongoose";

const vehicleTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: String,
    seatCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model("VehicleType", vehicleTypeSchema);
