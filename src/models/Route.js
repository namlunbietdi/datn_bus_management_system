import mongoose from "mongoose";

const routeSchema = new mongoose.Schema(
  {
    routeCode: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    startPoint: String,
    endPoint: String,
    operatingTime: String,
    frequency: String,
    fare: { type: Number, min: 0 },
    geoJson: { type: mongoose.Schema.Types.Mixed },
    geoJsonName: String,
    geoJsonUpdatedAt: Date,
    outboundGeoJson: { type: mongoose.Schema.Types.Mixed },
    outboundGeoJsonName: String,
    outboundGeoJsonUpdatedAt: Date,
    inboundGeoJson: { type: mongoose.Schema.Types.Mixed },
    inboundGeoJsonName: String,
    inboundGeoJsonUpdatedAt: Date,
    version: { type: Number, default: 1 },
    status: { type: String, enum: ["active", "inactive"], default: "active" }
  },
  { timestamps: true }
);

export default mongoose.model("Route", routeSchema);
