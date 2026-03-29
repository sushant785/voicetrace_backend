import { DailyRecord } from "../models/DailyRecord.js";
import { SaleEvent } from "../models/SaleEvent.js";
import { ExpenseEvent } from "../models/ExpenseEvent.js";
import { UdharEvent } from "../models/UdharEvent.js";

export const updateDailyRecord = async (vendorId, date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

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