import express from "express";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import { DailyRecord } from "../models/DailyRecord.js";

const router = express.Router();

const recalculateRecordMetrics = (record) => {
  const totalIncome = (record.itemsSold || []).reduce(
    (sum, item) => sum + (item.total || 0),
    0
  );

  record.calculatedIncome = totalIncome;
  record.totalExpense = record.totalExpense || 0;
  record.profit = totalIncome - record.totalExpense;
};

const getRecordOr404 = async (recordId, res) => {
  if (!mongoose.Types.ObjectId.isValid(recordId)) {
    res.status(400).json({ message: "Invalid DailyRecord id" });
    return null;
  }

  const record = await DailyRecord.findById(recordId);
  if (!record) {
    res.status(404).json({ message: "DailyRecord not found" });
    return null;
  }

  return record;
};

const findItemIndex = (items, itemName) => {
  const target = itemName.trim().toLowerCase();
  return items.findIndex((i) => (i.item || "").trim().toLowerCase() === target);
};

const formatCurrency = (value) => `INR ${Number(value || 0).toFixed(2)}`;

const formatDate = (value) => new Date(value).toLocaleDateString("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

router.get("/weekly-summary/pdf", async (req, res) => {
  try {
    const vendorId = (req.query.vendorId || "").toString().trim();
    const weekStartRaw = (req.query.weekStart || "").toString().trim();

    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Valid vendorId query param is required" });
    }

    if (!weekStartRaw) {
      return res.status(400).json({ message: "weekStart query param is required (YYYY-MM-DD)" });
    }

    const weekStart = new Date(weekStartRaw);
    if (Number.isNaN(weekStart.getTime())) {
      return res.status(400).json({ message: "Invalid weekStart date" });
    }

    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const records = await DailyRecord.find({
      vendorId,
      date: { $gte: weekStart, $lte: weekEnd },
    }).sort({ date: 1 });

    if (!records.length) {
      return res.status(404).json({
        message: "No DailyRecord data found for the selected week",
        vendorId,
        weekStart,
        weekEnd,
      });
    }

    const summary = {
      totalIncome: 0,
      totalExpense: 0,
      totalProfit: 0,
      totalTransactions: 0,
      udharGiven: 0,
      udharReceived: 0,
      wastedEstimatedLoss: 0,
      activeDays: records.length,
    };

    const itemMap = {};
    const expenseMap = {};

    records.forEach((record) => {
      summary.totalIncome += Number(record.calculatedIncome || 0);
      summary.totalExpense += Number(record.totalExpense || 0);
      summary.totalProfit += Number(record.profit || 0);
      summary.totalTransactions += Number(record.totalTransactions || 0);
      summary.udharGiven += Number(record.udharSummary?.givenToday || 0);
      summary.udharReceived += Number(record.udharSummary?.receivedToday || 0);

      (record.itemsSold || []).forEach((line) => {
        const key = (line.item || "Unknown").trim() || "Unknown";
        if (!itemMap[key]) {
          itemMap[key] = { quantity: 0, total: 0 };
        }
        itemMap[key].quantity += Number(line.quantity || 0);
        itemMap[key].total += Number(line.total || 0);
      });

      (record.expenses || []).forEach((line) => {
        const key = (line.type || "other").trim() || "other";
        if (!expenseMap[key]) {
          expenseMap[key] = 0;
        }
        expenseMap[key] += Number(line.total || 0);
      });

      (record.wastedItems || []).forEach((line) => {
        summary.wastedEstimatedLoss += Number(line.estimatedLoss || 0);
      });
    });

    const topItems = Object.entries(itemMap)
      .map(([item, data]) => ({ item, quantity: data.quantity, total: data.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const expenseBreakdown = Object.entries(expenseMap)
      .map(([type, total]) => ({ type, total }))
      .sort((a, b) => b.total - a.total);

    const fileDate = weekStartRaw.replace(/[^0-9-]/g, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=weekly-income-statement-${fileDate}.pdf`
    );

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    doc.fontSize(18).text("Weekly Income Statement", { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#444444").text("Informal proof of income generated from daily business entries");
    doc.moveDown(0.6);
    doc.fillColor("#000000");

    doc.fontSize(11).text(`Vendor ID: ${vendorId}`);
    doc.text(`Week Covered: ${formatDate(weekStart)} to ${formatDate(weekEnd)}`);
    doc.text(`Generated On: ${formatDate(new Date())}`);
    doc.moveDown(0.8);

    doc.fontSize(13).text("Summary", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);
    doc.text(`Total Income: ${formatCurrency(summary.totalIncome)}`);
    doc.text(`Total Expense: ${formatCurrency(summary.totalExpense)}`);
    doc.text(`Net Profit/Loss: ${formatCurrency(summary.totalProfit)}`);
    doc.text(`Total Transactions: ${summary.totalTransactions}`);
    doc.text(`Active Days with Entries: ${summary.activeDays}`);
    doc.text(`Udhar Given: ${formatCurrency(summary.udharGiven)}`);
    doc.text(`Udhar Received: ${formatCurrency(summary.udharReceived)}`);
    doc.text(`Estimated Loss from Wastage: ${formatCurrency(summary.wastedEstimatedLoss)}`);
    doc.moveDown(0.9);

    doc.fontSize(13).text("Top Sold Items", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);
    if (!topItems.length) {
      doc.text("No sold item details available for this week.");
    } else {
      topItems.forEach((line, idx) => {
        doc.text(`${idx + 1}. ${line.item} - Qty ${line.quantity}, Sales ${formatCurrency(line.total)}`);
      });
    }
    doc.moveDown(0.9);

    doc.fontSize(13).text("Expense Breakdown", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);
    if (!expenseBreakdown.length) {
      doc.text("No expense details available for this week.");
    } else {
      expenseBreakdown.forEach((line) => {
        doc.text(`- ${line.type}: ${formatCurrency(line.total)}`);
      });
    }

    doc.moveDown(1.1);
    doc.fontSize(10).fillColor("#333333");
    doc.text(
      "Declaration: This statement is generated from daily records maintained by the vendor for regular business tracking. It is not an audited financial statement, but may be used as informal income proof where acceptable.",
      { align: "left" }
    );
    doc.moveDown(1.5);
    doc.fillColor("#000000").fontSize(10);
    doc.text("Vendor Signature: ____________________");
    doc.text("Contact Number: ______________________");

    doc.end();
  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate weekly summary PDF",
      error: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const { vendorId, date, itemsSold = [] } = body;

    if (!req.body) {
      return res.status(400).json({
        message: "Request body is required. Send JSON with Content-Type: application/json",
      });
    }

    if (vendorId && !mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Invalid vendorId" });
    }

    const normalizedItems = (itemsSold || []).map((entry) => {
      const item = (entry.item || "").trim();
      const quantity = Number(entry.quantity || 0);
      const pricePerUnit = Number(entry.pricePerUnit ?? entry.avgPricePerUnit ?? 0);
      const total = Number(entry.total ?? quantity * pricePerUnit);

      return {
        item,
        quantity,
        total,
        avgPricePerUnit: quantity ? total / quantity : 0,
      };
    }).filter((entry) => entry.item && entry.quantity > 0);

    const record = await DailyRecord.create({
      vendorId,
      date: date ? new Date(date) : new Date(),
      itemsSold: normalizedItems,
      expenses: [],
      unsoldItems: [],
      wastedItems: [],
      udharSummary: { givenToday: 0, receivedToday: 0 },
      totalExpense: 0,
      totalTransactions: 0,
      activeHours: { morning: 0, afternoon: 0, evening: 0 },
      suggestions: [],
    });

    recalculateRecordMetrics(record);
    await record.save();

    return res.status(201).json({
      message: "DailyRecord created",
      recordId: record.id,
      record,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create DailyRecord", error: error.message });
  }
});

router.get("/:recordId/items-sold", async (req, res) => {
  try {
    const record = await getRecordOr404(req.params.recordId, res);
    if (!record) return;

    return res.json({
      recordId: record.id,
      itemsSold: record.itemsSold || [],
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch itemsSold", error: error.message });
  }
});

router.post("/:recordId/items-sold", async (req, res) => {
  try {
    const record = await getRecordOr404(req.params.recordId, res);
    if (!record) return;

    const body = req.body || {};
    const item = (body.item || "").trim();
    const quantity = Number(body.quantity);
    const pricePerUnit = Number(body.pricePerUnit);

    if (!item) {
      return res.status(400).json({ message: "item is required" });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "quantity must be a positive number" });
    }

    if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
      return res.status(400).json({ message: "pricePerUnit must be a non-negative number" });
    }

    const existingIndex = findItemIndex(record.itemsSold || [], item);
    if (existingIndex >= 0) {
      return res.status(409).json({
        message: "Item already exists in itemsSold. Use PATCH to add quantity/price via taps.",
      });
    }

    const total = quantity * pricePerUnit;

    record.itemsSold.push({
      item,
      quantity,
      total,
      avgPricePerUnit: quantity ? total / quantity : 0,
    });

    recalculateRecordMetrics(record);
    await record.save();

    return res.status(201).json({
      message: "Item added to itemsSold",
      recordId: record.id,
      itemsSold: record.itemsSold,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to add item", error: error.message });
  }
});




// Tap-friendly update: adds sold quantity and unit price to an existing item.
router.patch("/:recordId/items-sold/:item", async (req, res) => {
  try {
    const record = await getRecordOr404(req.params.recordId, res);
    if (!record) return;

    const itemName = decodeURIComponent(req.params.item || "").trim();
    const body = req.body || {};
    const quantity = Number(body.quantity ?? 1);
    const pricePerUnit = Number(body.pricePerUnit);

    if (!itemName) {
      return res.status(400).json({ message: "item path param is required" });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "quantity must be a positive number" });
    }

    if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
      return res.status(400).json({ message: "pricePerUnit must be a non-negative number" });
    }

    const idx = findItemIndex(record.itemsSold || [], itemName);
    if (idx < 0) {
      return res.status(404).json({ message: "Item not found in itemsSold" });
    }

    const line = record.itemsSold[idx];
    line.quantity = (line.quantity || 0) + quantity;
    line.total = (line.total || 0) + quantity * pricePerUnit;
    line.avgPricePerUnit = line.quantity ? line.total / line.quantity : 0;

    recalculateRecordMetrics(record);
    await record.save();

    return res.json({
      message: "Item updated in itemsSold",
      recordId: record.id,
      item: line,
      itemsSold: record.itemsSold,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update item", error: error.message });
  }
});

router.delete("/:recordId/items-sold/:item", async (req, res) => {
  try {
    const record = await getRecordOr404(req.params.recordId, res);
    if (!record) return;

    const itemName = decodeURIComponent(req.params.item || "").trim();
    const idx = findItemIndex(record.itemsSold || [], itemName);

    if (idx < 0) {
      return res.status(404).json({ message: "Item not found in itemsSold" });
    }

    record.itemsSold.splice(idx, 1);
    recalculateRecordMetrics(record);
    await record.save();

    return res.json({
      message: "Item removed from itemsSold",
      recordId: record.id,
      itemsSold: record.itemsSold,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete item", error: error.message });
  }
});




export default router;
