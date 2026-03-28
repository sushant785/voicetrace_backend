import express from "express";
import { getHomeDashboard } from "../controllers/home.controller.js";

const router = express.Router();

// GET /api/home/:vendorId
router.get("/:vendorId", getHomeDashboard);

export default router;