import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'foodconnect';

let client = null;
let db = null;
let isConnectedToAtlas = false;
let connectionError = null;

// Initial seed data with plain text passwords to be hashed on initial seed
const INITIAL_ADMINS = [
  { name: 'System Admin', email: 'admin@foodconnect.org', password: 'admin123', role: 'Admin' }
];

const INITIAL_DONORS = [
  { id: 'D-101', name: 'Green Leaf Hotel', phone: '9876500011', type: 'Hotel', status: 'Active', email: 'greenleaf@foodconnect.org', password: 'donor123' },
  { id: 'D-102', name: 'Spice Route Restaurant', phone: '9876500022', type: 'Restaurant', status: 'Active', email: 'spiceroute@foodconnect.org', password: 'donor123' },
  { id: 'D-103', name: 'MIT Boys Hostel', phone: '9876500033', type: 'Hostel', status: 'Active', email: 'mithostel@foodconnect.org', password: 'donor123' },
  { id: 'D-104', name: 'Chennai Tech Summit', phone: '9876500044', type: 'Event Organizer', status: 'Active', email: 'techsummit@foodconnect.org', password: 'donor123' },
];

const INITIAL_NGOS = [
  { id: 'N-201', name: 'Helping Hands NGO', location: 'Chennai', contact: '9840011122', status: 'Active', email: 'helpinghands@foodconnect.org', password: 'ngo123' },
  { id: 'N-202', name: 'Annam Foundation', location: 'Chennai', contact: '9840033344', status: 'Active', email: 'annam@foodconnect.org', password: 'ngo123' },
  { id: 'N-203', name: 'Seva Bharati Trust', location: 'Chrompet', contact: '9840055566', status: 'Active', email: 'sevabharati@foodconnect.org', password: 'ngo123' },
];

const INITIAL_VOLUNTEERS = [
  { id: 'V-301', name: 'Arjun Kumar', phone: '9900011122', availability: 'Available', status: 'Free', email: 'arjun@foodconnect.org', password: 'vol123' },
  { id: 'V-302', name: 'Divya Shree', phone: '9900033344', availability: 'Available', status: 'Free', email: 'divya@foodconnect.org', password: 'vol123' },
  { id: 'V-303', name: 'Ramesh Babu', phone: '9900055566', availability: 'Weekends only', status: 'Free', email: 'ramesh@foodconnect.org', password: 'vol123' },
];

