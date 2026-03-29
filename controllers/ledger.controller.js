import mongoose from "mongoose";
import { DailyRecord } from "../models/DailyRecord.js";

export const getDailyLedger = async (req, res) => {
    try {
        const { vendorId, date } = req.query;

        if (!vendorId || vendorId === "undefined") {
            return res.status(400).json({ message: "Vendor ID is required" });
        }
        const searchDate = new Date(date);
        searchDate.setUTCHours(0, 0, 0, 0);

        // 2. Cast to ObjectId if necessary (prevents "CastError")
        const record = await DailyRecord.findOne({
            vendorId: new mongoose.Types.ObjectId(vendorId),
            date: searchDate
        }).lean();

        if (!record) {
            return res.status(404).json({ message: "No record found for this date" });
        }
        // Format specifically for the Ledger UI components
        res.json({
            summary: {
                sales: record.calculatedIncome,
                profit: record.profit,
                expenses: record.totalExpense,
                waste: record.wastedItems.reduce((sum, i) => sum + i.estimatedLoss, 0)
            },
            salesItems: record.itemsSold,
            expenseItems: record.expenses,
            tips: record.suggestions
        });
    } catch (error) {
        console.error("Backend Error:", error); // This will show in your terminal
        res.status(500).json({ error: "Internal Server Error" });
    }
};