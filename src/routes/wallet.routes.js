import express from 'express';

import { reserveFunds } from '../controllers/wallet.controller.js';

import { createWallet, getWallet, getLedger } from '../controllers/wallet.controller.js';

import { releaseReservation } from '../controllers/wallet.controller.js';

import { settleReservation } from '../controllers/wallet.controller.js';



const router = express.Router();

// Create wallet for an investor
router.post('/', createWallet);

// Get balances
router.get('/:walletId', getWallet);

// Get ledger entries
router.get('/:walletId/ledger', getLedger);

// Reserve funds for a campaign
router.post('/:walletId/reservations', reserveFunds);


// Release a reservation
router.post('/:walletId/reservations/:reservationId/release', releaseReservation);

// Settle a reservation
router.post('/:walletId/reservations/:reservationId/settle', settleReservation);

export default router;
