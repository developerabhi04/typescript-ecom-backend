import express from "express";
import { getBarCharts, getDashboardStats, getLineCharts, getPieCharts } from "../controllers/statistics.js";
import { adminOnly } from "../middlewares/auth.js";


const router = express.Router();

// route - /api/v1/dashboard/stats
router.get("/stats", adminOnly, getDashboardStats);

// route - /api/v1/dashboard/pie
router.get("/pie", adminOnly, getPieCharts);

// route - /api/v1/dashboard/bar
router.get("/bar", adminOnly, getBarCharts);

// route - /api/v1/dashboard/line
router.get("/line", adminOnly, getLineCharts);

export default router;
