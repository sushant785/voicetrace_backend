import express from "express";
import { triggerDailyUpdate } from "../controllers/internal.controller.js";

const router = express.Router();

// 🔥 Called ONLY by Python backend
router.post("/update-daily", triggerDailyUpdate);

export default router;