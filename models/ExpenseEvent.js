import mongoose from "mongoose";

const { Schema } = mongoose;

const ExpenseEventSchema = new Schema({
  vendorId: {
    type: Schema.Types.ObjectId,
    ref: "Vendor"
  },

  timestamp: Date,
  date: Date,

  voiceUrl: String,
  transcript: String,

  amount: Number,
  expenseType: String,

  note: String,

  flags: [
    {
      type: String,
      enum: ["approximation_used", "ambiguous_expense"]
    }
  ],

  confidence: Number,

  isCorrected: Boolean,
  correctedEventId: Schema.Types.ObjectId

}, { timestamps: true });

export const ExpenseEvent = mongoose.model("ExpenseEvent", ExpenseEventSchema);