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
  let totalExpense = 0;
  const expenseMap = {};

  expenses.forEach(e => {
    totalExpense += e.amount || 0;

    if (!expenseMap[e.expenseType]) {
      expenseMap[e.expenseType] = 0;
    }
    expenseMap[e.expenseType] += e.amount;
  });

  const expenseList = Object.entries(expenseMap).map(([type, total]) => ({
    type,
    total
  }));

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