import { UdharEvent } from "../models/UdharEvent.js";
import mongoose from "mongoose";

export const getUdharSummary = async (req, res) => {
  try {
    const { vendorId } = req.query;

    // Clean the string to remove any hidden newlines/spaces
    const cleanId = vendorId.trim(); 

    const summary = await UdharEvent.aggregate([
      { $match: { vendorId: new mongoose.Types.ObjectId(cleanId) } },
      {
  $group: {
    _id: { $toLower: "$personName" }, // Group by name (lowercase to avoid duplicates)
    displayName: { $first: "$personName" },
    totalGiven: {
      // Use $toDouble to ensure strings are converted to numbers for math
      $sum: { 
        $cond: [
          { $eq: ["$type", "given"] }, 
          { $toDouble: "$amount" }, 
          0
        ] 
      }
    },
    totalReceived: {
      $sum: { 
        $cond: [
          { $eq: ["$type", "received"] }, 
          { $toDouble: "$amount" }, 
          0
        ] 
      }
    },
    lastTransaction: { $max: "$date" }
  }
},
      
      {
        $project: {
          name: "$displayName",
          pendingAmount: { $subtract: ["$totalGiven", "$totalReceived"] },
          lastUpdate: "$lastTransaction"
        }
      },
      { $sort: { pendingAmount: -1 } } // Show biggest debtors first
    ]);

   const totalPending = summary.reduce((acc, curr) => {
    return acc + (curr.pendingAmount > 0 ? curr.pendingAmount : 0);
}, 0);
console.log("DEBUG: summary array:", JSON.stringify(summary, null, 2));
    res.json({
      totalPending,
      people: summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};