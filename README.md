# Course Application & Payment Portal

A production-grade, secure course application portal where users submit personal details, upload sensitive identity documents, and make payments via Paystack. The system enforces strict state management: applications are only marked as submitted/confirmed after the Paystack webhook successfully verifies the payment.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Architecture & Data Flow](#architecture--data-flow)
- [Database Schema](#database-schema)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [API Routes](#api-routes)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Project Overview

This portal handles the complete application lifecycle for a polytechnic/institution:

1. **Program Selection** — National Diploma, HND, HND-to-BSc Conversion, PGD, or Masters
2. **Personal Information** — Full name, date of birth, gender, phone, email, address
3. **Document Upload** — Course-specific required and optional documents (O'level, NIN, passport, certificates, etc.)
4. **Payment** — Secure checkout via Paystack
5. **Confirmation** — Atomic webhook processing updates database and sends confirmation email

### Key Design Decisions

- **Server-side price calculation**: Prices are never sent from the frontend. The backend looks up the course catalog and calculates the amount in kobo.
- **Atomic, idempotent webhooks**: The webhook handler uses optimistic locking to prevent race conditions and duplicate processing.
- **Private object storage**: All documents are stored in a private Supabase Storage bucket with signed URLs.
- **Fire-and-forget emails**: Email sending does not block the webhook response to Paystack.

---

## Tech Stack

| Layer | Technology | Tier |
|-------|-----------|------|
| **Frontend & API** | Next.js 14+ (App Router, TypeScript) | Vercel Hobby (Free) |
| **Styling** | CSS Modules + `globals.css` | — |
| **Database** | Supabase PostgreSQL | Free Tier |
| **Object Storage** | Supabase Storage | Free Tier (1GB) |
| **Payments** | Paystack (Test → Live) | Zero monthly fee |
| **Email** | Resend | Free Tier (100/day) |
| **Hosting** | Vercel | Hobby Tier (Free) |

---

## Architecture & Data Flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser   │────▶│  Next.js Frontend  │────▶│  /api/upload-url │
└─────────────┘     └──────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │ Supabase Storage │
                                               │ (Signed URL)     │
                                               └─────────────────┘
                                                        │
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser   │────▶│  Next.js Frontend  │────▶│ /api/applications│
└─────────────┘     └──────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  Supabase DB     │
                                               │  (PENDING_PAYMENT)│
                                               └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │   Paystack API   │
                                               │ (Initialize txn) │
                                               └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │ Paystack Checkout│
                                               │ (User pays here) │
                                               └─────────────────┘
                                                        │
                              ┌─────────────────────────┘
                              │ Redirect + Webhook
                              ▼
               ┌──────────────────────────────┐
               │  POST /api/webhooks/paystack │
               │  • Verify HMAC signature     │
               │  • Idempotency check          │
               │  • Atomic DB update (PAID)    │
               │  • Insert payment_logs        │
               │  • Fire-and-forget email      │
               └──────────────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │  GET /api/verify-payment     │
               │  (Success page polls here)   │
               └──────────────────────────────┘
```

### Document Requirements by Program

| Program | Required Documents | Optional Documents |
|---------|-------------------|-------------------|
| **ND** | O'level Result, NIN Slip, Passport Picture | JAMB Result |
| **HND** | O'level Result, NIN Slip, Passport Picture, ND Statement, I.T. Certificate | ND Certificate |
| **HND-to-BSc** | O'level Result, NIN Slip, Passport Picture, HND/Degree Statement | HND/Degree Certificate, NYSC Certificate |
| **PGD** | O'level Result, NIN Slip, Passport Picture, HND/Degree Statement, NYSC Certificate | HND/Degree Certificate |
| **Masters** | O'level Result, NIN Slip, Passport Picture, Bachelors/PGD Certificate, NYSC Certificate | — |

---

## Database Schema

### `applications`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `full_name` | TEXT | NOT NULL |
| `first_name` | TEXT | NOT NULL |
| `middle_name` | TEXT | nullable |
| `surname` | TEXT | NOT NULL |
| `date_of_birth` | DATE | — |
| `gender` | TEXT | NOT NULL |
| `phone_number` | TEXT | NOT NULL |
| `email` | TEXT | NOT NULL |
| `house_address` | TEXT | NOT NULL |
| `city` | TEXT | NOT NULL |
| `state` | TEXT | NOT NULL |
| `course_id` | TEXT | NOT NULL |
| `expected_amount` | INTEGER | NOT NULL (kobo) |
| `status` | TEXT | DEFAULT 'PENDING_PAYMENT', CHECK IN ('PENDING_PAYMENT', 'PAID', 'FAILED', 'EXPIRED') |
| `olevel_result` | TEXT | Storage path |
| `jamb_result` | TEXT | Storage path |
| `nin_slip` | TEXT | Storage path |
| `passport_picture` | TEXT | Storage path |
| `nd_statement` | TEXT | Storage path |
| `nd_certificate` | TEXT | Storage path |
| `it_certificate` | TEXT | Storage path |
| `hnd_degree_statement` | TEXT | Storage path |
| `hnd_degree_certificate` | TEXT | Storage path |
| `nysc_certificate` | TEXT | Storage path |
| `bachelors_pgd_certificate` | TEXT | Storage path |
| `paystack_reference` | TEXT | UNIQUE |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() |

### `payment_logs`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PRIMARY KEY |
| `application_id` | UUID | REFERENCES applications(id) ON DELETE CASCADE |
| `paystack_reference` | TEXT | NOT NULL |
| `amount_paid` | INTEGER | NOT NULL |
| `payment_status` | TEXT | NOT NULL |
| `paystack_metadata` | JSONB | Full Paystack event payload |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

### Indexes

```sql
CREATE INDEX idx_applications_status_created ON applications(status, created_at);
CREATE INDEX idx_applications_paystack_ref ON applications(paystack_reference);
```

---

## Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier)
- Paystack account (test mode)
- Resend account (free tier)
- Vercel account (for deployment)

---

## Local Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd course-portal
npm install
```

### 2. Create Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **API keys** (anon + service_role)
3. Create a **private** bucket named `applications` in Storage

### 3. Run database migrations

In Supabase SQL Editor, execute:

```sql
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    surname TEXT NOT NULL,
    date_of_birth DATE,
    gender TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    email TEXT NOT NULL,
    house_address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    course_id TEXT NOT NULL,
    expected_amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'FAILED', 'EXPIRED')),
    olevel_result TEXT,
    jamb_result TEXT,
    nin_slip TEXT,
    passport_picture TEXT,
    nd_statement TEXT,
    nd_certificate TEXT,
    it_certificate TEXT,
    hnd_degree_statement TEXT,
    hnd_degree_certificate TEXT,
    nysc_certificate TEXT,
    bachelors_pgd_certificate TEXT,
    paystack_reference TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    paystack_reference TEXT NOT NULL,
    amount_paid INTEGER NOT NULL,
    payment_status TEXT NOT NULL,
    paystack_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_applications_status_created ON applications(status, created_at);
CREATE INDEX idx_applications_paystack_ref ON applications(paystack_reference);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;
```

### 4. Configure environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PAYSTACK_SECRET_KEY=sk_test_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=onboarding@resend.dev
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → API | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → API | Client-side Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → API | Server-side key (bypasses RLS) |
| `PAYSTACK_SECRET_KEY` | Paystack Dashboard → Settings → API Keys | Payment initialization & webhook verification |
| `RESEND_API_KEY` | Resend Dashboard → API Keys | Transactional emails |
| `RESEND_FROM_EMAIL` | Resend | Sender address (use `onboarding@resend.dev` for testing) |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL | Paystack callback URL base |

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/upload-url` | POST | Validates file metadata, returns Supabase signed upload URL |
| `/api/applications` | POST | Creates application record, calculates price server-side, initializes Paystack transaction |
| `/api/webhooks/paystack` | POST | Receives Paystack `charge.success`, verifies signature, atomically updates DB, sends email |
| `/api/verify-payment` | GET | Polls database for payment status by reference |

---

## Testing

### Local Testing with ngrok (Recommended)

Since Paystack cannot reach `localhost`, use ngrok:

```bash
# Install
brew install ngrok

# Run (in a separate terminal)
ngrok http 3000

# Update .env.local
NEXT_PUBLIC_APP_URL=https://your-ngrok-url.ngrok-free.app

# Update Paystack webhook URL in dashboard
# https://your-ngrok-url.ngrok-free.app/api/webhooks/paystack
```

### Paystack Test Card

| Field | Value |
|-------|-------|
| Card Number | `4084084084084081` |
| Expiry | Any future date (e.g., `12/30`) |
| CVV | `000` |
| PIN | `12345` (if prompted) |

### Manual Webhook Trigger (No ngrok)

After Paystack redirects to `/success`, manually trigger the webhook:

```bash
curl -X POST http://localhost:3000/api/webhooks/paystack   -H "Content-Type: application/json"   -H "x-paystack-signature: test"   -d '{
    "event": "charge.success",
    "data": {
      "reference": "APP-your-reference-here",
      "amount": 50000,
      "status": "success"
    }
  }'
```

**Note**: Signature verification must be temporarily disabled for this to work.

---

## Deployment

### Vercel

1. Push code to GitHub
2. Import project in [vercel.com](https://vercel.com)
3. Add all environment variables in Vercel Dashboard → Settings → Environment Variables
4. Deploy
5. Update Paystack webhook URL to `https://your-app.vercel.app/api/webhooks/paystack`
6. **Re-enable signature verification** in `app/api/webhooks/paystack/route.ts`

### Before Going Live

| Checklist | Status |
|-----------|--------|
| Switch Paystack to Live mode | ☐ |
| Switch Paystack keys to `sk_live_` | ☐ |
| Verify domain with Resend | ☐ |
| Update `RESEND_FROM_EMAIL` to your domain | ☐ |
| Re-enable webhook HMAC signature check | ☐ |
| Update `NEXT_PUBLIC_APP_URL` to production URL | ☐ |
| Test full flow with real card (small amount) | ☐ |

---

## Security

| Layer | Measure |
-------|---------|
| **Upload** | MIME type whitelist (`application/pdf`, `image/jpeg`, `image/png`), 2MB size limit, signed URLs with short expiry |
| **Price** | Server-side calculation only. Frontend never sends amounts. |
| **Payment** | HMAC signature verification on all webhooks. Amount mismatch detection. |
| **Database** | RLS enabled. Service role key used server-side only. Optimistic locking on status updates. |
| **Idempotency** | `payment_logs` checked before processing. Duplicate webhooks return 200 without re-processing. |
| **Files** | Private bucket. No public access. Random UUID in path. |
| **Emails** | Fire-and-forget. Webhook response to Paystack is never blocked by email failures. |

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| `Failed to generate upload URL` | Supabase timeout | Check `.env.local` values. Restart server. |
| `Invalid signature` on webhook | HMAC mismatch | Ensure `PAYSTACK_SECRET_KEY` is correct. Re-enable signature check only in production. |
| Stuck on "Verifying Payment" | Webhook never reached localhost | Use ngrok or manually trigger webhook with curl. |
| Email not received | Resend test domain limit | `onboarding@resend.dev` only sends to your signup email. Verify your own domain for production. |
| `Module not found: @/lib/supabase` | Path alias misconfigured | Check `tsconfig.json` `paths` setting. Use relative imports (`../../../lib/supabase`) as fallback. |
| `invalid input syntax for type uuid` | Manually inserting row with empty ID | Leave `id` field blank or use SQL INSERT without specifying `id`. |

---

## License

MIT
