import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initMongo, getConnectionStatus } from './db/mongo.js';

import authRouter from './routes/auth.js';
import donorsRouter from './routes/donors.js';
import ngosRouter from './routes/ngos.js';
import volunteersRouter from './routes/volunteers.js';
import donationsRouter from './routes/donations.js';
import notificationsRouter from './routes/notifications.js';
import reportsRouter from './routes/reports.js';
import healthRouter from './routes/health.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Global Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from workspace root
app.use(express.static(__dirname));

// Mount REST API Routes
app.use('/api/auth', authRouter);
app.use('/api/donors', donorsRouter);
app.use('/api/ngos', ngosRouter);
app.use('/api/volunteers', volunteersRouter);
app.use('/api/donations', donationsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/health', healthRouter);

// Fallback to index.html for SPA frontend routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[FoodConnect Server Error]', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Initialize database and start HTTP server
async function startServer() {
  try {
    await initMongo();
    const conn = getConnectionStatus();
    console.log(`[FoodConnect] Database status: ${conn.databaseType} (Connected: ${conn.connected})`);

    app.listen(PORT, HOST, () => {
      console.log(`=======================================================`);
      console.log(`🌿 FoodConnect Server listening at http://${HOST}:${PORT}`);
      console.log(`📦 Database: ${conn.databaseType}`);
      console.log(`✨ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('[FoodConnect] Fatal server startup error:', err);
    process.exit(1);
  }
}

startServer();
