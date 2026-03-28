import mongoose from "mongoose";

const { Schema } = mongoose;

const SaleEventSchema = new Schema({
  vendorId: {
    type: Schema.Types.ObjectId,
    ref: "Vendor"
  },

  timestamp: Date,
  date: Date,

  voiceUrl: String,
  transcript: String,

  item: String,
  quantity: Number,
  pricePerUnit: Number,
  amount: Number,

  flags: [
    {
      type: String,
      enum: [
        "approximation_used",
        "missing_quantity",
        "ambiguous_item"
      ]
    }
  ],

  confidence: Number,

  isCorrected: Boolean,
  correctedEventId: Schema.Types.ObjectId

}, { timestamps: true });

export const SaleEvent = mongoose.model("SaleEvent", SaleEventSchema);