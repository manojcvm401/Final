import express from 'express';
import { getDb, comparePassword, hashPassword } from '../db/mongo.js';
import { generateToken, authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public: Get demo account hints
router.get('/demo-hints', async (req, res) => {
  res.json({
    Admin: 'Admin: <b>admin@foodconnect.org</b> / <b>admin123</b>',
    Donor: 'Sample donor: <b>greenleaf@foodconnect.org</b> / <b>donor123</b> (or spiceroute@foodconnect.org, mithostel@foodconnect.org)',
    NGO: 'Sample NGO: <b>helpinghands@foodconnect.org</b> / <b>ngo123</b> (or annam@foodconnect.org, sevabharati@foodconnect.org)',
    Volunteer: 'Sample volunteer: <b>arjun@foodconnect.org</b> / <b>vol123</b> (or divya@foodconnect.org, ramesh@foodconnect.org)'
  });
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = getDb();
    const normalizedEmail = email.trim().toLowerCase();
    const query = { email: normalizedEmail };
    if (role && role !== 'All') {
      query.role = role;
    }

    const user = await db.collection('users').findOne(query);
    if (!user) {
      return res.status(401).json({ error: `No user account found for "${email}"${role ? ` with role ${role}` : ''}.` });
    }

    // Check if donor/user is deactivated
    if (user.role === 'Donor' && user.entityId) {
      const donor = await db.collection('donors').findOne({ id: user.entityId });
      if (donor && donor.status === 'Inactive') {
        return res.status(403).json({ error: 'This donor account has been deactivated by the admin. Contact FoodConnect support.' });
      }
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password. Please try again.' });
    }

    const token = generateToken(user);

    // Audit log
    await db.collection('audit_logs').insertOne({
      action: 'LOGIN',
      userId: user._id,
      email: user.email,
      role: user.role,
      timestamp: new Date()
    }).catch(() => {});

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        entityId: user.entityId || null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, role, name, phone, type, location, contact, availability } = req.body;
    if (!email || !password || !role || !name) {
      return res.status(400).json({ error: 'Email, password, role, and name are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = getDb();

    const existing = await db.collection('users').findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = await hashPassword(password);
    let entityId = null;

    if (role === 'Donor') {
      const donorCount = await db.collection('donors').countDocuments();
      entityId = 'D-' + (100 + donorCount + 1);
      await db.collection('donors').insertOne({
        id: entityId,
        name,
        phone: phone || '',
        type: type || 'Restaurant',
        status: 'Active',
        email: normalizedEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else if (role === 'NGO') {
      const ngoCount = await db.collection('ngos').countDocuments();
      entityId = 'N-' + (200 + ngoCount + 1);
      await db.collection('ngos').insertOne({
        id: entityId,
        name,
        location: location || 'Chennai',
        contact: contact || phone || '',
        status: 'Active',
        email: normalizedEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else if (role === 'Volunteer') {
      const volCount = await db.collection('volunteers').countDocuments();
      entityId = 'V-' + (300 + volCount + 1);
      await db.collection('volunteers').insertOne({
        id: entityId,
        name,
        phone: phone || '',
        availability: availability || 'Available',
        status: 'Free',
        email: normalizedEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const newUser = {
      email: normalizedEmail,
      passwordHash,
      role,
      name,
      entityId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('users').insertOne(newUser);
    newUser._id = result.insertedId;

    const token = generateToken(newUser);

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        role: newUser.role,
        name: newUser.name,
        entityId: newUser.entityId
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// Current User Profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const user = await db.collection('users').findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    let entity = null;
    if (user.role === 'Donor' && user.entityId) {
      entity = await db.collection('donors').findOne({ id: user.entityId });
    } else if (user.role === 'NGO' && user.entityId) {
      entity = await db.collection('ngos').findOne({ id: user.entityId });
    } else if (user.role === 'Volunteer' && user.entityId) {
      entity = await db.collection('volunteers').findOne({ id: user.entityId });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        entityId: user.entityId
      },
      entity
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});

// Change Password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    }

    const db = getDb();
    const user = await db.collection('users').findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const isMatch = await comparePassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await hashPassword(newPassword);
    await db.collection('users').updateOne(
      { email: req.user.email },
      { $set: { passwordHash: newHash, updatedAt: new Date() } }
    );

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

export default router;