const INITIAL_DONATIONS = [
  {
    id: 'DN-501', donorId: 'D-101', foodName: 'Veg Rice Meals', quantity: '50 packets',
    expiryHours: 1.5, category: 'Cooked Meal', pickupLocation: 'Anna Nagar, Chennai',
    status: 'Available', ngoId: null, volunteerId: null,
    timeline: [
      { step: 'Donation Created', done: true, at: new Date() },
      { step: 'Safety Checked', done: false },
      { step: 'Matched with NGO', done: false },
      { step: 'Volunteer Assigned', done: false },
      { step: 'Delivered', done: false }
    ],
    createdAt: new Date(), updatedAt: new Date()
  },
  {
    id: 'DN-502', donorId: 'D-102', foodName: 'Bread Loaves', quantity: '120 pcs',
    expiryHours: 5, category: 'Bakery', pickupLocation: 'T. Nagar, Chennai',
    status: 'Available', ngoId: null, volunteerId: null,
    timeline: [
      { step: 'Donation Created', done: true, at: new Date() },
      { step: 'Safety Checked', done: false },
      { step: 'Matched with NGO', done: false },
      { step: 'Volunteer Assigned', done: false },
      { step: 'Delivered', done: false }
    ],
    createdAt: new Date(), updatedAt: new Date()
  },
  {
    id: 'DN-503', donorId: 'D-103', foodName: 'Chapati & Curry', quantity: '80 packets',
    expiryHours: 8, category: 'Cooked Meal', pickupLocation: 'MIT Campus, Chromepet',
    status: 'Available', ngoId: null, volunteerId: null,
    timeline: [
      { step: 'Donation Created', done: true, at: new Date() },
      { step: 'Safety Checked', done: false },
      { step: 'Matched with NGO', done: false },
      { step: 'Volunteer Assigned', done: false },
      { step: 'Delivered', done: false }
    ],
    createdAt: new Date(), updatedAt: new Date()
  },
  {
    id: 'DN-504', donorId: 'D-104', foodName: 'Fruit Boxes', quantity: '40 boxes',
    expiryHours: 0, category: 'Fruits', pickupLocation: 'Guindy, Chennai',
    status: 'Expired', ngoId: null, volunteerId: null,
    timeline: [
      { step: 'Donation Created', done: true, at: new Date() },
      { step: 'Safety Checked', done: false },
      { step: 'Matched with NGO', done: false },
      { step: 'Volunteer Assigned', done: false },
      { step: 'Delivered', done: false }
    ],
    createdAt: new Date(), updatedAt: new Date()
  },
  {
    id: 'DN-505', donorId: 'D-101', foodName: 'Sambar Rice', quantity: '65 packets',
    expiryHours: 2, category: 'Cooked Meal', pickupLocation: 'Velachery, Chennai',
    status: 'Available', ngoId: null, volunteerId: null,
    timeline: [
      { step: 'Donation Created', done: true, at: new Date() },
      { step: 'Safety Checked', done: false },
      { step: 'Matched with NGO', done: false },
      { step: 'Volunteer Assigned', done: false },
      { step: 'Delivered', done: false }
    ],
    createdAt: new Date(), updatedAt: new Date()
  },
  {
    id: 'DN-506', donorId: 'D-102', foodName: 'Biryani Packets', quantity: '90 packets',
    expiryHours: 4, category: 'Cooked Meal', pickupLocation: 'Mylapore, Chennai',
    status: 'Delivered', ngoId: 'N-201', volunteerId: 'V-301',
    timeline: [
      { step: 'Donation Created', done: true, at: new Date() },
      { step: 'Safety Checked', done: true, at: new Date() },
      { step: 'Matched with NGO', done: true, at: new Date() },
      { step: 'Volunteer Assigned', done: true, at: new Date() },
      { step: 'Delivered', done: true, at: new Date() }
    ],
    createdAt: new Date(), updatedAt: new Date()
  }
];

const INITIAL_NOTIFICATIONS = [
  { icon: '✓', text: 'Welcome to FoodConnect — persistent MongoDB database integrated.', time: new Date() },
  { icon: '🍱', text: 'Sample food donations loaded into system.', time: new Date() }
];

// In-Memory MongoDB Collection Mock for resilient local execution
class InMemoryCollection {
  constructor(name) {
    this.name = name;
    this.docs = [];
  }

  async find(filter = {}) {
    let results = this.docs.filter(doc => this._matches(doc, filter));
    return {
      sort: (sortObj = {}) => {
        const [field, dir] = Object.entries(sortObj)[0] || [];
        if (field) {
          results.sort((a, b) => {
            const va = a[field], vb = b[field];
            if (va === vb) return 0;
            return (va > vb ? 1 : -1) * (dir === -1 ? -1 : 1);
          });
        }
        return {
          toArray: async () => [...results],
          limit: (n) => ({ toArray: async () => results.slice(0, n) })
        };
      },
      toArray: async () => [...results],
      limit: (n) => ({ toArray: async () => results.slice(0, n) })
    };
  }

  async findOne(filter = {}) {
    return this.docs.find(doc => this._matches(doc, filter)) || null;
  }

