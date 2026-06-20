# Cyborg Backend

Node.js / Express REST API for the Cyborg health platform: JWT auth with OTP,
blood-report uploads with AI-powered action plans, Razorpay subscriptions, and
role-based access (user / doctor).

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Open `.env` and fill in real values. At minimum you need:
   - `MONGO_URI` — a MongoDB connection string (local `mongodb://localhost:27017/cyborg` or an Atlas URI).
   - `JWT_SECRET` — any long random string.
   - `PORT` — defaults to `5001` (must match the frontend's `NEXT_PUBLIC_API_URL`).

   The rest (email OTP, Razorpay, AI providers, Cloudflare R2) enable optional
   features — see the inline comments in `.env.example` for what each one does.

3. **Run the dev server**

   ```bash
   npm run dev      # nodemon, auto-reload
   # or
   npm start        # plain node
   ```

   The API listens on `http://localhost:5001` by default.

## Requirements

- Node.js 18+
- MongoDB (local instance or Atlas)

## Notes

- `uploads/` (blood-report files) is created at runtime and is gitignored.
- Never commit your real `.env` — only `.env.example` is tracked.
- See `CLAUDE.md` for the full architecture and route map.
