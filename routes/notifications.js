import express from 'express';
import { getDb } from '../db/mongo.js';
import { optionalAuth, authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET all notifications
router.get('/', optionalAuth, async (req, res) => {
  try {
    const db = getDb();
    const notifs = await (await db.collection('notifications').find({})).toArray();
    notifs.sort((a, b) => new Date(b.time || b.createdAt) - new Date(a.time || a.createdAt));
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// POST notification
router.post('/', authenticate, async (req, res) => {
  try {
    const { icon, text } = req.body;
    if (!text) return res.status(400).json({ error: 'Notification text is required.' });

    const db = getDb();
    const newNotif = {
      icon: icon || '📢',
      text,
      time: new Date(),
      createdAt: new Date()
    };
    await db.collection('notifications').insertOne(newNotif);
    res.status(201).json(newNotif);
  } catch (err) {
    res.status(500).json({ error: 'Failed to post notification.' });
  }
});

// DELETE single notification
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const id = req.params.id;
    // support ObjectId or string id or matching text
    await db.collection('notifications').deleteOne({
      $or: [{ _id: id }, { id: id }]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete notification.' });
  }
});

// Clear all notifications
router.delete('/', authenticate, async (req, res) => {
  try {
    const db = getDb();
    await db.collection('notifications').deleteMany({});
    res.json({ success: true, message: 'All notifications cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear notifications.' });
  }
});

export default router;
