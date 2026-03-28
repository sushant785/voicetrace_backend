import { DailyRecord } from "../models/DailyRecord.js";
import { SaleEvent } from "../models/SaleEvent.js";
import { ExpenseEvent } from "../models/ExpenseEvent.js";
import { UdharEvent } from "../models/UdharEvent.js";
import { Insights } from "../models/Insights.js";

export const getHomeDashboard = async (req, res) => {
  try {
    const { vendorId } = req.params;
    
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
      } : null
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