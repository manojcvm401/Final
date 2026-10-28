import express from 'express';
import { getDb, getConnectionStatus, resetDatabase } from '../db/mongo.js';

const router = express.Router();

// GET health status
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const conn = getConnectionStatus();

    const counts = {
      users: await db.collection('users').countDocuments(),
      donors: await db.collection('donors').countDocuments(),
      ngos: await db.collection('ngos').countDocuments(),
      volunteers: await db.collection('volunteers').countDocuments(),
      donations: await db.collection('donations').countDocuments(),
      notifications: await db.collection('notifications').countDocuments()
    };

    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: conn,
      counts
    });
  } catch (err) {
    res.status(500).json({
      status: 'degraded',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST test database read/write
router.post('/test-db', async (req, res) => {
  try {
    const db = getDb();
    const testDoc = {
      action: 'HEALTH_TEST',
      timestamp: new Date(),
      testId: 'test_' + Date.now()
    };

    // Test write
    const writeResult = await db.collection('audit_logs').insertOne(testDoc);

    // Test read
    const readDoc = await db.collection('audit_logs').findOne({ testId: testDoc.testId });

    // Test clean up
    await db.collection('audit_logs').deleteOne({ testId: testDoc.testId });

    res.json({
      success: true,
      databaseType: getConnectionStatus().databaseType,
      connectedToAtlas: getConnectionStatus().connected,
      writeAcknowledged: Boolean(writeResult.acknowledged || writeResult.insertedId),
      readVerified: Boolean(readDoc && readDoc.testId === testDoc.testId),
      message: 'Database read and write test passed successfully!'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      message: 'Database test failed.'
    });
  }
});

// POST reset demo data
router.post('/reset-demo', async (req, res) => {
  try {
    const result = await resetDatabase();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset demo data.' });
  }
});

export default router;
