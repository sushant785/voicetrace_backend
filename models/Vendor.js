import mongoose from "mongoose";

const { Schema } = mongoose;

const VendorSchema = new Schema({
  name: String,
  phone: String,
  language: {
    type: String,
    enum: ["hindi", "marathi", "hinglish"]
  },

  items: [
    {
      item: String,
      costPrice: Number,
      sellingPrice: Number,
      unit: String
    }
  ]
}, { timestamps: true });

export const Vendor = mongoose.model("Vendor", VendorSchema);