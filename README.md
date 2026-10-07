# ATM — Any Time Medicine

A dark-themed telemedicine web app: patients request consultations, doctors accept and
run a live WebRTC video call and prescribe medicine from real ATM stock, a bill is
generated automatically with a scannable UPI QR code, and an admin manages the medicine
inventory (with pricing). Backend data is stored in **MongoDB**.

## 1. Get your MongoDB connection string (one-time setup)

This app needs a real MongoDB database to store patients, doctors, admins, medicines,
and consultations. The free tier of MongoDB Atlas is enough for this project and never
expires.

1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
2. When asked to create a cluster, choose the **free "M0" tier** (no credit card needed).
3. Under **Database Access**, create a database user with a username and password —
   write these down, you'll need them in step 6.
4. Under **Network Access**, click **Add IP Address** → **Allow Access from Anywhere**
   (`0.0.0.0/0`). This is required so Render (or your laptop) can reach the database.
5. Once the cluster finishes building, click **Connect** → **Drivers** → copy the
   connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<username>` and `<password>` with the database user you made in step 3, and
   add a database name before the `?`, e.g. `.../atm?retryWrites=true...` — this becomes
   your `MONGODB_URI`.

## 2. Run it locally

```bash
npm install
cp .env.example .env
```

Open `.env` and paste in your real `MONGODB_URI` from step 1. Then:

```bash
npm start
```

Open **http://localhost:3000** (use `localhost`, not an IP — camera access needs a
secure context, which `localhost` counts as). The first time it connects to an empty
database, it automatically seeds 5 demo medicines.

## 3. Deploy it on Render

1. Push this project to a GitHub repo (everything except `node_modules` — Render
   installs that itself).
2. On Render: **New → Web Service** → connect your repo.
3. Build Command: `npm install` — Start Command: `npm start`.
4. Under the service's **Environment** tab, add these environment variables (never
   commit real values for these to GitHub — that's the whole point of using env vars):
   - `MONGODB_URI` — your connection string from step 1
   - `UPI_ID` — your real UPI ID (e.g. `8520050991@ybl`), used for the payment QR
   - `UPI_PAYEE_NAME` — the name shown on the QR (e.g. `ATM`)
   - `ATM_LOAD_PASSWORD` — optional, defaults to `ATM@2026` if not set
5. Deploy. Unlike the old JSON-file version, data now persists properly across
   restarts and redeploys, since it lives in MongoDB, not on Render's disk.

## Flow

1. **Splash** — the ATM letters animate in and merge into a plus/hospital-cross logo,
   then the role-selection screen appears.
2. **Patient** — sign up with name, phone, Aadhar, password, **email (required)**, and a
   captured photo, verified by an OTP sent to that email. Later logins are just phone + password (with a
   "forgot password" OTP reset). Dashboard shows history (date, doctor, doctor's total
   case count, medicines dispensed, **total paid**) and a **New Consultation** button —
   symptoms/current medicines/allergies plus soft "fetch from machine" buttons for
   vitals (no manual vitals entry, by design).
3. **Doctor** — sign up with name, medical ID, phone, email, experience, an uploaded
   certificate image, a photo captured on the spot, and a password, verified by an OTP
   sent to their email (email is required). Later logins are phone + OTP (sent to the
   email on the account). Dashboard shows incoming requests (routed by a
   matching algorithm), a case history (now with each case's bill total), and an
   availability toggle.
4. **Admin** — sign up with name, phone, email, password, and a captured photo, verified
   by an OTP sent to that email. Dashboard shows the medicine inventory — **name, price, quantity, expiry** —
   with expiry/low-stock badges, and a password-gated **"Load ATM"** flow to add stock
   and set/update each medicine's price.
5. **Video consultation** — WebRTC video call between doctor and patient. The doctor
   can **search the ATM's live stock** while prescribing (autocomplete with price and
   quantity shown) or type a custom medicine; the list updates in real time on both
   screens as items are added.
6. **Billing + QR** — when the call ends (either side can hang up), the app computes
   the bill: a flat **₹10 consultation fee** + the price of every prescribed medicine
   (using the price that medicine had in stock at prescribe-time, so later price
   changes don't retroactively change old bills). The patient sees the full breakdown
   and a **UPI QR code** with the exact amount pre-filled — scanning it in GPay/PhonePe/
   Paytm shows the amount ready to pay, no manual entry. A **Dispense** button then
   decrements ATM stock for each prescribed medicine.
7. **Doctor matching** — when a patient sends a request, the server ranks currently-
   online doctors by keyword overlap between the new symptoms and (a) the doctor's
   specialty and (b) symptoms from that doctor's past cases, with a penalty for doctors
   who already have several active cases and a small bonus for experience. The top
   matches receive the request; whichever doctor accepts first gets the case.

## Things that are mocked/simplified for this demo

- **OTP / email / WhatsApp:** OTPs and receipts are emailed, doctor alerts go out on
  WhatsApp — see "Email and WhatsApp setup" below. Until those are configured, they're
  just logged to the server's console ("demo mode") — not shown anywhere in the app
  itself — so you can still read the code off the server logs while testing.
- **Phone numbers aren't verified:** since OTPs now go to email, the app proves the
  person owns the email, not the phone number. The phone is still the login ID and where
  doctors get WhatsApp alerts.
- **ATM restock password:** defaults to `ATM@2026`, overridable via the
  `ATM_LOAD_PASSWORD` environment variable.
- **Vitals machine:** no real hardware integration — the "Fetch" buttons generate a
  plausible simulated reading, standing in for whatever API/serial link a real device
  would expose.
- **WebRTC:** uses Google's public STUN server plus a free public TURN relay
  (openrelay.metered.ca) as a fallback for stricter networks. For heavier real-world
  use, a dedicated paid TURN service (Twilio, Xirsys, etc.) would be more reliable.
- **UPI QR:** generates a standard `upi://pay` link as a QR code — this is the same
  format real UPI apps use, but no payment gateway confirms the payment actually
  happened; it's a "scan and pay" QR, not a verified transaction webhook.

