# VoiceTrace Node Server — Complete Codebase

> This file contains the complete source code provided for the Node.js server, organized by file path.
> The code below is preserved as provided.

---

## `config/db.js`

```js
import mongoose from "mongoose";


const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ DB Error:", error.message);
    process.exit(1);
  }
};


export const get_db = () => mongoose.connection.db;


export default connectDB;
```

---

## `config/s3.js`

```js
import { S3Client } from "@aws-sdk/client-s3";


const {
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_S3_ENDPOINT,
  AWS_S3_FORCE_PATH_STYLE,
} = process.env;


const s3Config = {
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
};


if (AWS_S3_ENDPOINT) {
  s3Config.endpoint = AWS_S3_ENDPOINT;
}


if (AWS_S3_FORCE_PATH_STYLE) {
  s3Config.forcePathStyle = AWS_S3_FORCE_PATH_STYLE === "true";
}


const s3Client = new S3Client(s3Config);


export default s3Client;
```

---

## `controllers/home.controller.js`

```js
import { DailyRecord } from "../models/DailyRecord.js";
import { SaleEvent } from "../models/SaleEvent.js";
import { ExpenseEvent } from "../models/ExpenseEvent.js";
import { UdharEvent } from "../models/UdharEvent.js";
import { Insights } from "../models/Insights.js";
import { get_db } from "../config/db.js";
import mongoose from "mongoose"; // 1. ADD THIS IMPORT

export const getHomeDashboard = async (req, res) => {
try {
const { vendorId } = req.params;
const vId = new mongoose.Types.ObjectId(vendorId);

const db = get_db();
// --- CHANGED FOR TESTING: Get Yesterday's Date Bounds ---
const targetDateStart = new Date();
targetDateStart.setDate(targetDateStart.getDate() - 4); // Subtract 1 day
targetDateStart.setHours(0, 0, 0, 0); // Start of yesterday

const targetDateEnd = new Date(targetDateStart);
targetDateEnd.setDate(targetDateEnd.getDate() + 1); // Start of today (exclusive upper bound)

// Helper object for querying within yesterday's range
const dateQuery = { $gte: targetDateStart, $lt: targetDateEnd };
// --------------------------------------------------------

// 1. Fetch Yesterday's Summary Data
const dailyRecord = await DailyRecord.findOne({
  vendorId,
  date: dateQuery
});

// 2. Fetch Long-term Insights (for Total Debt/Udhar)
const insights = await Insights.findOne({ vendorId });

// 3. Fetch Recent Activity (Combine Sales, Expenses, and Udhar)
const [sales, expenses, udhar] = await Promise.all([
  SaleEvent.find({ vendorId, date: dateQuery }).sort({ timestamp: -1 }).limit(5),
  ExpenseEvent.find({ vendorId, date: dateQuery }).sort({ timestamp: -1 }).limit(5),
  UdharEvent.find({ vendorId, date: dateQuery }).sort({ timestamp: -1 }).limit(5)
]);

// Format activities for the UI ActivityRow
const activities = [
  ...sales.map(s => ({
    id: s._id,
    icon: "💰", 
    title: `${s.quantity} ${s.item} sold`,
    sub: `₹${s.amount} • ${formatTime(s.timestamp)}`,
    isWarning: false,
    time: s.timestamp
  })),
  ...expenses.map(e => ({
    id: e._id,
    icon: "💸",
    title: e.expenseType || "Expense",
    sub: `₹${e.amount} • ${formatTime(e.timestamp)}`,
    isWarning: true,
    time: e.timestamp
  })),
  ...udhar.map(u => ({
    id: u._id,
    icon: "👤",
    title: `Udhar ${u.type} - ${u.personName}`,
    sub: `₹${u.amount} • ${formatTime(u.timestamp)}`,
    isWarning: u.type === "given",
    time: u.timestamp
  }))
].sort((a, b) => b.time - a.time).slice(0, 5);

const recommendations = await db.collection("recommendations")
  .find({ vendorId: vId }) 
  .sort({ date: -1 })
  .toArray();

console.log(`🔍 Found ${recommendations.length} recs for ${vendorId}`);

// 4. Construct Response Object
const dashboardData = {
  stats: {
    earnings: dailyRecord?.calculatedIncome || 0,
    profit: dailyRecord?.profit || 0,
    expenses: dailyRecord?.totalExpense || 0,
    debt: insights?.totalUdharPending || 0
  },
  inventorySummary: dailyRecord?.itemsSold?.map(item => ({
    label: item.item,
    count: item.quantity,
    icon: getIconForItem(item.item)
  })) || [],
  activities,
  wasteAlert: dailyRecord?.wastedItems?.[0] ? {
    item: dailyRecord.wastedItems[0].item,
    quantity: dailyRecord.wastedItems[0].quantity,
    loss: dailyRecord.wastedItems[0].estimatedLoss,
    remaining: dailyRecord.unsoldItems?.find(i => i.item === dailyRecord.wastedItems[0].item)?.quantity || 0
  } : null,
  recommendations: recommendations
};



res.status(200).json(dashboardData);

} catch (error) {
console.error("Dashboard Error:", error);
res.status(500).json({ message: "Error fetching dashboard data", error: error.message });
}
};

// Helper to format timestamp into "X mins ago", "Yesterday, HH:MM", or "HH:MM"
const formatTime = (date) => {
const diffMinutes = Math.floor((new Date() - new Date(date)) / 60000);

if (diffMinutes < 60) {
return `${diffMinutes} mins ago`;
}

// Adjusted for yesterday formatting
const timeString = new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const isYesterday = (new Date() - new Date(date)) > (24 * 60 * 60 * 1000);

return isYesterday ? `Yesterday, ${timeString}` : timeString;
};

// Helper to map item names to emojis
const getIconForItem = (itemName) => {
if (!itemName) return "📦";
const icons = { chai: "☕", tea: "☕", banana: "🍌", nuts: "🥜", default: "📦" };
return icons[itemName.toLowerCase()] || icons.default;
};
```

