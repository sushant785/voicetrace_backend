import express from "express";
import { getUdharSummary } from "../controllers/udhar.controller.js";

const router = express.Router();

// This matches: GET /api/udhar/summary?vendorId=...
router.get("/summary", getUdharSummary);

export default router;