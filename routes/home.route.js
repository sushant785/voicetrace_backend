import express from "express";
import { getHomeDashboard } from "../controllers/home.controller.js";
import { get_db } from "../config/db.js";
import mongoose from "mongoose"; 

const router = express.Router();

// GET /api/home/:vendorId
router.get("/insights/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;
    const db = get_db();
    
    // Validate if it's a proper 24-char hex string before searching
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Invalid Vendor ID format" });
    }

    const vId = new mongoose.Types.ObjectId(vendorId);

    // Fetch using the ObjectId type
    const insights = await db.collection("insights").findOne({ vendorId: vId });
    
    if (!insights) {
      console.log("No insights found for ID:", vendorId);
      return res.status(404).json({ message: "No insights found for this vendor" });
    }
    
    res.status(200).json(insights);
  } catch (error) {
    console.error("Error fetching insights:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.get("/:vendorId", getHomeDashboard);


export default router;