  async insertOne(doc) {
    const newDoc = { _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), ...doc };
    this.docs.push(newDoc);
    return { acknowledged: true, insertedId: newDoc._id };
  }

  async insertMany(docs) {
    const insertedIds = {};
    docs.forEach((doc, idx) => {
      const newDoc = { _id: 'mem_' + Date.now() + '_' + idx, ...doc };
      this.docs.push(newDoc);
      insertedIds[idx] = newDoc._id;
    });
    return { acknowledged: true, insertedCount: docs.length, insertedIds };
  }

  async updateOne(filter, update) {
    const idx = this.docs.findIndex(doc => this._matches(doc, filter));
    if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
    if (update.$set) {
      this.docs[idx] = { ...this.docs[idx], ...update.$set };
    } else {
      this.docs[idx] = { ...this.docs[idx], ...update };
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(filter, update) {
    let modified = 0;
    this.docs.forEach((doc, idx) => {
      if (this._matches(doc, filter)) {
        if (update.$set) {
          this.docs[idx] = { ...this.docs[idx], ...update.$set };
        }
        modified++;
      }
    });
    return { matchedCount: modified, modifiedCount: modified };
  }

  async deleteOne(filter) {
    const idx = this.docs.findIndex(doc => this._matches(doc, filter));
    if (idx === -1) return { deletedCount: 0 };
    this.docs.splice(idx, 1);
    return { deletedCount: 1 };
  }

  async deleteMany(filter) {
    const countBefore = this.docs.length;
    this.docs = this.docs.filter(doc => !this._matches(doc, filter));
    return { deletedCount: countBefore - this.docs.length };
  }

  async countDocuments(filter = {}) {
    return this.docs.filter(doc => this._matches(doc, filter)).length;
  }

  async createIndex() {
    return true;
  }

  _matches(doc, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;
    for (const key of Object.keys(filter)) {
      const val = filter[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if (val.$ne !== undefined && doc[key] === val.$ne) return false;
        if (val.$in !== undefined && !val.$in.includes(doc[key])) return false;
        if (val.$nin !== undefined && val.$nin.includes(doc[key])) return false;
        if (val.$gte !== undefined && !(doc[key] >= val.$gte)) return false;
        if (val.$lte !== undefined && !(doc[key] <= val.$lte)) return false;
        if (val.$gt !== undefined && !(doc[key] > val.$gt)) return false;
        if (val.$lt !== undefined && !(doc[key] < val.$lt)) return false;
        if (val.$regex !== undefined) {
          const re = new RegExp(val.$regex, val.$options || '');
          if (!re.test(String(doc[key] || ''))) return false;
        }
      } else {
        if (doc[key] !== val) return false;
      }
    }
    return true;
  }
}

class InMemoryDb {
  constructor() {
    this.collections = {
      users: new InMemoryCollection('users'),
      donors: new InMemoryCollection('donors'),
      ngos: new InMemoryCollection('ngos'),
      volunteers: new InMemoryCollection('volunteers'),
      donations: new InMemoryCollection('donations'),
      notifications: new InMemoryCollection('notifications'),
      audit_logs: new InMemoryCollection('audit_logs')
    };
  }

  collection(name) {
    if (!this.collections[name]) {
      this.collections[name] = new InMemoryCollection(name);
    }
    return this.collections[name];
  }
}

const memoryDb = new InMemoryDb();

/**
 * Hash a password securely with bcrypt
 */
export async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

/**
 * Compare password with hash
 */
export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Seed initial data if collection is empty
 */
export async function seedDatabase(targetDb) {
  const usersColl = targetDb.collection('users');
  const donorsColl = targetDb.collection('donors');
  const ngosColl = targetDb.collection('ngos');
  const volsColl = targetDb.collection('volunteers');
  const donationsColl = targetDb.collection('donations');
  const notifsColl = targetDb.collection('notifications');

  const count = await usersColl.countDocuments();
  if (count > 0) {
    return; // Already seeded
  }

  console.log('[FoodConnect] Seeding initial database data...');

  // Seed Users & Donors
  for (const admin of INITIAL_ADMINS) {
    const passwordHash = await hashPassword(admin.password);
    await usersColl.insertOne({
      email: admin.email.toLowerCase(),
      passwordHash,
      role: 'Admin',
      name: admin.name,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  for (const d of INITIAL_DONORS) {
    const passwordHash = await hashPassword(d.password);
    await donorsColl.insertOne({
      id: d.id,
      name: d.name,
      phone: d.phone,
      type: d.type,
      status: d.status,
      email: d.email.toLowerCase(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await usersColl.insertOne({
      email: d.email.toLowerCase(),
      passwordHash,
      role: 'Donor',
      name: d.name,
      entityId: d.id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // Seed NGOs
  for (const n of INITIAL_NGOS) {
    const passwordHash = await hashPassword(n.password);
    await ngosColl.insertOne({
      id: n.id,
      name: n.name,
      location: n.location,
      contact: n.contact,
      status: n.status,
      email: n.email.toLowerCase(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await usersColl.insertOne({
      email: n.email.toLowerCase(),
      passwordHash,
      role: 'NGO',
      name: n.name,
      entityId: n.id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // Seed Volunteers
  for (const v of INITIAL_VOLUNTEERS) {
    const passwordHash = await hashPassword(v.password);
    await volsColl.insertOne({
      id: v.id,
      name: v.name,
      phone: v.phone,
      availability: v.availability,
      status: v.status,
      email: v.email.toLowerCase(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await usersColl.insertOne({
      email: v.email.toLowerCase(),
      passwordHash,
      role: 'Volunteer',
      name: v.name,
      entityId: v.id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // Seed Donations
  for (const item of INITIAL_DONATIONS) {
    await donationsColl.insertOne({ ...item });
  }

  // Seed Notifications
  for (const n of INITIAL_NOTIFICATIONS) {
    await notifsColl.insertOne({ ...n, createdAt: new Date() });
  }

  console.log('[FoodConnect] Database seeding completed successfully.');
}

/**
 * Initialize MongoDB connection or fallback
 */
export async function initMongo() {
  if (MONGODB_URI) {
    try {
      console.log(`[FoodConnect] Connecting to MongoDB Atlas at ${MONGODB_URI.split('@')[1] || 'provided URI'}...`);
      client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000
      });
      await client.connect();
      db = client.db(DB_NAME);
      isConnectedToAtlas = true;
      connectionError = null;
      console.log(`[FoodConnect] Successfully connected to MongoDB Atlas database "${DB_NAME}".`);

      // Ensure indexes
      await db.collection('users').createIndex({ email: 1 }, { unique: true }).catch(() => {});
      await db.collection('donors').createIndex({ id: 1 }, { unique: true }).catch(() => {});
      await db.collection('ngos').createIndex({ id: 1 }, { unique: true }).catch(() => {});
      await db.collection('volunteers').createIndex({ id: 1 }, { unique: true }).catch(() => {});
      await db.collection('donations').createIndex({ id: 1 }, { unique: true }).catch(() => {});

      await seedDatabase(db);
      return db;
    } catch (err) {
      connectionError = err.message;
      console.warn(`[FoodConnect] MongoDB Atlas connection failed (${err.message}). Using resilient in-memory database store.`);
      isConnectedToAtlas = false;
      db = memoryDb;
      await seedDatabase(memoryDb);
      return memoryDb;
    }
  } else {
    console.log('[FoodConnect] No MONGODB_URI found in environment. Initializing in-memory database store.');
    isConnectedToAtlas = false;
    db = memoryDb;
    await seedDatabase(memoryDb);
    return memoryDb;
  }
}

/**
 * Reset database to default demo dataset
 */
export async function resetDatabase() {
  const currentDb = getDb();
  for (const name of ['users', 'donors', 'ngos', 'volunteers', 'donations', 'notifications', 'audit_logs']) {
    await currentDb.collection(name).deleteMany({});
  }
  await seedDatabase(currentDb);
  return { success: true, message: 'Database reset to demo state.' };
}

/**
 * Returns current database instance
 */
export function getDb() {
  return db || memoryDb;
}

export function isMongoConnected() {
  return isConnectedToAtlas;
}

export function getConnectionStatus() {
  return {
    connected: isConnectedToAtlas,
    databaseType: isConnectedToAtlas ? 'MongoDB Atlas' : 'In-Memory Resilient Store',
    databaseName: DB_NAME,
    hasUriConfigured: Boolean(MONGODB_URI),
    error: connectionError
  };
}
