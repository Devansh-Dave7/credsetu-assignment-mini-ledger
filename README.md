# MiniLedger

A React Native Android app for tracking money lent to friends. Built for the Credsetu full stack internship assignment. Includes mock phone OTP login, loan entries, full repayment, overdue highlighting, summary totals, optional receipt photos, validation and automated tests.

## Stack and layout

- `apps/mobile`: Expo + React Native + TypeScript, with Expo Router for navigation. Native controls, gallery/camera picker and SecureStore for the session.
- `apps/api`: Fastify + TypeScript + Zod + Prisma 7 with the PostgreSQL driver adapter. Routes use one Prisma client; no extra service framework.
- PostgreSQL 17 runs in a dedicated Docker Compose service. Receipt images live in a private local directory.
- Vitest tests the API against real PostgreSQL; Jest/Expo and React Native Testing Library test mobile behavior.

## Requirements

- Node.js 24.14 or newer within major version 24, npm, Git.
- PowerShell 7 for the setup helper (uses .NET cryptographic random-number generation).
- Docker Desktop using Linux containers, running and accessible to your terminal.
- Android Studio with SDK Platform Tools, Android Emulator and an Android 36 Google APIs x86_64 virtual device. Enable hardware virtualization and the emulator hypervisor support required by Windows. See [Expo's Android emulator guide](https://docs.expo.dev/workflow/android-studio-emulator/).
- Internet for initial dependency downloads and Expo Go installation. App data and mock authentication run locally.

## Run on Windows

Open PowerShell in this repository root:

```powershell
npm.cmd ci
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
docker compose up -d --wait
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:test:migrate
```

The helper generates ignored local credentials without printing them. It preserves existing environment files. Manual configuration is also possible using the `.env.example` files at the root and in each app; the database passwords must match.

Start the backend in one terminal:

```powershell
npm.cmd run dev:api
```

Boot an Android virtual device using Android Studio's Device Manager. In a second terminal at the repository root:

```powershell
npm.cmd run android
```

On the development machine, the SDK may be under the ignored `.local/android/sdk` directory. Dot-source `. .\scripts\android-env.ps1` in the terminal before starting Expo to select that SDK and its virtual-device directory. This helper changes only the current terminal's environment. On another machine it uses an existing `ANDROID_HOME` or Android Studio's usual SDK location.

Expo installs or opens the matching Expo Go app on the emulator. If needed, press `a` in the Expo terminal. Metro uses port **8082** to avoid an existing local service on 8081. The mobile API URL defaults to `http://10.0.2.2:3000`, Android Emulator's route to the host. The backend binds to `127.0.0.1:3000`; PostgreSQL binds to `127.0.0.1:55434`.

Enter an Indian mobile number such as `9876543210`, request an OTP and read the six-digit code from the API terminal's **MOCK OTP** message. Enter it in the app. There is no real SMS provider. Do not publish OTPs, session tokens or local environment files in screenshots or recordings.

To stop MiniLedger PostgreSQL while preserving its data:

```powershell
docker compose stop
```

## Verify

After starting PostgreSQL and applying both migrations:

```powershell
npm.cmd run check
```

This runs lint, type checks, API integration tests, mobile behavior tests and the backend build. CI runs the same checks with its own PostgreSQL service. Tests refuse database URLs unless the host is local and the database name ends in `_test`. They delete fixtures only in that test database and use a temporary receipt directory; they do not clear the app database.

Individual commands:

```powershell
npm.cmd test -w @miniledger/api
npm.cmd test -w @miniledger/mobile
npm.cmd run build
```

Android acceptance and the recording walkthrough are in [docs/DEMO.md](docs/DEMO.md). Automated checks do not prove Android permissions, camera/gallery behavior, keyboard layout or emulator connectivity.

## API

All endpoints except OTP requests/verification and health require `Authorization: Bearer <token>`.

| Method and route | Input / result |
| --- | --- |
| `GET /health` | Database readiness |
| `POST /auth/request-otp` | JSON `{ "phone": "9876543210" }`; expiry and resend timing, never the OTP |
| `POST /auth/verify-otp` | JSON `{ "phone": "9876543210", "otp": "123456" }`; token and user |
| `GET /auth/me` | Current user |
| `GET /loans` | `{ loans, today }`, newest first; status is `UNPAID`, `OVERDUE` or `REPAID` |
| `POST /loans` | Multipart fields `friendName`, `amount` and `dueDate`; optional file `receipt`; returns `{ loan }` with HTTP 201 |
| `PATCH /loans/:id/repay` | Marks the entire entry repaid; returns `{ loan }`; safe to repeat |
| `GET /summary` | `totalLent`, `totalRepaid`, `overdueAmount`, `currency`, `today` |
| `GET /loans/:id/receipt` | Owner-only JPEG bytes with private/no-store caching |

An entry amount is a decimal string such as `"1250.50"`; due date is `"2026-10-24"`. Responses keep money as strings. Errors have `{ code, message, fieldErrors? }`; validation uses HTTP 400, expired authentication 401, inaccessible entries 404, oversized requests 413 and rate limits 429.

## Rules and design decisions

- **Money:** INR, positive, up to 10 whole-number digits and two decimal places. PostgreSQL `DECIMAL(12,2)` and decimal calculations avoid errors such as `0.1 + 0.2`. Mobile converts to numbers only for display, not totals.
- **Dates:** A loan due today is not overdue. It becomes overdue the next day in `Asia/Kolkata`, and only while unpaid. Past dates are valid. The server decides status and totals; the app refreshes on foreground, pull-to-refresh, mutations and India midnight.
- **Summary:** Total lent is all original loan amounts, including those later repaid. Total repaid is fully repaid entries. Overdue excludes repayments. The three totals use one database snapshot.
- **OTP:** Random six-digit code, five-minute expiry, five failed attempts, 60-second resend cooldown. Only an HMAC hash is stored. Per-phone transaction locks serialize concurrent login actions. Local mock delivery intentionally prints the code in the API console. Production startup is disabled.
- **Session:** Signed JWT expires after 24 hours; SecureStore persists it on Android. Logout removes the local copy. This local demo has no refresh-token or server-side session-revocation service.
- **Ownership:** Every loan query and receipt read is scoped to the authenticated user. Knowing another entry's ID gives no access.
- **Receipts:** One JPEG/PNG up to 5 MB per entry. The server checks content, decodes it, applies rotation and writes a normalized JPEG, stripping metadata. Images are limited to 25 megapixels and resized to at most 2000 × 2000. A failed database write removes its file. Files are never served as a public static folder.
- **Failures:** Mutations show errors and retain form values rather than claiming success. An interrupted request can have an uncertain result; check the ledger before manually retrying an entry creation. There is no offline write queue.
- **Storage:** Keep PostgreSQL's Docker volume and `apps/api/uploads` together when backing up. Receipt cleanup handles request failures; abrupt machine/process termination between filesystem and database writes can leave an unreferenced file. This local assignment does not include a background reconciliation service.

## Troubleshooting

- **Docker permission denied:** confirm Docker Desktop is running, using Linux containers, and your terminal account can access its engine. Only operate on this project's Compose service.
- **Emulator cannot connect:** confirm the API is running on port 3000 and the configured URL is `10.0.2.2`, not the emulator's own `localhost`. Restart Metro after changing `apps/mobile/.env`.
- **Android SDK not found:** set `ANDROID_HOME` to the SDK path shown in Android Studio and add its `platform-tools` and `emulator` folders to the current terminal's `PATH`.
- **No test database:** the initialization SQL runs only for a fresh Docker volume. With an existing MiniLedger volume, create the missing database using `docker compose exec -T db createdb -U miniledger miniledger_test`, then run the test migration. Do not delete a data volume to fix this.
- **Password mismatch after editing `.env`:** PostgreSQL initialization does not change existing volume passwords. Restore the matching local configuration rather than recreating the data volume.
- **Expo version mismatch:** use the locked SDK-compatible packages and matching Expo Go. Run `npx.cmd expo install --check` from `apps/mobile` to inspect compatibility.
- **Receipt missing after moving the project:** restore both the database and upload directory. A missing file produces a clear 404.
- **Camera unavailable:** configure the emulator's virtual camera or use a fabricated receipt from its gallery.

## Boundaries

The dependency audit currently reports transitive advisories in the Expo/Metro/Jest toolchain (including `braces`, `node-forge` and `sprintf-js`). Compatible dependency updates were applied. At implementation time, npm's remaining proposed fixes downgrade Expo/Jest across major versions; these were not forced. Recheck `npm.cmd audit` when upstream patches are available. The receipt decoder uses the patched Sharp 0.35.5 release or newer within that minor version.

This is a local assignment app: no real SMS, interest, partial repayment, editing/deleting entries, reminders, public cloud deployment or Play Store release. The loan list is intentionally unpaginated for this small demo. The backend and uploads require persistent local storage.

Use fabricated data for the demo. Review the code and be ready to explain the route → validation → database → response flow, authentication, decimal/date rules, upload cleanup and tests.
