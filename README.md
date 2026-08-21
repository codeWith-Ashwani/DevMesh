# DevMesh Backend API

DevMesh is a developer networking and project collaboration platform.

## Architecture Overview
- **Runtime**: Node.js 22+ (Native test runner, fetch, crypto)
- **Framework**: Express 5
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT stored in secure, HttpOnly, SameSite cookies
- **Security**: Strict CORS whitelisting, HTTP security headers (`nosniff`, `DENY`, `HSTS`), sliding-window rate limiting, and centralized JSON error handling.

---

## Local Setup

### 1. Environment Configuration
Copy the sample environment file to `.env`:
```bash
cp .env.example .env
```

Fill in the required environment variables:
```ini
NODE_ENV=development
PORT=7777
JWT_SECRET=your_local_development_jwt_secret_key_here
DB_CONNECTION_STRING=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/devMesh
CLIENT_URL=http://localhost:5173
```

> **IMPORTANT**: Never commit `.env` or real credentials to git.

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Run Production Server
```bash
npm start
```

---

## Testing & Quality Assurance

### Run Unit & Integration Tests (with Coverage)
```bash
npm test
```

### Run Dedicated AppSec & Security Regression Suite
```bash
npm run test:security
```

---

## Docker Containerization

### Build Docker Image
```bash
docker build -t devmesh-backend .
```

### Run Docker Container
```bash
docker run -d \
  --name devmesh-backend \
  -p 7777:7777 \
  -e NODE_ENV=production \
  -e JWT_SECRET="your_production_jwt_secret" \
  -e DB_CONNECTION_STRING="your_mongodb_atlas_connection_string" \
  -e CLIENT_URL="https://your-frontend-domain.com" \
  devmesh-backend
```

---

## Production Deployment & Secrets

- **Cloud Secrets**: `JWT_SECRET`, `DB_CONNECTION_STRING`, and `CLIENT_URL` must be injected via the cloud provider's environment/secrets manager (e.g. Render, Railway, GCP Cloud Run, AWS Secrets Manager) and never committed to version control.
- **Health Probes**:
  - Liveness: `GET /health` (Returns HTTP 200 `{ "status": "ok" }`)
  - Readiness: `GET /ready` (Returns HTTP 200 when MongoDB is connected, HTTP 503 when disconnected)
