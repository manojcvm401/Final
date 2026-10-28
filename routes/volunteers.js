import express from 'express';
import { getDb, hashPassword } from '../db/mongo.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all volunteers
router.get('/', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const { q } = req.query;
    let filter = {};
    if (q) {
      const regex = { $regex: q, $options: 'i' };
      filter = { $or: [{ name: regex }, { id: regex }, { phone: regex }, { availability: regex }] };
    }
    const volunteers = await (await db.collection('volunteers').find(filter)).toArray();
    res.json(volunteers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch volunteers.' });
  }
});

// Get single volunteer
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const volunteer = await db.collection('volunteers').findOne({ id: req.params.id });
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });

    const deliveries = await (await db.collection('donations').find({ volunteerId: req.params.id })).toArray();
    res.json({ volunteer, deliveries });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch volunteer.' });
  }
});

// Create volunteer (Admin only)
router.post('/', authenticate, requireRole('Admin'), async (req, res) => {
  try {
    const { id, name, phone, availability, email, password } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Volunteer name and phone number are required.' });
    }

    const db = getDb();
    const volId = id || ('V-' + (300 + (await db.collection('volunteers').countDocuments()) + 1));

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const existingUser = await db.collection('users').findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(400).json({ error: 'That login email is already in use.' });
      }

      if (password) {
        const passwordHash = await hashPassword(password);
        await db.collection('users').insertOne({
          email: normalizedEmail,
          passwordHash,
          role: 'Volunteer',
          name,
          entityId: volId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    const newVol = {
      id: volId,
      name,
      phone,
      availability: availability || 'Available',
      status: 'Free',
      email: email ? email.trim().toLowerCase() : '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('volunteers').insertOne(newVol);
    res.status(201).json(newVol);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create volunteer.' });
  }
});

// Update volunteer
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, phone, availability, email, password } = req.body;
    const db = getDb();
    const volunteer = await db.collection('volunteers').findOne({ id: req.params.id });
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });

    if (req.user.role !== 'Admin' && req.user.entityId !== req.params.id) {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const updates = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (availability) updates.availability = availability;

    if (email && email.trim().toLowerCase() !== volunteer.email) {
      const normalizedEmail = email.trim().toLowerCase();
      const clash = await db.collection('users').findOne({ email: normalizedEmail });
      if (clash && clash.entityId !== volunteer.id) {
        return res.status(400).json({ error: 'Email already in use.' });
      }
      updates.email = normalizedEmail;
      await db.collection('users').updateOne(
        { entityId: volunteer.id },
        { $set: { email: normalizedEmail, name: name || volunteer.name, updatedAt: new Date() } }
      );
    }

    if (password && password.trim()) {
      const passwordHash = await hashPassword(password);
      await db.collection('users').updateOne(
        { entityId: volunteer.id },
        { $set: { passwordHash, updatedAt: new Date() } }
      );
    }

    await db.collection('volunteers').updateOne({ id: req.params.id }, { $set: updates });
    const updated = await db.collection('volunteers').findOne({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update volunteer.' });
  }
});

// Delete volunteer (Admin only)
router.delete('/:id', authenticate, requireRole('Admin'), async (req, res) => {
  try {
    const db = getDb();
    const volunteer = await db.collection('volunteers').findOne({ id: req.params.id });
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });

    await db.collection('volunteers').deleteOne({ id: req.params.id });
    await db.collection('users').deleteOne({ entityId: req.params.id });
    res.json({ success: true, message: 'Volunteer removed.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete volunteer.' });
  }
});

export default router;
