import express from 'express';
import { getDb } from '../db/mongo.js';
import { authenticate, optionalAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

function getExpiryInfo(hours) {
  hours = Number(hours);
  if (hours <= 0) return { label: 'Expired', cls: 'badge-red', icon: '⛔', desc: 'This food can no longer be donated.' };
  if (hours <= 2) return { label: 'URGENT — Donate Immediately', cls: 'badge-red', icon: '🚨', desc: 'Extremely time-sensitive. Match and dispatch right away.' };
  if (hours <= 6) return { label: 'Donate Soon', cls: 'badge-amber', icon: '⏳', desc: 'Should be matched with an NGO within the next few hours.' };
  return { label: 'Safe to Donate', cls: 'badge-green', icon: '🟢', desc: 'Plenty of time — schedule a normal pickup.' };
}

// Generate unique donation ID
async function generateDonationId(db) {
  const count = await db.collection('donations').countDocuments();
  return 'DN-' + (500 + count + 1);
}

// Helper to push notification
async function logNotification(db, icon, text) {
  try {
    await db.collection('notifications').insertOne({
      icon,
      text,
      time: new Date(),
      createdAt: new Date()
    });
  } catch (e) {
    console.error('Notification log error:', e);
  }
}

// GET all donations with filters
router.get('/', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const { q, status, donorId, ngoId, volunteerId } = req.query;

    let filter = {};

    if (donorId) filter.donorId = donorId;
    if (ngoId) filter.ngoId = ngoId;
    if (volunteerId) filter.volunteerId = volunteerId;

    if (status && status !== 'All') {
      if (status === 'Urgent') {
        filter.expiryHours = { $gt: 0, $lte: 2 };
        filter.status = { $nin: ['Expired', 'Delivered'] };
      } else {
        filter.status = status;
      }
    }

    if (q) {
      const regex = { $regex: q, $options: 'i' };
      filter.$or = [
        { foodName: regex },
        { id: regex },
        { category: regex },
        { pickupLocation: regex }
      ];
    }

    let cursor = await db.collection('donations').find(filter);
    let donations = await cursor.toArray();

    // Sort by expiry hours ascending (soonest first)
    donations.sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours));

    res.json(donations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch donations.' });
  }
});

// GET priority donations (shortest expiry first)
router.get('/priority', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit) || 5;

    const donations = await (await db.collection('donations').find({
      status: { $nin: ['Expired', 'Delivered'] }
    })).toArray();

    donations.sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours));
    res.json(donations.slice(0, limit));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch priority donations.' });
  }
});

// GET single donation
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const donation = await db.collection('donations').findOne({ id: req.params.id });
    if (!donation) return res.status(404).json({ error: 'Donation not found.' });

    const donor = donation.donorId ? await db.collection('donors').findOne({ id: donation.donorId }) : null;
    const ngo = donation.ngoId ? await db.collection('ngos').findOne({ id: donation.ngoId }) : null;
    const volunteer = donation.volunteerId ? await db.collection('volunteers').findOne({ id: donation.volunteerId }) : null;

    res.json({
      ...donation,
      donorName: donor?.name || '—',
      ngoName: ngo?.name || '—',
      volunteerName: volunteer?.name || '—'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch donation details.' });
  }
});

