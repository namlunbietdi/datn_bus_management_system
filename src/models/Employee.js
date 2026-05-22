import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, required: true, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    phone: String,
    role: { type: String, enum: ["driver", "attendant", "dispatcher", "staff"], default: "driver" },
    licenseNumber: String,
    status: { type: String, enum: ["active", "inactive", "leave"], default: "active" }
  },
  { timestamps: true }
);

export default mongoose.model("Employee", employeeSchema);
