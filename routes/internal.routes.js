import express from "express";
import { triggerDailyUpdate } from "../controllers/internal.controller.js";
import { addExpense } from "../controllers/internal.controller.js";


const router = express.Router();

// 🔥 Called ONLY by Python backend
router.post("/update-daily", triggerDailyUpdate);
router.post("/expense", addExpense);

export default router;