import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    role: { type: String, enum: ["admin", "dispatcher", "viewer"], default: "viewer" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    lastLoginAt: Date
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
