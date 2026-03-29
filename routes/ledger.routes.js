import express from 'express';
import { getDailyLedger } from '../controllers/ledger.controller.js';

const router = express.Router();

// endpoint: GET /api/ledger/daily
router.get('/daily', getDailyLedger);

export default router;