---

## `controllers/internal.controller.js`

```js
import { ExpenseEvent } from "../models/ExpenseEvent.js";
import { updateDailyRecord } from "../services/daily.services.js";

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
```

---

## `controllers/ledger.controller.js`

```js
import mongoose from "mongoose";
import { DailyRecord } from "../models/DailyRecord.js";

export const getDailyLedger = async (req, res) => {
try {
const { vendorId, date } = req.query;

    if (!vendorId || vendorId === "undefined") {
        return res.status(400).json({ message: "Vendor ID is required" });
    }
    const searchDate = new Date(date);
    searchDate.setUTCHours(0, 0, 0, 0);

    // 2. Cast to ObjectId if necessary (prevents "CastError")
    const record = await DailyRecord.findOne({
        vendorId: new mongoose.Types.ObjectId(vendorId),
        date: searchDate
    }).lean();

    if (!record) {
        return res.status(404).json({ message: "No record found for this date" });
    }
    // Format specifically for the Ledger UI components
    res.json({
        summary: {
            sales: record.calculatedIncome,
            profit: record.profit,
            expenses: record.totalExpense,
            waste: record.wastedItems.reduce((sum, i) => sum + i.estimatedLoss, 0)
        },
        salesItems: record.itemsSold,
        expenseItems: record.expenses,
        tips: record.suggestions
    });
} catch (error) {
    console.error("Backend Error:", error); // This will show in your terminal
    res.status(500).json({ error: "Internal Server Error" });
}

};
```

---

## `controllers/udhar.controller.js`

