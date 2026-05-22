import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/db.js";
import { connectMqtt } from "./services/mqttService.js";

dotenv.config();

const port = Number(process.env.PORT || 3000);

await connectDB();
connectMqtt();

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
