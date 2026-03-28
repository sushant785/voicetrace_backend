import mongoose from "mongoose";

const { Schema } = mongoose;

const InsightsSchema = new Schema({
  vendorId: {
    type: Schema.Types.ObjectId,
    ref: "Vendor"
  },

  bestDays: [
    {
      day: String,
      avgIncome: Number
    }
  ],

  bestTimeOfDay: [
    {
      time: String,
      avgIncome: Number
    }
  ],

  bestItems: [
    {
      item: String,
      avgSold: Number,
      revenue: Number
    }
  ],

  worstItems: [
    {
      item: String,
      avgSold: Number,
      waste: Number
    }
  ],

  avgDailyIncome: Number,
  avgDailyExpense: Number,
  avgProfit: Number,
  wastePercentage: Number,

  totalUdharPending: Number,

  frequentBorrowers: [
    {
      personName: String,
      amount: Number
    }
  ],

  anomalies: [
    {
      message: String,
      date: Date
    }
  ],

  suggestions: [
    {
      message: String,
      type: String
    }
  ]

}, { timestamps: true });

export const Insights = mongoose.model("Insights", InsightsSchema);