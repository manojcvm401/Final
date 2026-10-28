import express from 'express';
import { getDb, hashPassword } from '../db/mongo.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all NGOs
router.get('/', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const { q } = req.query;
    let filter = {};
    if (q) {
      const regex = { $regex: q, $options: 'i' };
      filter = { $or: [{ name: regex }, { id: regex }, { location: regex }, { contact: regex }] };
    }
    const ngos = await (await db.collection('ngos').find(filter)).toArray();
    res.json(ngos);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch NGOs.' });
  }
});

// Get single NGO
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const ngo = await db.collection('ngos').findOne({ id: req.params.id });
    if (!ngo) return res.status(404).json({ error: 'NGO not found.' });
    res.json(ngo);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch NGO.' });
  }
});

// Create NGO (Admin only)
router.post('/', authenticate, requireRole('Admin'), async (req, res) => {
  try {
    const { id, name, location, contact, email, password } = req.body;
    if (!name || !location) {
      return res.status(400).json({ error: 'NGO name and location are required.' });
    }

    const db = getDb();
    const ngoId = id || ('N-' + (200 + (await db.collection('ngos').countDocuments()) + 1));

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
          role: 'NGO',
          name,
          entityId: ngoId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    const newNgo = {
      id: ngoId,
      name,
      location,
      contact: contact || '',
      status: 'Active',
      email: email ? email.trim().toLowerCase() : '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('ngos').insertOne(newNgo);
    res.status(201).json(newNgo);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create NGO.' });
  }
});

// Update NGO
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, location, contact, email, password } = req.body;
    const db = getDb();
    const ngo = await db.collection('ngos').findOne({ id: req.params.id });
    if (!ngo) return res.status(404).json({ error: 'NGO not found.' });

    if (req.user.role !== 'Admin' && req.user.entityId !== req.params.id) {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const updates = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (location) updates.location = location;
    if (contact) updates.contact = contact;

    if (email && email.trim().toLowerCase() !== ngo.email) {
      const normalizedEmail = email.trim().toLowerCase();
      const clash = await db.collection('users').findOne({ email: normalizedEmail });
      if (clash && clash.entityId !== ngo.id) {
        return res.status(400).json({ error: 'Email already in use.' });
      }
      updates.email = normalizedEmail;
      await db.collection('users').updateOne(
        { entityId: ngo.id },
        { $set: { email: normalizedEmail, name: name || ngo.name, updatedAt: new Date() } }
      );
    }

    if (password && password.trim()) {
      const passwordHash = await hashPassword(password);
      await db.collection('users').updateOne(
        { entityId: ngo.id },
        { $set: { passwordHash, updatedAt: new Date() } }
      );
    }

    await db.collection('ngos').updateOne({ id: req.params.id }, { $set: updates });
    const updated = await db.collection('ngos').findOne({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update NGO.' });
  }
});

// Delete NGO (Admin only)
router.delete('/:id', authenticate, requireRole('Admin'), async (req, res) => {
  try {
    const db = getDb();
    const ngo = await db.collection('ngos').findOne({ id: req.params.id });
    if (!ngo) return res.status(404).json({ error: 'NGO not found.' });

    await db.collection('ngos').deleteOne({ id: req.params.id });
    await db.collection('users').deleteOne({ entityId: req.params.id });
    res.json({ success: true, message: 'NGO deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete NGO.' });
  }
});

export default router;