```js
import { UdharEvent } from "../models/UdharEvent.js";
import mongoose from "mongoose";

export const getUdharSummary = async (req, res) => {
try {
const { vendorId } = req.query;

// Clean the string to remove any hidden newlines/spaces
const cleanId = vendorId.trim(); 

const summary = await UdharEvent.aggregate([
  { $match: { vendorId: new mongoose.Types.ObjectId(cleanId) } },
  {
$group: {
_id: { $toLower: "$personName" }, // Group by name (lowercase to avoid duplicates)
displayName: { $first: "$personName" },
totalGiven: {
// Use $toDouble to ensure strings are converted to numbers for math
$sum: {
$cond: [
{ $eq: ["$type", "given"] },
{ $toDouble: "$amount" },
0
]
}
},
totalReceived: {
$sum: {
$cond: [
{ $eq: ["$type", "received"] },
{ $toDouble: "$amount" },
0
]
}
},
lastTransaction: { $max: "$date" }
}
},

  {
    $project: {
      name: "$displayName",
      pendingAmount: { $subtract: ["$totalGiven", "$totalReceived"] },
      lastUpdate: "$lastTransaction"
    }
  },
  { $sort: { pendingAmount: -1 } } // Show biggest debtors first
]);

const totalPending = summary.reduce((acc, curr) => {
return acc + (curr.pendingAmount > 0 ? curr.pendingAmount : 0);
}, 0);
console.log("DEBUG: summary array:", JSON.stringify(summary, null, 2));
res.json({
totalPending,
people: summary
});
} catch (error) {
res.status(500).json({ error: error.message });
}
};
```

---

## `models/DailyRecord.js`

```js
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
```

---

## `models/ExpenseEvent.js`

```js
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
```

---

## `models/Insights.js`

```js
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
```

---

## `models/SaleEvent.js`

```js
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
```

---

## `models/UdharEvent.js`

```js
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
```

---

## `models/Vendor.js`

```js
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
```

---

## `routes/home.route.js`

```js
import express from "express";
import { getHomeDashboard } from "../controllers/home.controller.js";
import { get_db } from "../config/db.js";
import mongoose from "mongoose";

const router = express.Router();

// GET /api/home/:vendorId
router.get("/insights/:vendorId", async (req, res) => {
try {
const { vendorId } = req.params;
const db = get_db();

if (!mongoose.Types.ObjectId.isValid(vendorId)) {
  return res.status(400).json({ message: "Invalid Vendor ID format" });
}

const vId = new mongoose.Types.ObjectId(vendorId);

// Fetch using the ObjectId type
const insights = await db.collection("insights").findOne({ vendorId: vId });

if (!insights) {
  console.log("No insights found for ID:", vendorId);
  return res.status(404).json({ message: "No insights found for this vendor" });
}

res.status(200).json(insights);

} catch (error) {
console.error("Error fetching insights:", error);
res.status(500).json({ error: "Internal Server Error" });
}
});
router.get("/:vendorId", getHomeDashboard);

export default router;
```

---

## `routes/internal.routes.js`

```js
import express from "express";

import { triggerDailyUpdate } from "../controllers/internal.controller.js";

import { addExpense } from "../controllers/internal.controller.js";





const router = express.Router();




// 🔥 Called ONLY by Python backend

router.post("/update-daily", triggerDailyUpdate);

router.post("/expense", addExpense);




export default router;
```

---

## `routes/ledger.routes.js`

```js
import express from 'express';

import { getDailyLedger } from '../controllers/ledger.controller.js';




const router = express.Router();




// endpoint: GET /api/ledger/daily

router.get('/daily', getDailyLedger);




export default router;
```

---

## `routes/recordings.js`

