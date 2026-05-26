import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/db.js";
import { connectMqtt } from "./services/mqttService.js";

dotenv.config();

const port = Number(process.env.PORT || 3000);

await connectDB();

const server = app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
  connectMqtt();
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the other server instance before starting this one.`);
  } else {
    console.error(`Server failed to start: ${error.message}`);
  }
  process.exit(1);
});
