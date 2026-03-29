import mongoose from "mongoose";

const { Schema } = mongoose;

const DailyRecordSchema = new Schema({
  vendorId: {
    type: Schema.Types.ObjectId,
    ref: "Vendor"
  },

  date: Date,

  itemsSold: [
    {
      item: String,
      quantity: Number,
      total: Number,
      avgPricePerUnit: Number
    }
  ],

  expenses: [
    {
      type: { type: String },
      total: Number
    }
  ],

  unsoldItems: [
    {
      item: String,
      quantity: Number
    }
  ],

  wastedItems: [
    {
      item: String,
      quantity: Number,
      estimatedLoss: Number
    }
  ],

  udharSummary: {
    givenToday: Number,
    receivedToday: Number
  },

  calculatedIncome: Number,
  totalExpense: Number,
  profit: Number,

  totalTransactions: Number,

  activeHours: {
    morning: Number,
    afternoon: Number,
    evening: Number
  },

  suggestions: [
    {
      type: { type: String },
      message: String,
      priority: {
        type: String,
        enum: ["high", "medium", "low"]
      }
    }
  ]

}, { timestamps: true });

export const DailyRecord = mongoose.model("DailyRecord", DailyRecordSchema);