## Email and WhatsApp setup

What goes where:

| What | How it is sent |
|---|---|
| OTP codes (signup, doctor login, forgot password, profile edit) | **Email** |
| Prescription + receipt after the patient taps "Dispense" | **Email** (the patient's email) |
| "New patient waiting" alert to matched doctors | **WhatsApp** |

Nothing in the app depends on these being configured: if they are not, the messages
are logged to the server console ("demo mode") and everything else keeps working. Sending
failures never break a request either.

Older accounts that have no email saved fall back to a WhatsApp OTP / WhatsApp receipt
note instead (WhatsApp is only ever sent to the phone number of an existing account).

### Email (free, no domain needed)

Emails go out through a tiny Google Apps Script that sends from your own Gmail
(Render's free plan blocks normal SMTP, and most email APIs only send to other people
once you own a verified domain).

1. Sign in to the Gmail account you want emails to come from, then open <https://script.google.com> and click **New project**.
2. Delete the sample code and paste in the whole of `email-relay/Code.gs`.
3. Change `TOKEN` at the top to a long random secret of your own.
4. Click **Deploy > New deployment**, choose type **Web app**, set *Execute as* = **Me** and *Who has access* = **Anyone**, then Deploy. Approve the permission prompts (Google will warn the app is unverified — click Advanced > continue; it is your own script).
5. Copy the **Web app URL** (ends in `/exec`).
6. On Render, add environment variables: `EMAIL_RELAY_URL` = that URL, `EMAIL_RELAY_TOKEN` = the same secret as in step 3. Optionally `EMAIL_FROM_NAME`.

Free Gmail can send roughly 100 emails a day this way. Mail comes from a real Gmail
account, so it usually lands in the inbox, but tell testers to check Spam the first time.
Keep the URL and token out of GitHub — put them in Render's environment variables only.
If you change the script later, use **Deploy > Manage deployments > Edit > New version**
so the URL stays the same.

### WhatsApp (Twilio)

1. Create a free Twilio account at <https://www.twilio.com> (trial credit is included).
2. In the console, open **Messaging > Try it out > Send a WhatsApp message** (the sandbox). Note the sandbox number and your `join <two-words>` phrase.
3. Every doctor who should get alerts must WhatsApp that join phrase to the sandbox number once (the sandbox only messages people who joined).
4. On Render add: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (both on the console home page), and optionally `TWILIO_WHATSAPP_FROM` (defaults to the sandbox number) and `DEFAULT_COUNTRY_CODE` (defaults to 91).

The sandbox is for testing. To message people who have not joined, Twilio needs an
approved WhatsApp sender, which goes through Meta's business verification.

## Project structure

```
server.js                    Express + Socket.io entry point, connects to MongoDB
src/
  whatsapp.js                 Sends WhatsApp messages via Twilio (or logs them in demo mode)
  email.js                    Sends email through the Google Apps Script relay (or logs in demo mode)
  emailTemplates.js           OTP email + prescription/receipt email bodies
  http.js                     Tiny HTTP client shared by the two senders
  mongo.js                   MongoDB connection (reads MONGODB_URI)
  seed.js                    Seeds demo medicines into an empty database
  otp.js                     OTP generate/verify (in-memory), delivered by email
  matching.js                Doctor-ranking algorithm (async, MongoDB-backed)
  billing.js                 Consultation fee + medicine total + UPI QR generation
  utils.js                   Shared helpers (image saving, async route wrapper, etc.)
  socket.js                  Socket.io room join + WebRTC signaling relay
  models/
    Patient.js, Doctor.js, Admin.js, Medicine.js, Consultation.js   Mongoose schemas
  routes/
    auth.js                  Signup/login/OTP for all 3 roles
    patient.js                Patient profile, history, edit-with-OTP
    doctor.js                 Doctor profile, case history, edit-with-OTP, online toggle
    admin.js                  Admin profile, medicine inventory (with price), ATM unlock/load
    medicines.js               Shared medicine search (used by the doctor's prescribing UI)
    consultation.js             Request → match → accept → prescribe → bill → dispense
uploads/                      Captured photos & certificate images land here
public/
  index.html                  All view templates (single-page app, no build step)
  css/style.css                Dark theme
  js/
    api.js, camera.js, splash.js, auth.js,
    patient.js, doctor.js, admin.js, webrtc.js, main.js
email-relay/Code.gs           Google Apps Script that sends the emails from your Gmail
.env.example                  Template for your local .env file (never commit the real one)
```
