import express from 'express';
import { getDb } from '../db/mongo.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

function parseMealQuantity(qtyStr) {
  if (!qtyStr) return 0;
  const match = String(qtyStr).match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

// GET reports summary
router.get('/summary', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const donors = await (await db.collection('donors').find({})).toArray();
    const ngos = await (await db.collection('ngos').find({})).toArray();
    const volunteers = await (await db.collection('volunteers').find({})).toArray();
    const donations = await (await db.collection('donations').find({})).toArray();

    const donorsMap = {};
    donors.forEach(d => { donorsMap[d.id] = d; });

    let mealsDelivered = 0;
    const byStatus = {
      Available: 0,
      Matched: 0,
      'Volunteer Assigned': 0,
      Delivered: 0,
      Expired: 0
    };

    const byType = {};
    donors.forEach(don => {
      byType[don.type] = 0;
    });

    const byPriority = {
      'Expired': 0,
      'Urgent': 0,
      'Donate Soon': 0,
      'Safe to Donate': 0
    };

    let safetyCheckedCount = 0;
    let matchedCount = 0;
    let volunteerAssignedCount = 0;
    let deliveredCount = 0;

    donations.forEach(d => {
      if (byStatus[d.status] !== undefined) {
        byStatus[d.status]++;
      } else {
        byStatus[d.status] = 1;
      }

      if (d.status === 'Delivered') {
        mealsDelivered += parseMealQuantity(d.quantity);
        deliveredCount++;
      }

      const donor = donorsMap[d.donorId];
      if (donor && donor.type) {
        byType[donor.type] = (byType[donor.type] || 0) + 1;
      }

      const h = Number(d.expiryHours);
      if (h <= 0 || d.status === 'Expired') {
        byPriority['Expired']++;
      } else if (h <= 2) {
        byPriority['Urgent']++;
      } else if (h <= 6) {
        byPriority['Donate Soon']++;
      } else {
        byPriority['Safe to Donate']++;
      }

      if (d.timeline) {
        if (d.timeline[1]?.done) safetyCheckedCount++;
        if (d.timeline[2]?.done) matchedCount++;
        if (d.timeline[3]?.done) volunteerAssignedCount++;
      }
    });

    res.json({
      kpi: {
        donors: donors.length,
        ngos: ngos.length,
        volunteers: volunteers.length,
        donations: donations.length,
        available: byStatus['Available'] || 0,
        matched: (byStatus['Matched'] || 0) + (byStatus['Volunteer Assigned'] || 0) + (byStatus['Delivered'] || 0),
        inProgress: (byStatus['Matched'] || 0) + (byStatus['Volunteer Assigned'] || 0),
        delivered: byStatus['Delivered'] || 0,
        expired: byStatus['Expired'] || 0,
        mealsDelivered
      },
      pipeline: {
        donors: donors.length,
        donations: donations.length,
        safetyChecked: safetyCheckedCount,
        matched: matchedCount,
        volunteerAssigned: volunteerAssignedCount,
        delivered: deliveredCount
      },
      byType,
      byStatus,
      byPriority
    });
  } catch (err) {
    console.error('Reports summary error:', err);
    res.status(500).json({ error: 'Failed to generate reports summary.' });
  }
});

// GET CSV export data
router.get('/csv', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const donations = await (await db.collection('donations').find({})).toArray();
    const donors = await (await db.collection('donors').find({})).toArray();
    const ngos = await (await db.collection('ngos').find({})).toArray();
    const volunteers = await (await db.collection('volunteers').find({})).toArray();

    const donorsMap = Object.fromEntries(donors.map(d => [d.id, d.name]));
    const ngosMap = Object.fromEntries(ngos.map(n => [n.id, n.name]));
    const volsMap = Object.fromEntries(volunteers.map(v => [v.id, v.name]));

    const escapeCsv = (val) => '"' + String(val ?? '').replace(/"/g, '""') + '"';

    const headers = ['ID', 'Food', 'Quantity', 'Donor', 'Category', 'Pickup Location', 'Expiry (h)', 'Status', 'NGO', 'Volunteer'];
    const rows = [headers.map(escapeCsv).join(',')];

    donations.forEach(d => {
      rows.push([
        d.id,
        d.foodName,
        d.quantity,
        donorsMap[d.donorId] || d.donorId || '',
        d.category,
        d.pickupLocation,
        d.expiryHours,
        d.status,
        ngosMap[d.ngoId] || '',
        volsMap[d.volunteerId] || ''
      ].map(escapeCsv).join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="foodconnect-donations-report.csv"');
    res.send(rows.join('\n'));
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate CSV export.' });
  }
});

export default router;