```js
import express from "express";
import multer from "multer";
import {
PutObjectCommand,
ListObjectsV2Command,
GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Client from "../config/s3.js";

const router = express.Router();

const ALLOWED_M4A_MIME_TYPES = ["audio/mp4", "audio/x-m4a"];

const isM4aFile = (file = {}) => {
const name = (file.originalname || "").toLowerCase();
const mime = (file.mimetype || "").toLowerCase();
return name.endsWith(".m4a") || ALLOWED_M4A_MIME_TYPES.includes(mime);
};

const upload = multer({
storage: multer.memoryStorage(),
limits: { fileSize: 25 * 1024 * 1024 },
fileFilter: (req, file, cb) => {
if (!isM4aFile(file)) {
return cb(new Error("Only .m4a audio files are allowed"));
}
return cb(null, true);
},
});

const bucket = process.env.AWS_S3_BUCKET;

if (!bucket) {
// Keep startup simple; API will return a clear error if bucket is missing.
console.warn("AWS_S3_BUCKET is not configured");
}

const sanitizeFileName = (name = "audio.m4a") =>
name.replace(/[^a-zA-Z0-9.*-]/g, "*");

const makeObjectKey = (userId, originalName) => {
const safeUserId = (userId || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "_");
const cleanName = sanitizeFileName(originalName || "audio.m4a");
const withM4aExtension = cleanName.toLowerCase().endsWith(".m4a")
? cleanName
: `${cleanName}.m4a`;
return `recordings/${safeUserId}/${Date.now()}-${withM4aExtension}`;
};

router.post("/upload", upload.single("audio"), async (req, res) => {
try {
if (!bucket) {
return res.status(500).json({ message: "AWS_S3_BUCKET is not configured" });
}

if (!req.file) {
  return res.status(400).json({ message: "No audio file provided. Use field name 'audio'." });
}

if (!isM4aFile(req.file)) {
  return res.status(400).json({ message: "Only .m4a audio files are allowed" });
}

const userId = req.body.userId || req.query.userId;
const key = makeObjectKey(userId, req.file.originalname);

const putCommand = new PutObjectCommand({
  Bucket: bucket,
  Key: key,
  Body: req.file.buffer,
  ContentType: "audio/mp4",
});

await s3Client.send(putCommand);

const signedUrl = await getSignedUrl(
  s3Client,
  new GetObjectCommand({ Bucket: bucket, Key: key }),
  { expiresIn: 60 * 60 }
);

return res.status(201).json({
  message: "Audio uploaded successfully",
  userId: userId || "anonymous",
  key,
  url: signedUrl,
});
} catch (error) {
return res.status(500).json({
message: "Failed to upload .m4a audio",
error: error.message,
});
}
});

router.get("/", async (req, res) => {
try {
if (!bucket) {
return res.status(500).json({ message: "AWS_S3_BUCKET is not configured" });
}

const userId = req.query.userId || "anonymous";
const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
const prefix = `recordings/${safeUserId}/`;

const listCommand = new ListObjectsV2Command({
  Bucket: bucket,
  Prefix: prefix,
});

const result = await s3Client.send(listCommand);
const objects = result.Contents || [];

const recordings = await Promise.all(
  objects.map(async (item) => {
    const key = item.Key;
    if (!key) return null;

    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 60 * 60 }
    );

    return {
      key,
      size: item.Size,
      lastModified: item.LastModified,
      url,
    };
  })
);

return res.json({
  userId,
  count: recordings.filter(Boolean).length,
  recordings: recordings.filter(Boolean),
});
} catch (error) {
return res.status(500).json({
message: "Failed to fetch recordings",
error: error.message,
});
}
});

export default router;
```

---

## `routes/udhar.routes.js`

```js
import express from "express";

import { getUdharSummary } from "../controllers/udhar.controller.js";




const router = express.Router();




// This matches: GET /api/udhar/summary?vendorId=...

router.get("/summary", getUdharSummary);




export default router;
```

---

## `routes/dailyRecord.js`

```js
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
```

---

## `services/daily.services.js`

