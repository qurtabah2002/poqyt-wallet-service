import { prisma } from '../db/prisma.js';

export const createWallet = async (req, res, next) => {
  try {
    const { ownerType = 'INVESTOR', ownerId, currency = 'NOK' } = req.body;

    if (!ownerId) {
      return res.status(400).json({ error: 'ownerId is required' });
    }

    const wallet = await prisma.wallet.create({
      data: { ownerType, ownerId, currency }
    });

    res.status(201).json({
        id: wallet.id,
        ownerType: wallet.ownerType,
        ownerId: wallet.ownerId,
        currency: wallet.currency,
        availableOre: wallet.availableOre.toString(),
        reservedOre: wallet.reservedOre.toString(),
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
    });

  } catch (err) {
    // Unique constraint (wallet already exists)
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Wallet already exists for this owner/currency' });
    }
    next(err);
  }
};

export const getWallet = async (req, res, next) => {
  try {
    const { walletId } = req.params;

    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });

    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    res.json({
      id: wallet.id,
      ownerType: wallet.ownerType,
      ownerId: wallet.ownerId,
      currency: wallet.currency,
      availableOre: wallet.availableOre.toString(),
      reservedOre: wallet.reservedOre.toString(),
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    });
  } catch (err) {
    next(err);
  }
};

export const getLedger = async (req, res, next) => {
  try {
    const { walletId } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

    const entries = await prisma.ledgerEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    res.json(entries.map(e => ({
      id: e.id,
      type: e.type,
      amountOre: e.amountOre.toString(),
      currency: e.currency,
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      metadata: e.metadata,
      createdAt: e.createdAt
    })));
  } catch (err) {
    next(err);
  }
};




