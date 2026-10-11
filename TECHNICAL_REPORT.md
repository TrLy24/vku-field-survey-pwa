# MINI-PROJECT SHORT TECHNICAL REPORT
**Course:** Cross-Platform Mobile App Development (VKU)  
**Mini-Project Title:** [Mini-Project 2: VKU Field Survey PWA & Capacitor Android Bridge]  
**Team / Student Name:** [PHAM THI TRUC LY]  
**Submission Date:** [14/09/2026]  

---

## 1. GENERAL INFORMATION & DELIVERABLE LINKS
* **Team Members:**
  1. [PHAM THI TRUC LY] — Student ID: [23IT.B130] — Role: [Team Lead / Frontend Architecture] — Contribution: [100%]
* **🔗 Live Demo URL:** [https://trly24.github.io/vku-field-survey-pwa/](https://trly24.github.io/vku-field-survey-pwa/)
* **💻 GitHub Repository:** [https://github.com/TrLy24/vku-field-survey-pwa.git](https://github.com/TrLy24/vku-field-survey-pwa.git)
* **📱 Android APK Package:** `android/app/build/outputs/apk/debug/app-debug.apk` (Compiled with Capacitor v8.5.2 & Gradle)

---

## 2. FEATURE IMPLEMENTATION CHECKLIST
| # | Required Feature | Status | Implementation Details & Acceptance Level |
|:---:|---|:---:|---|
| **1** | [Feature 1: Responsive Mobile Viewport] | ✅ Complete | Responsive interface designed for mobile and desktop browsers; tailored to VKU institutional design guidelines; touch-friendly targets (≥ 48px), suitable for field survey on smartphones. |
| **2** | [Feature 2: Local Offline Persistence] | ✅ Complete | Survey sessions are stored locally using IndexedDB (`vku_survey_db`), allowing full inspection data entry, photo caching, and digital signatures when the device is completely offline. |
| **3** | [Feature 3: Automatic Background Sync] | ✅ Complete | Pending survey sessions are automatically synchronized with the Google Apps Script backend when network connectivity is restored (`window.online` listener with 30s timeout and idempotent session deduplication). |
| **4** | [Feature 4: GPS Location Capture] | ✅ Complete | Captures real-time latitude and longitude from mobile satellite GPS, calculates distance to VKU campus center via Haversine formula, and generates an interactive Google Maps location link. |
| **5** | [Feature 5: Photo Capture / Upload & Watermark] | ✅ Complete | Supports field photo capture from camera or file picker; automatically compresses images using Canvas API (< 1.2MB) and imprints a legal inspection watermark (Room Code, Timestamp, GPS Coords). |
| **6** | [Feature 6: Google Sheets Data Storage] | ✅ Complete | Survey results are transmitted through Google Apps Script and stored into 19 standardized columns in Google Sheets (`CSDL`), while field photos are saved to Google Drive (`VKU_Survey_Photos`). |
| **7** | [Feature 7: PWA Installation] | ✅ Complete | Includes Web App Manifest and Service Worker (`sw.js`) so the website can be installed as a standalone Progressive Web App on mobile browsers (Chrome, Safari, Android). |
| **8** | [Bonus: Inspector Offline Authentication] | ✅ Complete | Multi-mode login system with VKU staff email, 4-digit quick PIN, offline session credential caching, and one-click demo profiles for inspection officers. |
| **9** | [Bonus: Digital Signature & Print Slip] | ✅ Complete | Canvas-based touch signature pad for electronic sign-off and formatted A4 print stylesheet (`@media print`) for official physical or PDF inspection report generation. |
| **10** | [Bonus: Capacitor Android APK Bridge] | ✅ Complete | Packaged into a standalone Android APK using Capacitor Bridge v8.5.2 (`com.vku.fieldsurvey`), integrating native camera and filesystem plugins. |

---

## 3. TECHNICAL ARCHITECTURE & PROJECT STRUCTURE
*VKU Field Survey PWA is implemented as an offline-first Progressive Web Application using Vanilla JavaScript, HTML5 and CSS3, bridged to Native Android via Capacitor. The application is designed for campus field surveys where network connectivity may be unstable or unavailable.*

### System Architecture
The system consists of three main layers:

1. **Frontend PWA & Native Client**  
   The frontend provides the responsive inspection interface, handles user interactions, form validation, GPS acquisition, photo compression with watermark overlay, digital canvas signatures, local storage management, and background synchronization queues.

2. **Local Offline Storage (IndexedDB)**  
   Survey sessions are stored in the browser/client using IndexedDB (`vku_survey_db`, store: `sessions`). When the device is offline, submitted inspection data remains completely secure in the local database instead of being lost. Each session contains a unique UUID session ID (`S-FAC-XXXX`) and synchronization status (`pending`, `syncing`, `synced`, `error`).

3. **Cloud Backend (Google Apps Script & Sheets)**  
   When network connectivity is available, the PWA sends survey data to Google Apps Script through an HTTPS POST request. Google Apps Script validates the received payload, saves field photo Base64 data into Google Drive, and appends the survey record into Google Sheets with duplicate-prevention checks.

```text
+-----------------------------------------------------------------------------------+
|               VKU FIELD SURVEY PWA & CAPACITOR ANDROID CLIENT                     |
|                                                                                   |
|  [Inspector Auth]  [Facility Form]  [Watermark Camera]  [Digital Signature Pad]   |
|         │                 │                  │                     │              |
|         └─────────────────┴────────┬─────────┴─────────────────────┘              |
|                                    ▼ (Local Transaction)                          |
|                   [IndexedDB Client Store: "vku_survey_db"]                       |
|                   Status: pending | syncing | synced | error                      |
+------------------------------------+----------------------------------------------+
                                     │
               Auto-Sync / Retry Queue (Online Event Listener)
                                     ▼
+------------------------------------+----------------------------------------------+
|                          CLOUD BACKEND INFRASTRUCTURE                             |
|                                                                                   |
|  [Google Apps Script Gateway] ───► [Google Sheets: CSDL (19 Standard Columns)]    |
|                               └──► [Google Drive: Photos in VKU_Survey_Photos]    |
|                                                                                   |
|  [GitHub Pages / Vercel Host]: Serves PWA, Service Worker Cache Shell & Headers   |
+-----------------------------------------------------------------------------------+
```

### Directory Structure
```text
vku-field-survey-pwa/
├── android/                         # Capacitor Native Android project (Gradle & Java 21)
│   ├── app/build/outputs/apk/debug/ # Pre-compiled Android APK (app-debug.apk, 8.27 MB)
│   └── ...
├── google-apps-script/
│   └── Code.gs                     # Google Apps Script Web App backend logic
├── icons/                           # High-res PWA icons (192x192, 512x512)
├── public/                          # Static deployment headers and assets
│   ├── _headers                    # Cloudflare Pages cache & security headers
│   └── report.html                 # Printable A4 Technical Report document
├── app.js                           # Core Logic: IndexedDB, Form, Watermark, Signature, Sync
├── config.js                        # Configuration point: Google Apps Script Web App endpoint
├── index.html                       # Responsive UI: Login modal, Facility form, Print slip
├── manifest.json                    # PWA Web App Manifest
├── package.json                     # Scripts & dependencies (npm run build:apk)
├── report.html                      # Standalone Printable A4 Report
├── style.css                        # VKU institutional styling, responsive layout, print styles
├── sw.js                            # Service Worker offline cache engine
├── TECHNICAL_REPORT.md              # Technical report documentation
├── vercel.json                      # Vercel deployment configuration
└── vite.config.mjs                  # Production bundler outputting to www/
```

### State Management & Synchronization Flow
- **`pending`**: Saved locally to IndexedDB while offline; waiting for network connectivity.
- **`syncing`**: Currently transmitting over HTTPS with a 30-second abort controller timeout.
- **`synced`**: Confirmed by Google Apps Script; timestamped and locked against duplicate submissions.
- **`error`**: Network failure or timeout; retried automatically when connectivity resumes.
- **Stale Session Recovery:** `recoverStaleSyncingRecords()` automatically resets interrupted `syncing` sessions back to `pending` upon application restart.

---

## 4. EMPIRICAL EVIDENCE & SCREENSHOTS
*The following annotated representations illustrate the verified runtime behavior across mobile browsers and Android emulators/devices:*

### Screenshot 1 — Responsive Mobile Viewport & GPS Proximity
* **Visual:** Topbar with VKU institutional branding, online status dot, inspector profile pill, and facility inspection form. GPS card displays exact latitude/longitude (`15.97530, 108.25230`) with a green badge: `✓ Đang ở trong khuôn viên VKU (Cách cổng chính: ~45m)` and a direct Google Maps link.
* **Context:** Verified on simulated mobile viewport (390 x 844) and physical Android screen.

### Screenshot 2 — Photo Capture with Dynamic Watermark & Digital Signature Pad
* **Visual:** The uploaded field photo is compressed to < 1.2MB and has an imprinted dark box watermark at the bottom-right corner: `[VKU FIELD INSPECTION - CSVC] | Mã phòng: K.A201 | Thời gian: 14/09/2026 | GPS: 15.9753, 108.2523`. Below it, the smooth canvas signature pad records the inspector's handwritten signature with a clear/re-sign option.
* **Context:** Verified through Canvas API rendering and touch event handlers.

### Screenshot 3 — Airplane Mode Zero-Connectivity Verification
* **Visual:** When network is disabled (Airplane Mode), a top amber warning banner appears: `⚠️ Chế độ Ngoại tuyến: Thiết bị đang mất mạng. Toàn bộ biên bản kiểm tra được bảo toàn an toàn trong máy!`. Upon submission, a confirmation toast confirms local IndexedDB persistence, and the record count shows `[1] Chờ đồng bộ (Pending)`.
* **Context:** Verified by toggling offline mode in browser devtools and turning off device Wi-Fi.

### Screenshot 4 — Official Inspection Slip Print Preview & Capacitor Android APK
* **Visual:** Clicking "In Biên bản / Xuất PDF" opens an official Vietnamese academic inspection slip formatted for A4 printing (`CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / ĐẠI HỌC ĐÀ NẴNG / TRƯỜNG ĐH CNTT VÀ TRUYỀN THÔNG VIỆT - HÀN / BIÊN BẢN KIỂM TRA HIỆN TRƯỜNG CƠ SỞ VẬT CHẤT`) with photo and signature blocks. The app runs natively as an Android APK compiled in `android/app/build/outputs/apk/debug/app-debug.apk`.
* **Context:** Verified via `@media print` preview and Gradle build output.

---

## 5. TECHNICAL CHALLENGES & RESOLUTIONS

### Challenge 1 — Offline Data Persistence & Uninterrupted Submission
* **Problem:**  
  A field survey application may lose submitted data when the device temporarily has no network connection. Sending data directly to the server is unreliable in this situation. Furthermore, when connection fluctuates, users may re-submit multiple times, causing duplicate entries in Google Sheets.
* **Resolution:**  
  IndexedDB was implemented as the local storage layer (`vku_survey_db`). Survey sessions are first saved locally with a unique UUID session ID (`S-FAC-XXXX`) and synchronization status (`pending`). The application therefore preserves survey data even when the device is completely offline. On the backend, Google Apps Script runs `findSessionRow_()` to verify that the session ID does not already exist before appending rows, achieving true idempotency.

### Challenge 2 — Mobile Photo Size Optimization & Real-Time Evidence Watermarking
* **Problem:**  
  High-resolution smartphone cameras capture photos between 5MB and 15MB. Storing multiple full-size photos in IndexedDB exhausts device storage quotas, and sending them over HTTP exceeds Google Apps Script payload limits (5.5MB). Furthermore, field inspections require tamper-proof proof of date, time, and campus location.
* **Resolution:**  
  An asynchronous HTML5 Canvas pipeline was developed. When a photo is selected, it is resized to a maximum dimension of 1280px and compressed using JPEG encoding at 0.78 quality, reducing file size to under 1.2MB. Simultaneously, the Canvas Context renders an official inspection watermark (Room Code, Timestamp, GPS Coordinates) directly onto the pixel canvas before generating the Base64 string for storage and transmission.

### Challenge 3 — Capacitor Android Native Bridge Integration & WebView Camera Permissions
* **Problem:**  
  Packaging a PWA into a native Android APK using Capacitor requires seamless interoperability between web bundling tools (Vite) and the Android Gradle toolchain, handling native Android runtime permissions for the camera and geolocation, and preventing Service Worker interception from conflicting with local WebView resource schemes.
* **Resolution:**  
  Vite was configured to output directly into `www/` (`vite.config.mjs`), which Capacitor targets as its `webDir`. Native permissions (`CAMERA`, `ACCESS_FINE_LOCATION`) were configured in `AndroidManifest.xml`. In `app.js`, a native platform check detects `window.Capacitor.isNativePlatform()` and invokes `@capacitor/camera`, with a graceful fallback to standard HTML5 file inputs on regular browsers. Finally, `sw.js` was configured to restrict caching to HTTP/HTTPS schemes, allowing the Android APK to compile into a standalone 8.27MB package.

---

*Report prepared and submitted by **Pham Thi Truc Ly** (Student ID: 23IT.B130) — Faculty of Computer Science, Vietnam - Korea University of Information and Communication Technology (VKU).*
