import { ExpenseEvent } from "../models/ExpenseEvent.js";
import { updateDailyRecord } from "../services/daily.servicess.js";

export const triggerDailyUpdate = async (req, res) => {
  console.log("🔥 /update-daily HIT", req.body);
  try {
    const { vendorId, date } = req.body;

    if (!vendorId || !date) {
      return res.status(400).json({
        error: "vendorId and date are required"
      });
    }

    await updateDailyRecord(vendorId, date);

    return res.json({
      message: "DailyRecord updated successfully"
    });

  } catch (error) {
    console.error("Update error:", error);

    return res.status(500).json({
      error: "Failed to update DailyRecord"
    });
  }
};

export const addExpense = async (req, res) => {
  try {
    const { vendorId, amount, type } = req.body;

    const expense = await ExpenseEvent.create({
      vendorId,
      amount,
      type, // e.g. "gas", "raw material"
      date: new Date(),
      timestamp: new Date()
    });

    // 🔥 IMPORTANT: update daily record
    await updateDailyRecord(vendorId, new Date());

    res.json({ message: "Expense added", expense });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add expense" });
  }
};