export const reserveFunds = async (req, res, next) => {
  try {
    const { walletId } = req.params;
    const { campaignId, amountOre } = req.body;

    if (!campaignId) return res.status(400).json({ error: 'campaignId is required' });
    if (amountOre === undefined) return res.status(400).json({ error: 'amountOre is required' });

    const amount = BigInt(amountOre);
    if (amount <= 0n) return res.status(400).json({ error: 'amountOre must be > 0' });

    const result = await prisma.$transaction(async (tx) => {
      // Lock the wallet row so concurrent reserves can’t overspend
      // (Prisma doesn't expose SELECT ... FOR UPDATE directly, so we use a raw query for locking.)
      const wallets = await tx.$queryRaw`
        SELECT * FROM "Wallet" WHERE id = ${walletId} FOR UPDATE
      `;
      const wallet = wallets[0];
      if (!wallet) {
        const err = new Error('Wallet not found');
        err.status = 404;
        throw err;
      }

      const available = BigInt(wallet.availableOre);
      if (available < amount) {
        const err = new Error('Insufficient available balance');
        err.status = 409;
        throw err;
      }

      // Update wallet balances
      const updatedWallet = await tx.wallet.update({
        where: { id: walletId },
        data: {
          availableOre: available - amount,
          reservedOre: BigInt(wallet.reservedOre) + amount,
        },
      });

      // Create reservation
      const reservation = await tx.reservation.create({
        data: {
          walletId,
          campaignId,
          amountOre: amount,
        },
      });

      // Ledger entry
      await tx.ledgerEntry.create({
        data: {
          walletId,
          type: 'RESERVE',
          amountOre: amount,
          currency: updatedWallet.currency,
          referenceType: 'CAMPAIGN',
          referenceId: campaignId,
          metadata: { reservationId: reservation.id },
        },
      });

      return { updatedWallet, reservation };
    });

    res.status(201).json({
      walletId: result.updatedWallet.id,
      currency: result.updatedWallet.currency,
      availableOre: result.updatedWallet.availableOre.toString(),
      reservedOre: result.updatedWallet.reservedOre.toString(),
      reservation: {
        id: result.reservation.id,
        campaignId: result.reservation.campaignId,
        amountOre: result.reservation.amountOre.toString(),
        status: result.reservation.status,
        createdAt: result.reservation.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const releaseReservation = async (req, res, next) => {
  try {
    const { walletId, reservationId } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      // Lock wallet row to avoid concurrent balance changes
      const wallets = await tx.$queryRaw`
        SELECT * FROM "Wallet" WHERE id = ${walletId} FOR UPDATE
      `;
      const wallet = wallets[0];
      if (!wallet) {
        const err = new Error('Wallet not found');
        err.status = 404;
        throw err;
      }

      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation || reservation.walletId !== walletId) {
        const err = new Error('Reservation not found for this wallet');
        err.status = 404;
        throw err;
      }

      if (reservation.status !== 'ACTIVE') {
        const err = new Error(`Reservation is not ACTIVE (current: ${reservation.status})`);
        err.status = 409;
        throw err;
      }

      const amount = BigInt(reservation.amountOre);

      // Update wallet balances: reserved -> available
      const updatedWallet = await tx.wallet.update({
        where: { id: walletId },
        data: {
          availableOre: BigInt(wallet.availableOre) + amount,
          reservedOre: BigInt(wallet.reservedOre) - amount,
        },
      });

      // Update reservation status
      const updatedReservation = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'RELEASED' },
      });

      // Ledger entry
      await tx.ledgerEntry.create({
        data: {
          walletId,
          type: 'RELEASE',
          amountOre: amount,
          currency: updatedWallet.currency,
          referenceType: 'CAMPAIGN',
          referenceId: updatedReservation.campaignId,
          metadata: { reservationId },
        },
      });

      return { updatedWallet, updatedReservation };
    });

    res.json({
      walletId: result.updatedWallet.id,
      currency: result.updatedWallet.currency,
      availableOre: result.updatedWallet.availableOre.toString(),
      reservedOre: result.updatedWallet.reservedOre.toString(),
      reservation: {
        id: result.updatedReservation.id,
        campaignId: result.updatedReservation.campaignId,
        amountOre: result.updatedReservation.amountOre.toString(),
        status: result.updatedReservation.status,
        updatedAt: result.updatedReservation.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const settleReservation = async (req, res, next) => {
  try {
    const { walletId, reservationId } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      // Lock wallet row to avoid concurrent balance changes
      const wallets = await tx.$queryRaw`
        SELECT * FROM "Wallet" WHERE id = ${walletId} FOR UPDATE
      `;
      const wallet = wallets[0];
      if (!wallet) {
        const err = new Error('Wallet not found');
        err.status = 404;
        throw err;
      }

      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation || reservation.walletId !== walletId) {
        const err = new Error('Reservation not found for this wallet');
        err.status = 404;
        throw err;
      }

      if (reservation.status !== 'ACTIVE') {
        const err = new Error(`Reservation is not ACTIVE (current: ${reservation.status})`);
        err.status = 409;
        throw err;
      }

      const amount = BigInt(reservation.amountOre);

      // Safety: reserved must be >= amount
      const reserved = BigInt(wallet.reservedOre);
      if (reserved < amount) {
        const err = new Error('Reserved balance is less than reservation amount (data inconsistency)');
        err.status = 409;
        throw err;
      }

      // Update wallet balances: reserved -> settled out
      const updatedWallet = await tx.wallet.update({
        where: { id: walletId },
        data: {
          reservedOre: reserved - amount,
          // available unchanged
        },
      });

      // Update reservation status
      const updatedReservation = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'SETTLED' },
      });

      // Ledger entry
      await tx.ledgerEntry.create({
        data: {
          walletId,
          type: 'SETTLE',
          amountOre: amount,
          currency: updatedWallet.currency,
          referenceType: 'CAMPAIGN',
          referenceId: updatedReservation.campaignId,
          metadata: { reservationId },
        },
      });

      return { updatedWallet, updatedReservation };
    });

    res.json({
      walletId: result.updatedWallet.id,
      currency: result.updatedWallet.currency,
      availableOre: result.updatedWallet.availableOre.toString(),
      reservedOre: result.updatedWallet.reservedOre.toString(),
      reservation: {
        id: result.updatedReservation.id,
        campaignId: result.updatedReservation.campaignId,
        amountOre: result.updatedReservation.amountOre.toString(),
        status: result.updatedReservation.status,
        updatedAt: result.updatedReservation.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};
