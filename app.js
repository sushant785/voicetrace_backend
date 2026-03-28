import express from "express";
import cors from "cors";
import recordingsRouter from "./routes/recordings.js";
import homeRouter from "./routes/home.route.js"
import dailyRecordRouter from "./routes/dailyRecord.js";
import internalRouter from "./routes/internal.routes.js";


const app = express();

app.use(cors({
  origin: "http://localhost:5173" 
}));
app.use(express.json());


app.get("/health", (req, res) => {
	res.json({ ok: true });
});

app.use("/api/internal", internalRouter);
app.use("/api/recordings", recordingsRouter);
app.use("/api/home", homeRouter);
app.use("/api/daily-records", dailyRecordRouter);


export default app;