# AI-Assisted Secure Telemedicine and Doctor Recommendation System

This repo is scaffolded to match the **Requirements Baseline v1.1** document
(Sections 1–19), following the Implementation Roadmap in Section 19. It is a
monorepo with three independently-runnable services:

```
telemed-project/
├── frontend/    React + Vite + Tailwind (patient/doctor/admin UI)
├── backend/     Node + Express + Prisma (REST API, auth, payments)
├── ai-service/  Python + FastAPI (symptom prediction — currently a stub)
└── .github/workflows/ci.yml
```

## Why three services?

The Node backend never runs ML code itself — it calls the Python AI service
over HTTP (`POST /predict`). This means:
- The whole app (auth, booking, payments, video) can be built and demoed
  **before** your trained model is ready.
- When your model is ready, you only touch `ai-service/main.py` — see the
  `TODO: load model` comment in that file. Nothing in `frontend/` or
  `backend/` needs to change.

## Prerequisites

- Node.js 20+
- Python 3.11+
- A free Postgres database (e.g. [Neon](https://neon.tech) or [Supabase](https://supabase.com))
- A Firebase project (for Authentication) — https://console.firebase.google.com
- A Stripe account (test mode is fine) — https://dashboard.stripe.com

## 1. Backend setup

```bash
cd backend
cp .env.example .env        # fill in DATABASE_URL, Firebase, Stripe values
npm install
npx prisma migrate dev --name init   # creates tables from prisma/schema.prisma
npm run dev                  # http://localhost:4000
```

Check it's alive: `curl http://localhost:4000/api/health`

## 2. AI service setup

```bash
cd ai-service
python3 -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Check it's alive: `curl http://localhost:8000/health`
Try a prediction: `curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" -d '{"symptoms":["headache","nausea"]}'`

## 3. Frontend setup

```bash
cd frontend
cp .env.example .env.local   # fill in Firebase web config + API base URL
npm install
npm run dev                  # http://localhost:5173
```

## Local Stripe webhook testing

Use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward events to
your local backend:

```bash
stripe listen --forward-to localhost:4000/api/payments/webhook
```

Copy the CLI's printed webhook signing secret into `backend/.env` as
`STRIPE_WEBHOOK_SECRET`.

## Where to go next

Follow the **Implementation Roadmap (Section 19)** in the requirements
baseline document:
1. ✅ Project setup & scaffolding — this repo
2. ✅ Database schema (`backend/prisma/schema.prisma`) — run the migration
3. 🔲 Auth & RBAC — wire up real registration/login flows in `frontend/src/pages/Login.jsx`
4. 🔲 Doctor & Admin core modules
5. 🔲 Appointment & payment flow (stubs exist — build the UI around them)
6. 🔲 AI symptom assessment (stub exists — build the UI around it)
7. 🔲 Real-time consultation (WebRTC + signaling — not yet started)
8. 🔲 Prescriptions & history
9. 🔲 Swap in your trained model (`ai-service/main.py`)
10. 🔲 Security hardening & testing
11. 🔲 Deployment
12. 🔲 Documentation & report

## Notes on what's a stub vs. real here

- **Real / functional:** DB schema, auth middleware (token verification +
  role check), booking + Stripe checkout/webhook logic, AI proxy contract,
  rate limiting, CORS/security headers.
- **Stub / placeholder:** the AI service's actual prediction logic, all
  frontend pages (functional but minimally styled, missing loading/error
  polish), no WebRTC/chat code yet, no tests yet.
