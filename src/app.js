import express from "express";
import cors from "cors";
import recordingsRouter from "./routes/recordings.js";


const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
	res.json({ ok: true });
});

app.use("/api/recordings", recordingsRouter);


export default app;