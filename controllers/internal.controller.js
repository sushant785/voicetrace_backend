import { updateDailyRecord } from "../services/daily.service.js";

export const triggerDailyUpdate = async (req, res) => {
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