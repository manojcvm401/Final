import express from 'express';
import { getDb, hashPassword } from '../db/mongo.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all donors
router.get('/', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const { q } = req.query;
    let filter = {};
    if (q) {
      const regex = { $regex: q, $options: 'i' };
      filter = { $or: [{ name: regex }, { id: regex }, { type: regex }, { phone: regex }] };
    }
    const donors = await (await db.collection('donors').find(filter)).toArray();
    res.json(donors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch donors.' });
  }
});

// Get single donor
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const donor = await db.collection('donors').findOne({ id: req.params.id });
    if (!donor) return res.status(404).json({ error: 'Donor not found.' });

    const donations = await (await db.collection('donations').find({ donorId: req.params.id })).toArray();
    res.json({ donor, donations });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch donor.' });
  }
});

// Create donor (Admin only)
router.post('/', authenticate, requireRole('Admin'), async (req, res) => {
  try {
    const { id, name, phone, type, email, password } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Donor name and phone number are required.' });
    }

    const db = getDb();
    const donorId = id || ('D-' + (100 + (await db.collection('donors').countDocuments()) + 1));

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const existingUser = await db.collection('users').findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(400).json({ error: 'That login email is already used by another account.' });
      }

      if (password) {
        const passwordHash = await hashPassword(password);
        await db.collection('users').insertOne({
          email: normalizedEmail,
          passwordHash,
          role: 'Donor',
          name,
          entityId: donorId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    const newDonor = {
      id: donorId,
      name,
      phone,
      type: type || 'Hotel',
      status: 'Active',
      email: email ? email.trim().toLowerCase() : '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('donors').insertOne(newDonor);
    res.status(201).json(newDonor);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create donor.' });
  }
});

// Update donor (Admin or matching donor)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, phone, type, email, password } = req.body;
    const db = getDb();
    const donor = await db.collection('donors').findOne({ id: req.params.id });
    if (!donor) return res.status(404).json({ error: 'Donor not found.' });

    // Authorization check
    if (req.user.role !== 'Admin' && req.user.entityId !== req.params.id) {
      return res.status(403).json({ error: 'You do not have permission to update this donor profile.' });
    }

    const updates = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (type) updates.type = type;

    if (email && email.trim().toLowerCase() !== donor.email) {
      const normalizedEmail = email.trim().toLowerCase();
      const clash = await db.collection('users').findOne({ email: normalizedEmail });
      if (clash && clash.entityId !== donor.id) {
        return res.status(400).json({ error: 'Email already in use.' });
      }
      updates.email = normalizedEmail;
      await db.collection('users').updateOne(
        { entityId: donor.id },
        { $set: { email: normalizedEmail, name: name || donor.name, updatedAt: new Date() } }
      );
    }

    if (password && password.trim()) {
      const passwordHash = await hashPassword(password);
      await db.collection('users').updateOne(
        { entityId: donor.id },
        { $set: { passwordHash, updatedAt: new Date() } }
      );
    }

    await db.collection('donors').updateOne({ id: req.params.id }, { $set: updates });
    const updated = await db.collection('donors').findOne({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update donor.' });
  }
});

// Toggle Donor Status (Admin only)
router.patch('/:id/status', authenticate, requireRole('Admin'), async (req, res) => {
  try {
    const db = getDb();
    const donor = await db.collection('donors').findOne({ id: req.params.id });
    if (!donor) return res.status(404).json({ error: 'Donor not found.' });

    const newStatus = donor.status === 'Active' ? 'Inactive' : 'Active';
    await db.collection('donors').updateOne(
      { id: req.params.id },
      { $set: { status: newStatus, updatedAt: new Date() } }
    );
    res.json({ id: donor.id, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle donor status.' });
  }
});

// Delete Donor (Admin only)
router.delete('/:id', authenticate, requireRole('Admin'), async (req, res) => {
  try {
    const db = getDb();
    const donor = await db.collection('donors').findOne({ id: req.params.id });
    if (!donor) return res.status(404).json({ error: 'Donor not found.' });

    await db.collection('donors').deleteOne({ id: req.params.id });
    await db.collection('users').deleteOne({ entityId: req.params.id });
    res.json({ success: true, message: 'Donor removed.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete donor.' });
  }
});

export default router;
