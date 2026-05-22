import mongoose from "mongoose";

export default async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn("MONGO_URI is not configured. API database features are unavailable.");
    return;
  }

  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    console.log("MongoDB connected");
  } catch (error) {
    console.warn(`MongoDB connection failed: ${error.message}`);
  }
}