// POST Create donation
router.post('/', authenticate, async (req, res) => {
  try {
    const { foodName, quantity, expiryHours, category, pickupLocation } = req.body;
    let donorId = req.body.donorId;

    if (!foodName || !quantity || expiryHours === undefined || expiryHours === '') {
      return res.status(400).json({ error: 'Food name, quantity, and remaining expiry hours are required.' });
    }

    const db = getDb();

    // If Donor role, ensure donorId matches user entityId
    if (req.user.role === 'Donor') {
      donorId = req.user.entityId;
    } else if (!donorId) {
      // Pick first donor if none provided by admin
      const firstDonor = await db.collection('donors').findOne({});
      donorId = firstDonor ? firstDonor.id : 'D-101';
    }

    const donor = await db.collection('donors').findOne({ id: donorId });
    const hours = Number(expiryHours);
    const status = hours <= 0 ? 'Expired' : 'Available';
    const donationId = await generateDonationId(db);

    const newDonation = {
      id: donationId,
      donorId,
      foodName: foodName.trim(),
      quantity: quantity.trim(),
      expiryHours: hours,
      category: category || 'Cooked Meal',
      pickupLocation: pickupLocation ? pickupLocation.trim() : (donor?.name || 'Chennai'),
      status,
      ngoId: null,
      volunteerId: null,
      timeline: [
        { step: 'Donation Created', done: true, at: new Date() },
        { step: 'Safety Checked', done: false },
        { step: 'Matched with NGO', done: false },
        { step: 'Volunteer Assigned', done: false },
        { step: 'Delivered', done: false }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('donations').insertOne(newDonation);

    await logNotification(db, '🍱', `New donation "${newDonation.foodName}" (${donationId}) listed by ${donor?.name || 'Donor'}.`);
    if (hours > 0 && hours <= 2) {
      await logNotification(db, '⚠', `Urgent: ${newDonation.foodName} expires in ${hours} hour(s) — match immediately!`);
    }

    res.status(201).json(newDonation);
  } catch (err) {
    console.error('Create donation error:', err);
    res.status(500).json({ error: 'Failed to create donation.' });
  }
});

// PUT Edit donation
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { foodName, quantity, expiryHours, category, pickupLocation, donorId } = req.body;
    const db = getDb();
    const donation = await db.collection('donations').findOne({ id: req.params.id });
    if (!donation) return res.status(404).json({ error: 'Donation not found.' });

    // Authorization: Admin or owner Donor
    if (req.user.role === 'Donor' && donation.donorId !== req.user.entityId) {
      return res.status(403).json({ error: 'You can only edit your own donations.' });
    }
    if (req.user.role === 'Donor' && donation.status !== 'Available') {
      return res.status(400).json({ error: 'You can only edit donations that are currently Available.' });
    }

    const updates = { updatedAt: new Date() };
    if (foodName) updates.foodName = foodName.trim();
    if (quantity) updates.quantity = quantity.trim();
    if (category) updates.category = category;
    if (pickupLocation) updates.pickupLocation = pickupLocation.trim();
    if (donorId && req.user.role === 'Admin') updates.donorId = donorId;

    if (expiryHours !== undefined && expiryHours !== '') {
      const h = Number(expiryHours);
      updates.expiryHours = h;
      if (h <= 0 && donation.status === 'Available') {
        updates.status = 'Expired';
      }
    }

    await db.collection('donations').updateOne({ id: req.params.id }, { $set: updates });
    const updated = await db.collection('donations').findOne({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update donation.' });
  }
});

// DELETE donation
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const donation = await db.collection('donations').findOne({ id: req.params.id });
    if (!donation) return res.status(404).json({ error: 'Donation not found.' });

    if (req.user.role === 'Donor' && donation.donorId !== req.user.entityId) {
      return res.status(403).json({ error: 'You can only delete your own donations.' });
    }

    await db.collection('donations').deleteOne({ id: req.params.id });
    res.json({ success: true, message: 'Donation deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete donation.' });
  }
});

// POST Claim donation (for NGO)
router.post('/:id/claim', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const donation = await db.collection('donations').findOne({ id: req.params.id });
    if (!donation) return res.status(404).json({ error: 'Donation not found.' });
    if (donation.status !== 'Available') {
      return res.status(400).json({ error: 'This donation is no longer available to claim.' });
    }

    const ngoId = req.user.role === 'NGO' ? req.user.entityId : (req.body.ngoId || 'N-201');
    const ngo = await db.collection('ngos').findOne({ id: ngoId });
    if (!ngo) return res.status(404).json({ error: 'NGO profile not found.' });

    const timeline = donation.timeline.map(t => {
      if (t.step === 'Safety Checked' || t.step === 'Matched with NGO') {
        return { ...t, done: true, at: t.at || new Date() };
      }
      return t;
    });

    await db.collection('donations').updateOne(
      { id: req.params.id },
      {
        $set: {
          status: 'Matched',
          ngoId: ngo.id,
          timeline,
          updatedAt: new Date()
        }
      }
    );

    await logNotification(db, '✓', `Donation ${donation.id} (${donation.foodName}) claimed by ${ngo.name}.`);

    const updated = await db.collection('donations').findOne({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to claim donation.' });
  }
});

