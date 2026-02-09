import { prisma } from '../db/prisma.js';

// Processes an incoming event
export async function processEvent(event) {
    // Validate event
  if (!event?.eventId || !event?.type) {
    const e = new Error('eventId and type are required');
    e.status = 400;
    throw e;
  }
    // Check for duplicate processing
  const already = await prisma.processedEvent.findUnique({
    where: { eventId: event.eventId },
  });

  if (already) {
    return { status: 'IGNORED_DUPLICATE', eventId: event.eventId };
  }
  // Process event based on its type
  switch (event.type) {
    case 'PaymentReceived':
      await handlePaymentReceived(event);
      break;

    case 'CampaignFailed':
      await handleCampaignFailed(event);
      break;

    case 'DisbursementExecuted':
      await handleDisbursementExecuted(event);
      break;

    default:
      const e = new Error(`Unknown event type: ${event.type}`);
      e.status = 400;
      throw e;
  }

  await prisma.processedEvent.create({
    data: { eventId: event.eventId, eventType: event.type },
  });

  return { status: 'PROCESSED', eventId: event.eventId };
}

async function handlePaymentReceived(event) {
  const { walletId, amountOre, currency = 'NOK', referenceId } = event.data || {};
  if (!walletId || amountOre === undefined || !referenceId) {
    const e = new Error('PaymentReceived requires walletId, amountOre, referenceId');
    e.status = 400;
    throw e;
  }

  const amount = BigInt(amountOre);
  // Update wallet and create ledger entry within a transaction
  await prisma.$transaction(async (tx) => {
    const wallets = await tx.$queryRaw`
      SELECT * FROM "Wallet" WHERE id = ${walletId} FOR UPDATE
    `;
    const wallet = wallets[0];
    if (!wallet) {
      const e = new Error('Wallet not found');
      e.status = 404;
      throw e;
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: walletId },
      data: { availableOre: BigInt(wallet.availableOre) + amount },
    });

    await tx.ledgerEntry.create({
      data: {
        walletId,
        type: 'CREDIT',
        amountOre: amount,
        currency: updatedWallet.currency,
        referenceType: 'PAYMENT',
        referenceId,
        metadata: { source: 'PaymentReceived', rawCurrency: currency },
      },
    });
  });
}
// Handle CampaignFailed event: release all ACTIVE reservations for the campaign and update wallets and ledger entries accordingly
async function handleCampaignFailed(event) {
  const { campaignId } = event.data || {};

  if (!campaignId) {
    const e = new Error('CampaignFailed requires campaignId');
    e.status = 400;
    throw e;
  }

  const activeReservations = await prisma.reservation.findMany({
    where: { campaignId, status: 'ACTIVE' },
  });

  if (activeReservations.length === 0) return;
// Group reservations by walletId for efficient processing
  const byWallet = new Map();
  for (const r of activeReservations) {
    const arr = byWallet.get(r.walletId) || [];
    arr.push(r);
    byWallet.set(r.walletId, arr);
  }
// Process each wallet's reservations in a transaction to ensure consistency
  for (const [walletId, reservations] of byWallet.entries()) {
    await prisma.$transaction(async (tx) => {
      const wallets = await tx.$queryRaw`
        SELECT * FROM "Wallet" WHERE id = ${walletId} FOR UPDATE
      `;
      const wallet = wallets[0];
      if (!wallet) return;

      let available = BigInt(wallet.availableOre);
      let reserved = BigInt(wallet.reservedOre);

      for (const r of reservations) {
        const current = await tx.reservation.findUnique({ where: { id: r.id } });
        if (!current || current.status !== 'ACTIVE') continue;

        const amount = BigInt(current.amountOre);
        available += amount;
        reserved -= amount;

        await tx.reservation.update({
          where: { id: current.id },
          data: { status: 'RELEASED' },
        });

        await tx.ledgerEntry.create({
          data: {
            walletId,
            type: 'RELEASE',
            amountOre: amount,
            currency: wallet.currency,
            referenceType: 'CAMPAIGN',
            referenceId: campaignId,
            metadata: { reservationId: current.id, reason: 'CampaignFailed' },
          },
        });
      }

      await tx.wallet.update({
        where: { id: walletId },
        data: { availableOre: available, reservedOre: reserved },
      });
    });
  }
}

/* //handleDisbursementExecuted(event)
async function handleDisbursementExecuted(event) {
    const { campaignId } = event.data || {};
    //validate campaign ID
    if (!campaignId) {
        const e = new Error('CampaignID is not valid');
        e.status = 400;
        throw e;
    }
    //Finding all the ACTIVE reservations for the campaign
    const activeReservations = await prisma.reservation.findMany(
        { where: { campaignId, status: 'ACTIVE' } }
    )

    //handle actres length error
    if (activeReservations.length === 0){ return}


    //Settle them (reserved ↓, reservation status → SETTLED, ledger entry SETTLE)
    
    
} */