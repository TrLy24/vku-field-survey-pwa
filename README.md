# 🏫 VKU Field Survey PWA — Hệ thống Khảo sát & Giám sát Cơ sở vật chất

[![PWA](https://img.shields.io/badge/PWA-Offline--First-0054A6?style=flat-square&logo=pwa)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![Capacitor](https://img.shields.io/badge/Capacitor-Android%20v8.5.2-119EFF?style=flat-square&logo=capacitor)](https://capacitorjs.com/)
[![Storage](https://img.shields.io/badge/Storage-IndexedDB-10B981?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
[![Backend](https://img.shields.io/badge/Backend-Google%20Apps%20Script-EA4335?style=flat-square&logo=google)](https://developers.google.com/apps-script)
[![Vite](https://img.shields.io/badge/Build-Vite-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)

> **Mini-Project 1**: Offline-first inspection form for campus facilities with zero network connectivity.  
> **Bonus / Next Week**: Đóng gói hoàn chỉnh thành Android Native APK sử dụng Capacitor Bridge, tích hợp module Đăng nhập cán bộ & Chữ ký số.

---

## 📌 1. Giới thiệu Dự án

**VKU Field Survey** là giải pháp phần mềm giám sát và kiểm tra cơ sở vật chất (phòng lab thực hành, giảng đường, máy chiếu, điều hòa, hệ thống PCCC, điện chiếu sáng) dành cho cán bộ Đại học Công nghệ Thông tin và Truyền thông Việt - Hàn (VKU) hoạt động hoàn hảo trong điều kiện **hoàn toàn mất kết nối mạng (Zero Network Connectivity)**.

Ứng dụng tuân thủ nghiêm ngặt triết lý **Local-First**: Mọi dữ liệu biên bản, ảnh hiện trường và chữ ký đều được lưu trữ và bảo vệ trong **IndexedDB** trên máy trước tiên, sau đó tự động đồng bộ hóa lên **Google Sheets** và **Google Drive** khi có Internet.

```text
[Form Kiểm Tra] ---> [IndexedDB Cục Bộ (Máy)] ---> [Tự Đồng Bộ Khi Có Mạng] ---> [Google Sheets & Drive]
     |                     |                                                     |
  - GPS Thực Địa        - Bảo toàn 100%                                        - 19 Cột CSDL chuẩn
  - Watermark Ảnh       - Hoạt động Offline                                    - Lưu trữ ảnh Drive
  - Chữ Ký Số Canvas    - Hỗ trợ mã PIN nhanh                                  - Báo cáo PDF A4
```

---

## ✨ 2. Các Tính năng Nổi bật

### 🏢 Kiểm tra Cơ sở vật chất & Khảo sát Thực địa
- **Khuôn viên VKU:** Hỗ trợ đầy đủ các khu vực: Tòa V (Hành chính), Tòa K (Giảng đường CNTT & Lab máy tính), Tòa A, Tòa B, Thư viện số, Ký túc xá K1/K2, Trung tâm Thể thao, Nhà xe...
- **Hạng mục chi tiết:** Thiết bị CNTT & Lab, Điều hòa & Quạt, Điện chiếu sáng, Bàn ghế, PCCC, Cấp thoát nước, Kết cấu công trình.
- **Phân loại hiện trạng & Ưu tiên:** Đánh giá từ Hoạt động tốt đến Nguy cơ mất an toàn; mức độ ưu tiên từ P1 (Khẩn cấp 2-4h) đến P4 (Định kỳ).

### 🔐 Đăng nhập & Xác thực Cán bộ Ngoại tuyến (Offline Auth)
- Hỗ trợ đăng nhập bằng Email Cán bộ / Mã Thanh tra hoặc **mã PIN 4 chữ số** tiện lợi cho thao tác ngoài hiện trường.
- Tích hợp sẵn 3 tài khoản Demo một chạm đại diện cho các phòng ban:
  - **ThS. Nguyễn Văn An** — Phòng Quản trị Thiết bị & CSVC (`canbo.csvc@vku.udn.vn`, PIN: `1234`)
  - **KS. Trần Thị Mai** — Trung tâm Quản trị Mạng & Lab IT (`kythuat.lab@vku.udn.vn`, PIN: `1234`)
  - **ThS. Lê Hoàng Nam** — Ban Thanh tra & An toàn PCCC (`thanhtra.pccc@vku.udn.vn`, PIN: `1234`)
- **Phiên làm việc lưu trữ cục bộ (Offline Session Persistence):** Cho phép đăng nhập và sử dụng ngay cả khi bật Chế độ Máy bay (Airplane Mode).

### 📍 Tọa độ GPS & Đo khoảng cách Campus
- Định vị vệ tinh thực địa và **đo khoảng cách tự động** tới cổng chính trường VKU (15.9753° N, 108.2523° E) qua công thức Haversine.
- Liên kết trực tiếp xem vị trí trên Google Maps.

### 📷 Nén ảnh & Đóng dấu Watermark Tự động
- Tự động nén ảnh chụp bằng Canvas API xuống dưới 1.2MB, tiết kiệm băng thông và bộ nhớ.
- Đóng dấu watermark trực tiếp lên góc ảnh: `[VKU FIELD INSPECTION] | Mã phòng | Thời gian | Tọa độ GPS`.

### ✍️ Chữ ký Điện tử (Digital Signature Pad)
- Ký tên trực tiếp bằng ngón tay hoặc bút cảm ứng trên màn hình HTML5 Canvas.
- Xuất chuỗi chữ ký vector hóa đính kèm biên bản.

### 🖨️ In Biên bản Chuẩn Hành chính / Xuất PDF (Print Slip)
- Tích hợp định dạng `@media print` sẵn sàng in hoặc lưu thành file PDF biên bản kiểm tra cơ sở vật chất trang trọng theo chuẩn văn bản hành chính của Đại học VKU.

### 📱 Đóng gói Android APK qua Capacitor Bridge
- Đã cấu hình và biên dịch thành công file cài đặt Android Native:  
  📁 `android/app/build/outputs/apk/debug/app-debug.apk` (8.27 MB).
- Tích hợp `@capacitor/camera`, `@capacitor/filesystem` và tự động nhận diện nền tảng Native.

---

## 🚀 3. Cài đặt & Chạy Thử nghiệm

### 3.1. Yêu cầu Môi trường
- Node.js (khuyến nghị v18+)
- Java JDK 21+ và Android SDK (nếu muốn tự build Android APK từ mã nguồn)

### 3.2. Chạy Local (Môi trường Web)
```bash
# Cài đặt dependencies
npm install

# Khởi chạy máy chủ phát triển Vite
npm run dev
```
Mở trình duyệt tại địa chỉ: `http://localhost:5173`

### 3.3. Biên dịch Web Production
```bash
npm run build
```
Tài nguyên sau khi build sẽ nằm trong thư mục `www/`.

---

## 📱 4. Đóng gói Ứng dụng Android APK (Capacitor)

Dự án đã thiết lập sẵn toàn bộ cấu hình Gradle và Capacitor trong thư mục `android/`:

```bash
python -m http.server 8080
```

Sau đó mở:

```text
http://localhost:8080
```

`localhost` là secure context hợp lệ cho các API như Service Worker/Geolocation trong môi trường phát triển.

## 4. Luồng offline

Khi nhấn `Gửi phiên khảo sát`:

1. Validate form.
2. Tạo `sessionId`.
3. Lưu toàn bộ payload vào IndexedDB trước.
4. Hiện `Đã lưu phiên khảo sát vào máy`.
5. Nếu online thì tự động sync.
6. Nếu request lỗi, record vẫn giữ trong IndexedDB ở trạng thái `error`.
7. Có thể bấm `Thử lại` hoặc `Đồng bộ ngay`.

## 5. IndexedDB

```javascript
DB_NAME = "vku_survey_db";
DB_VERSION = 1;
STORE = "sessions";
```

Record có:

```text
=======
https://script.google.com/macros/s/DEPLOYMENT_ID/exec
Bước 5 — Cấu hình frontend
Mở config.js và chỉ thay:

APPS_SCRIPT_URL: "YOUR_DEPLOYED_WEB_APP_URL"
Không cần sửa URL ở file khác.

3. Chạy local
Không mở index.html bằng file://.

Dùng HTTP server, ví dụ:

python -m http.server 8080
Sau đó mở:

http://localhost:8080
localhost là secure context hợp lệ cho các API như Service Worker/Geolocation trong môi trường phát triển.

4. Luồng offline
Khi nhấn Gửi phiên khảo sát:

Validate form.
Tạo sessionId.
Lưu toàn bộ payload vào IndexedDB trước.
Hiện Đã lưu phiên khảo sát vào máy.
Nếu online thì tự động sync.
Nếu request lỗi, record vẫn giữ trong IndexedDB ở trạng thái error.
Có thể bấm Thử lại hoặc Đồng bộ ngay.
5. IndexedDB
DB_NAME = "vku_survey_db";
DB_VERSION = 1;
STORE = "sessions";
Record có:

>>>>>>> 96a164b30257fd53a4fe429a020ea068688077bc
sessionId
status
createdAt
syncedAt
retryCount
lastError
payload
<<<<<<< HEAD
```

Status:

```text
=======
Status:

>>>>>>> 96a164b30257fd53a4fe429a020ea068688077bc
pending
syncing
synced
error
<<<<<<< HEAD
```

## 6. Google Sheets

Backend dùng chính xác 19 cột:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```
Bạn có thể copy file này sang điện thoại Android và cài đặt trực tiếp để trải nghiệm!

---

## ☁️ 5. Hướng dẫn Triển khai Trực tuyến (Live Deployment)

### 5.1. Triển khai lên Vercel
Dự án đã có sẵn tệp cấu hình `vercel.json` tối ưu cho PWA:
```bash
# Cài đặt Vercel CLI (nếu chưa có)
npm i -g vercel

# Triển khai chỉ với 1 lệnh
vercel --prod
```
Hoặc import trực tiếp Git Repository trên dashboard [Vercel](https://vercel.com). Vercel sẽ tự động phát hiện lệnh build `npm run build` và thư mục xuất `www`.

### 5.2. Triển khai lên Cloudflare Pages
1. Đăng nhập [Cloudflare Dashboard](https://dash.cloudflare.com) -> **Workers & Pages**.
2. Chọn **Create application** -> **Pages** -> **Connect to Git**.
3. Chọn repo `vku-field-survey-pwa`.
4. Cấu hình bản build:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `www`
5. Nhấn **Save and Deploy**. Cloudflare Pages sẽ cung cấp URL HTTPS miễn phí trọn đời và tự động áp dụng cấu hình headers từ `public/_headers`.

---

## 📊 6. Cấu hình Backend Google Apps Script

Mã nguồn backend nằm tại thư mục `google-apps-script/Code.gs`:
1. Mở Google Spreadsheet của bạn và tạo sheet `CSDL`.
2. Truy cập **Extensions** -> **Apps Script** và dán nội dung từ `google-apps-script/Code.gs`.
3. Điền `SPREADSHEET_ID` của bạn.
4. Chạy hàm `setupSheet()` và `setupDriveFolder()` để cấp quyền.
5. Chọn **Deploy** -> **New deployment** -> **Web app** (Who has access: `Anyone`).
6. Cập nhật URL Web App vừa tạo vào file `config.js` (`APPS_SCRIPT_URL`).

---

## 📄 7. Báo cáo Kỹ thuật (Technical Report)

- **Xem trực tuyến & In PDF:** Mở tệp `report.html` trong trình duyệt và nhấn nút **"In Báo Cáo / Xuất PDF"** (chuẩn 3 trang A4).
- **Xem dạng Markdown:** Tham khảo tệp [TECHNICAL_REPORT.md](file:///c:/Users/fptsh/vku-field-survey-pwa/TECHNICAL_REPORT.md).

---

## 📁 8. Cấu trúc Thư mục

```text
vku-field-survey-pwa/
├── android/                   # Dự án Native Android với Capacitor Bridge
│   ├── app/build/outputs/apk/ # Thư mục chứa file app-debug.apk
│   └── ...
├── google-apps-script/
│   └── Code.gs               # Backend tiếp nhận đồng bộ Google Sheets & Drive
├── icons/                     # Biểu tượng PWA chuẩn 192x192 và 512x512
├── public/                    # Tài nguyên tĩnh & headers cho Cloudflare Pages
├── app.js                     # Core logic: IndexedDB, Form, Watermark, Canvas, Sync
├── config.js                  # Điểm cấu hình duy nhất cho Apps Script URL
├── index.html                 # Giao diện chính responsive
├── manifest.json              # Web App Manifest
├── report.html                # Báo cáo kỹ thuật in ấn định dạng A4
├── style.css                  # Thiết kế giao diện theo phong cách Đại học VKU
├── sw.js                      # Service Worker quản lý Cache ngoại tuyến
├── TECHNICAL_REPORT.md        # Báo cáo kỹ thuật chi tiết
├── vercel.json                # Cấu hình triển khai Vercel PWA
└── vite.config.mjs            # Cấu hình Vite bundler xuất ra www/
```

---

*Phát triển bởi Nhóm Sinh viên Khảo sát Thực địa — Khoa Khoa học Máy tính, Trường Đại học CNTT&TT Việt - Hàn (VKU).*