// POST Match donation with NGO (Admin)
router.post('/:id/match', authenticate, requireRole(['Admin', 'NGO']), async (req, res) => {
  try {
    const { ngoId } = req.body;
    if (!ngoId) return res.status(400).json({ error: 'NGO ID is required for matching.' });

    const db = getDb();
    const donation = await db.collection('donations').findOne({ id: req.params.id });
    if (!donation) return res.status(404).json({ error: 'Donation not found.' });

    const ngo = await db.collection('ngos').findOne({ id: ngoId });
    if (!ngo) return res.status(404).json({ error: 'NGO not found.' });

    const timeline = donation.timeline.map(t => {
      if (t.step === 'Safety Checked' || t.step === 'Matched with NGO') {
        return { ...t, done: true, at: t.at || new Date() };
      }
      return t;
    });

    await db.collection('donations').updateOne(
      { id: req.params.id },
      {
        $set: {
          status: 'Matched',
          ngoId,
          timeline,
          updatedAt: new Date()
        }
      }
    );

    await logNotification(db, '✓', `Donation ${donation.id} matched with ${ngo.name}.`);

    const updated = await db.collection('donations').findOne({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to match donation.' });
  }
});

// POST Assign volunteer to donation
router.post('/:id/assign', authenticate, requireRole(['Admin', 'Volunteer']), async (req, res) => {
  try {
    const volunteerId = req.user.role === 'Volunteer' ? req.user.entityId : req.body.volunteerId;
    if (!volunteerId) return res.status(400).json({ error: 'Volunteer ID is required for assignment.' });

    const db = getDb();
    const donation = await db.collection('donations').findOne({ id: req.params.id });
    if (!donation) return res.status(404).json({ error: 'Donation not found.' });

    const volunteer = await db.collection('volunteers').findOne({ id: volunteerId });
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });

    const timeline = donation.timeline.map(t => {
      if (t.step === 'Volunteer Assigned') {
        return { ...t, done: true, at: new Date() };
      }
      return t;
    });

    await db.collection('donations').updateOne(
      { id: req.params.id },
      {
        $set: {
          status: 'Volunteer Assigned',
          volunteerId,
          timeline,
          updatedAt: new Date()
        }
      }
    );

    // Update volunteer availability status
    await db.collection('volunteers').updateOne(
      { id: volunteerId },
      { $set: { status: 'On Delivery', updatedAt: new Date() } }
    );

    await logNotification(db, '🚲', `Volunteer ${volunteer.name} assigned for delivery of ${donation.foodName} (${donation.id}).`);

    const updated = await db.collection('donations').findOne({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign volunteer.' });
  }
});

// POST Advance status timeline step
router.post('/:id/advance', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const donation = await db.collection('donations').findOne({ id: req.params.id });
    if (!donation) return res.status(404).json({ error: 'Donation not found.' });

    const nextStepIndex = donation.timeline.findIndex(t => !t.done);
    if (nextStepIndex === -1) {
      return res.json(donation);
    }

    const updatedTimeline = [...donation.timeline];
    updatedTimeline[nextStepIndex] = { ...updatedTimeline[nextStepIndex], done: true, at: new Date() };

    let newStatus = donation.status;
    const completedStepName = updatedTimeline[nextStepIndex].step;

    if (completedStepName === 'Matched with NGO') {
      newStatus = 'Matched';
    } else if (completedStepName === 'Volunteer Assigned') {
      newStatus = 'Volunteer Assigned';
    } else if (completedStepName === 'Delivered') {
      newStatus = 'Delivered';
      if (donation.volunteerId) {
        await db.collection('volunteers').updateOne(
          { id: donation.volunteerId },
          { $set: { status: 'Free', updatedAt: new Date() } }
        );
      }
      await logNotification(db, '✓', `Donation ${donation.id} marked as Delivered.`);
    }

    await db.collection('donations').updateOne(
      { id: req.params.id },
      { $set: { timeline: updatedTimeline, status: newStatus, updatedAt: new Date() } }
    );

    const updated = await db.collection('donations').findOne({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to advance status.' });
  }
});

// POST Mark as Delivered
router.post('/:id/deliver', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const donation = await db.collection('donations').findOne({ id: req.params.id });
    if (!donation) return res.status(404).json({ error: 'Donation not found.' });

    const updatedTimeline = donation.timeline.map(t => {
      if (t.step === 'Delivered') return { ...t, done: true, at: new Date() };
      return t;
    });

    await db.collection('donations').updateOne(
      { id: req.params.id },
      { $set: { status: 'Delivered', timeline: updatedTimeline, updatedAt: new Date() } }
    );

    if (donation.volunteerId) {
      await db.collection('volunteers').updateOne(
        { id: donation.volunteerId },
        { $set: { status: 'Free', updatedAt: new Date() } }
      );
    }

    await logNotification(db, '✓', `Donation ${donation.id} marked as Delivered.`);
    const updated = await db.collection('donations').findOne({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as delivered.' });
  }
});

// POST Fast forward time (+1 hour simulation)
router.post('/fast-forward', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const activeDonations = await (await db.collection('donations').find({
      status: { $nin: ['Delivered', 'Expired'] }
    })).toArray();

    let expiredCount = 0;
    let urgentCount = 0;

    for (const d of activeDonations) {
      const newExpiry = Math.max(0, +(Number(d.expiryHours) - 1).toFixed(1));
      let newStatus = d.status;

      if (newExpiry <= 0) {
        newStatus = 'Expired';
        expiredCount++;
        if (d.volunteerId) {
          await db.collection('volunteers').updateOne(
            { id: d.volunteerId },
            { $set: { status: 'Free', updatedAt: new Date() } }
          );
        }
        await logNotification(db, '⛔', `${d.foodName} (${d.id}) has expired and can no longer be distributed.`);
      } else if (newExpiry <= 2) {
        urgentCount++;
        await logNotification(db, '⚠', `${d.foodName} donation expires in ${newExpiry} hour(s) — URGENT.`);
      }

      await db.collection('donations').updateOne(
        { id: d.id },
        { $set: { expiryHours: newExpiry, status: newStatus, updatedAt: new Date() } }
      );
    }

    res.json({
      success: true,
      simulatedHours: 1,
      updatedCount: activeDonations.length,
      expiredCount,
      urgentCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to simulate time fast forward.' });
  }
});

export default router;
