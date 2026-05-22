import mongoose from "mongoose";

const stopSchema = new mongoose.Schema(
  {
    stopCode: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    address: String,
    audio: String,
    terminal: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model("Stop", stopSchema);
