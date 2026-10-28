# FoodConnect — Smart Food Donation Management System

FoodConnect is a full-stack platform that connects hotels, restaurants, hostels, and event organizers with nearby NGOs and volunteers to rescue surplus food before it spoils.

This repository features an Express.js backend with persistent **MongoDB Atlas** storage, JWT-based role authentication, bcrypt password hashing, and real-time food donation workflow tracking.

---

## 🌟 Key Features

1. **Persistent MongoDB Atlas Storage**:
   - Collections for `users`, `donors`, `ngos`, `volunteers`, `donations`, `notifications`, and `audit_logs`.
   - Automatic seeding of initial demonstration records with bcrypt-hashed passwords.
   - Built-in resilient store for offline/local development without interrupting application boot.
2. **Four Dedicated Role Portals**:
   - **Admin**: Full directory management, donation screening, NGO matching, volunteer dispatch, and reports.
   - **Donor**: Add, update, and manage surplus food items, track pickup and delivery statuses, and change account passwords.
   - **NGO**: Browse available food donations sorted by shortest expiry time and claim food for distribution.
   - **Volunteer**: View assigned delivery tasks with pickup/drop-off locations and mark deliveries completed.
3. **Smart Expiry Priority Engine**:
   - Visual priority badges (`Urgent`, `Donate Soon`, `Safe to Donate`, `Expired`).
   - Time simulation (+1 hour fast forward) to test real-time expiration handling.
4. **Interactive Diagnostics**:
   - Live database status indicator on topbar and landing page.
   - Safe `/api/health/test-db` endpoint to verify live database read/write operations.
   - CSV export for reporting and analysis.

---

## 🛠️ Technology Stack

- **Backend**: Node.js & Express.js (ES Modules)
- **Database**: MongoDB Atlas (`mongodb` official driver)
- **Authentication**: JWT (`jsonwebtoken`) & `bcryptjs` password hashing
- **Environment**: `dotenv`
- **Frontend**: HTML5, Vanilla JavaScript (Fetch API), CSS3

---

## 🚀 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` to configure your MongoDB Atlas cluster URI:

```env
PORT=3000
NODE_ENV=development

# MongoDB Atlas Connection URI
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=foodconnect

# JWT Secret
JWT_SECRET=your_jwt_secret_key_change_in_production
```

> **Note**: If `MONGODB_URI` is left blank, the application automatically boots in resilient in-memory mode so the prototype is immediately functional while you configure your Atlas cluster.

### 3. Run the Application

```bash
# Start the server (serves app on port 3000)
npm run dev

# Or start for production
npm start
```

Open `http://localhost:3000` in your browser.

---

## 🔑 Demo Accounts & Credentials

| Role | Email | Password | Access Details |
|---|---|---|---|
| **Admin** | `admin@foodconnect.org` | `admin123` | Complete administration & dispatch |
| **Donor** | `greenleaf@foodconnect.org` | `donor123` | Green Leaf Hotel portal |
| **Donor** | `spiceroute@foodconnect.org` | `donor123` | Spice Route Restaurant portal |
| **NGO** | `helpinghands@foodconnect.org` | `ngo123` | Helping Hands NGO portal |
| **NGO** | `annam@foodconnect.org` | `ngo123` | Annam Foundation portal |
| **Volunteer** | `arjun@foodconnect.org` | `vol123` | Arjun Kumar delivery portal |
| **Volunteer** | `divya@foodconnect.org` | `vol123` | Divya Shree delivery portal |

---

## 📡 REST API Reference

### Authentication (`/api/auth`)
- `POST /api/auth/login` — Sign in and receive JWT token
- `POST /api/auth/register` — Register a new user and role entity
- `GET /api/auth/me` — Retrieve active profile and linked entity details
- `POST /api/auth/change-password` — Change password with current password verification
- `GET /api/auth/demo-hints` — Retrieve public demonstration credentials

### Donors (`/api/donors`)
- `GET /api/donors` — List all donors (supports query `?q=search`)
- `GET /api/donors/:id` — Get single donor and their donation history
- `POST /api/donors` — Create a new donor and user account (*Admin*)
- `PUT /api/donors/:id` — Update donor profile (*Admin or Donor*)
- `PATCH /api/donors/:id/status` — Toggle Active/Inactive status (*Admin*)
- `DELETE /api/donors/:id` — Delete donor (*Admin*)

### NGOs (`/api/ngos`)
- `GET /api/ngos` — List all partner NGOs
- `GET /api/ngos/:id` — Get NGO details
- `POST /api/ngos` — Create new NGO and user account (*Admin*)
- `PUT /api/ngos/:id` — Update NGO profile
- `DELETE /api/ngos/:id` — Delete NGO (*Admin*)

### Volunteers (`/api/volunteers`)
- `GET /api/volunteers` — List all volunteers
- `GET /api/volunteers/:id` — Get volunteer details and delivery history
- `POST /api/volunteers` — Create new volunteer (*Admin*)
- `PUT /api/volunteers/:id` — Update volunteer profile
- `DELETE /api/volunteers/:id` — Delete volunteer (*Admin*)

### Food Donations (`/api/donations`)
- `GET /api/donations` — List donations (filters: `q`, `status`, `donorId`, `ngoId`, `volunteerId`)
- `GET /api/donations/priority` — Priority donations sorted by soonest expiry
- `GET /api/donations/:id` — Get single donation details with populated entities
- `POST /api/donations` — Create a new food donation listing (*Donor or Admin*)
- `PUT /api/donations/:id` — Edit an existing donation (*Donor if Available, or Admin*)
- `DELETE /api/donations/:id` — Delete donation
- `POST /api/donations/:id/claim` — NGO claims an available donation (*NGO*)
- `POST /api/donations/:id/match` — Match donation with an NGO (*Admin*)
- `POST /api/donations/:id/assign` — Assign a volunteer for pickup (*Admin*)
- `POST /api/donations/:id/advance` — Advance donation timeline step
- `POST /api/donations/:id/deliver` — Mark donation as delivered (*Volunteer or Admin*)
- `POST /api/donations/fast-forward` — Simulate 1 hour passing across active donations

### Notifications & Reports
- `GET /api/notifications` — Retrieve activity notifications
- `DELETE /api/notifications/:id` — Dismiss a notification
- `DELETE /api/notifications` — Clear all notifications
- `GET /api/reports/summary` — Aggregated KPI and priority breakdown
- `GET /api/reports/csv` — Download donation report in CSV format

### Health & Diagnostics (`/api/health`)
- `GET /api/health` — Check system status and collection counts
- `POST /api/health/test-db` — Execute test write and read on the database
- `POST /api/health/reset-demo` — Reset database to clean demo data
