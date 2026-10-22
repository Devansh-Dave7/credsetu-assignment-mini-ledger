# Android acceptance and submission recording

## Acceptance checklist

Run against local MiniLedger services only. Use two fabricated phone numbers and a fabricated receipt photo.

- [ ] Start from a logged-out app; reject an invalid phone number and request a valid OTP.
- [ ] Confirm wrong OTP errors, successful login, empty list and zero summary.
- [ ] Add Rahul, ₹1,000.10, due yesterday, with a receipt from the gallery.
- [ ] Add Priya, ₹500.20, due today. Confirm Rahul is overdue and Priya is unpaid.
- [ ] Confirm total lent ₹1,500.30, total repaid ₹0.00, overdue ₹1,000.10.
- [ ] Open Rahul's receipt; confirm image loading and the close action.
- [ ] Mark Rahul repaid. Confirm total lent stays ₹1,500.30, repaid becomes ₹1,000.10 and overdue becomes ₹0.00.
- [ ] Exercise camera permission denial and camera selection where the virtual camera is available.
- [ ] Test empty/invalid form fields, decimal precision and photo removal.
- [ ] Stop the API, attempt a save and confirm the form remains filled with a useful error. Restart the API and retry.
- [ ] Force-stop/reopen Expo Go; confirm the saved session and entries return.
- [ ] Restart the API and database container; confirm entries and receipts persist.
- [ ] Log out and log in with the second number; confirm its ledger and summary are separate.
- [ ] Check Android back navigation, keyboard overlap, pull-to-refresh and receipt retry.

## 2–3 minute walkthrough

1. **0:00–0:25:** MiniLedger's purpose, phone login, enter the mock OTP without displaying the server console.
2. **0:25–1:15:** Add an overdue loan with a receipt and a second loan due today. Show the list labels and summary.
3. **1:15–1:45:** Open the receipt, close it and mark the overdue loan repaid. Point out the changed totals.
4. **1:45–2:10:** Show one validation error and reopen the app to demonstrate persistence.
5. **2:10–2:40:** Briefly show repository structure and README; mention React Native, Fastify, PostgreSQL, private receipts and the automated tests.

Record the emulator rather than the full desktop. Keep credentials, API tokens, OTP logs and unrelated work off-screen. Android's `adb shell screenrecord /sdcard/miniledger-demo.mp4` can record up to three minutes; stop with Ctrl+C, then use `adb pull /sdcard/miniledger-demo.mp4 artifacts/miniledger-demo.mp4`. Narration can be recorded separately or with a desktop recorder.

Generate a fabricated receipt with `node scripts/create-demo-receipt.mjs` from the repository root. After the emulator boots, copy it into its gallery using `adb push artifacts/demo-receipt.jpg /sdcard/Pictures/demo-receipt.jpg`, then refresh media using `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/demo-receipt.jpg`.

Before submitting, create the intended GitHub repository, push only reviewed project files, and upload the recording to Loom or Google Drive with reviewer-accessible sharing. Verify both links while logged out. Do not claim a recording or repository is published until its link has been checked.
