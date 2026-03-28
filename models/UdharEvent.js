import mongoose from "mongoose";

const { Schema } = mongoose;

const UdharEventSchema = new Schema({
  vendorId: {
    type: Schema.Types.ObjectId,
    ref: "Vendor"
  },

  timestamp: Date,
  date: Date,

  voiceUrl: String,
  transcript: String,

  personName: String,
  amount: Number,

  type: {
    type: String,
    enum: ["given", "received"]
  },

  flags: [
    {
      type: String,
      enum: ["ambiguous_person", "approximation_used"]
    }
  ],

  confidence: Number

}, { timestamps: true });

export const UdharEvent = mongoose.model("UdharEvent", UdharEventSchema);