```js
import mongoose from "mongoose";
import { DailyRecord } from "../models/DailyRecord.js";
import { SaleEvent } from "../models/SaleEvent.js";
import { ExpenseEvent } from "../models/ExpenseEvent.js";
import { UdharEvent } from "../models/UdharEvent.js";

export const updateDailyRecord = async (vendorId, date) => {
const start = new Date(date);
start.setUTCHours(0, 0, 0, 0);
const end = new Date(date);
end.setUTCHours(23, 59, 59, 999);

const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

const sales = await SaleEvent.find({ vendorId, date: { $gte: start, $lte: end } });
const expenses = await ExpenseEvent.find({ vendorId, date: { $gte: start, $lte: end } });
const udhar = await UdharEvent.find({ vendorId, date: { $gte: start, $lte: end } });

// 🛒 Aggregate Sales
const itemMap = {};
let totalIncome = 0;

sales.forEach(s => {
totalIncome += s.amount || 0;

if (!itemMap[s.item]) {
  itemMap[s.item] = { quantity: 0, total: 0 };
}

itemMap[s.item].quantity += s.quantity || 0;
itemMap[s.item].total += s.amount || 0;
});

const itemsSold = Object.entries(itemMap).map(([item, data]) => ({
item,
quantity: data.quantity,
total: data.total,
avgPricePerUnit: data.quantity ? data.total / data.quantity : 0
}));

// 💸 Expenses
// 💸 Expenses
let totalExpense = 0;
const expenseMap = {};

expenses.forEach(e => {
// 1. Calculate the total (the 1050 you see in your summary)
totalExpense += Number(e.amount) || 0;

// 2. FIX: Check for both 'expenseType' or 'type' (naming safety)
const category = e.expenseType || e.type || "Other"; 

if (!expenseMap[category]) {
  expenseMap[category] = 0;
}
expenseMap[category] += Number(e.amount) || 0;
});

// 3. Map to the list
const expenseList = Object.entries(expenseMap).map(([type, total]) => ({
type: String(type),
total: Number(total)
}));

console.log("Calculated Expense List:", expenseList); // Check your terminal!

// 💳 Udhar
let givenToday = 0;
let receivedToday = 0;

udhar.forEach(u => {
if (u.type === "given") givenToday += u.amount;
else receivedToday += u.amount;
});

// 📈 Active Hours
const activeHours = { morning: 0, afternoon: 0, evening: 0 };

[...sales, ...expenses, ...udhar].forEach(e => {
const hour = new Date(e.timestamp).getHours();

if (hour < 12) activeHours.morning++;
else if (hour < 17) activeHours.afternoon++;
else activeHours.evening++;
});

const totalTransactions = sales.length + expenses.length + udhar.length;

const profit = totalIncome - totalExpense;

await DailyRecord.findOneAndUpdate(
{ vendorId, date: start },
{
vendorId,
date: start,
itemsSold,
expenses: expenseList,
calculatedIncome: totalIncome,
totalExpense,
profit,
totalTransactions,
activeHours,
udharSummary: { givenToday, receivedToday }
},
{ upsert: true, new: true }
);
};
```

---

## `app.js`

```js
import express from "express";
import cors from "cors";
import recordingsRouter from "./routes/recordings.js";
import homeRouter from "./routes/home.route.js"
import dailyRecordRouter from "./routes/dailyRecord.js";
import internalRouter from "./routes/internal.routes.js";
import ledgerRoutes from './routes/ledger.routes.js';
import udharRoutes from "./routes/udhar.routes.js";

const app = express();

app.use(cors({
origin: "http://localhost:5173"
}));
app.use(express.json());

app.get("/health", (req, res) => {
res.json({ ok: true });
});

app.use("/api/internal", internalRouter);
app.use("/api/recordings", recordingsRouter);
app.use("/api/home", homeRouter);
app.use("/api/daily-records", dailyRecordRouter);
app.use('/api/ledger', ledgerRoutes);
app.use("/api/udhar", udharRoutes);

export default app;
```

---

## `server.js`

```js
import 'dotenv/config'; // This handles everything automatically

import app from "./app.js";
import connectDB from "./config/db.js";

const PORT = process.env.PORT || 5000;

connectDB();

app.listen(PORT, () => {
console.log(`🚀 Server running on port ${PORT}`);
});
```
