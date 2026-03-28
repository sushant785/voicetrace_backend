import express from "express";
import mongoose from "mongoose";
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
