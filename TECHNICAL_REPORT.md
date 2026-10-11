# BÁO CÁO KỸ THUẬT: MINI-PROJECT 1
## HỆ THỐNG PWA & NATIVE ANDROID KHẢO SÁT HIỆN TRƯỜNG CƠ SỞ VẬT CHẤT VKU
### (Offline-First Campus Facility Inspection with Capacitor Bridge)

---

- **Trường:** Đại học Công nghệ Thông tin và Truyền thông Việt - Hàn (VKU) · Đại học Đà Nẵng
- **Khoa:** Khoa Khoa học Máy tính
- **Dự án:** Mini-Project 1 — VKU Field Survey PWA
- **Phiên bản:** v2.2 (Hỗ trợ PWA Offline-First & Android Native APK qua Capacitor Bridge)
- **Repository:** [https://github.com/TrLy24/vku-field-survey-pwa](https://github.com/TrLy24/vku-field-survey-pwa)

---

## 1. TỔNG QUAN DỰ ÁN & MỤC TIÊU KỸ THUẬT

### 1.1. Bối cảnh & Bài toán thực tế
Tại các trường đại học với khuôn viên rộng lớn như VKU, công tác kiểm tra, giám sát cơ sở vật chất (phòng lab thực hành máy tính, hệ thống điều hòa, thiết bị PCCC, máy chiếu giảng đường, trạm điện) thường xuyên phải thực hiện tại các khu vực **mất sóng mạng hoàn toàn (Zero Network Connectivity)** như tầng hầm, phòng thí nghiệm kín, hoặc khi gặp sự cố viễn thông.

### 1.2. Mục tiêu kỹ thuật
1. **Offline-First PWA (Zero Data Loss):** Toàn bộ giao diện, form kiểm tra, logic nén ảnh và cơ sở dữ liệu hoạt động 100% không phụ thuộc Internet. Mọi biên bản được lưu trữ trước vào **IndexedDB** trên máy.
2. **Xác thực Cán bộ Thanh tra Ngoại tuyến:** Cho phép cán bộ đăng nhập bằng Email, mã PIN 4 chữ số hoặc mở khóa phiên làm việc ngay cả trong chế độ máy bay (Airplane Mode).
3. **Minh chứng Thực địa Đầy đủ:** Tích hợp GPS đo khoảng cách tới cổng trường VKU (công thức Haversine), chụp ảnh hiện trường đóng dấu Watermark thời gian thực, và khung ký tên số điện tử (Digital Canvas Signature).
4. **Đồng bộ Đám mây Thông minh (Cloud Sync):** Tự động phát hiện khi có mạng trở lại (`online` event) để đẩy dữ liệu lên Google Sheets và Google Drive thông qua Google Apps Script Web App.
5. **Đóng gói Android APK (Next Week Goal Complete):** Sử dụng **Capacitor 8.5.2 Bridge** biên dịch ứng dụng thành tệp cài đặt Android Native APK (`app-debug.apk`), hỗ trợ Camera native và giao diện tối ưu cho thiết bị di động.

---

## 2. KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

```text
+-----------------------------------------------------------------------------------+
|               VKU FIELD SURVEY PWA & CAPACITOR ANDROID CLIENT                     |
|                                                                                   |
|  [Inspector Auth]  [Facility Form]  [Watermark Camera]  [Digital Signature Pad]   |
|         |                 |                  |                     |              |
|         +-----------------+------------------+---------------------+              |
|                                    | (Local Transaction)                          |
|                                    v                                              |
|                   [IndexedDB Client Store: "vku_survey_db"]                       |
|                   Status: pending | syncing | synced | error                      |
+------------------------------------+----------------------------------------------+
                                     |
               Auto-Sync / Retry Queue (Online Event Listener)
                                     |
                                     v
+------------------------------------+----------------------------------------------+
|                          CLOUD BACKEND INFRASTRUCTURE                             |
|                                                                                   |
|  [Google Apps Script Gateway] ---> [Google Sheets: CSDL (19 Cột dữ liệu chuẩn)]   |
|                               \--> [Google Drive: Lưu ảnh hiện trường minh chứng] |
|                                                                                   |
|  [Vercel / Cloudflare Pages]: Cung cấp Host HTTPS PWA, Service Worker Cache Shell |
+-----------------------------------------------------------------------------------+
```

### 2.1. Phân tầng kiến trúc
- **Client App Shell (PWA & Capacitor):**
  - Service Worker (`sw.js`): Cache trước các tài nguyên tĩnh (`index.html`, `manifest.json`, biểu tượng, script). Cung cấp cơ chế fallback ngoại tuyến điều hướng.
  - Form UI: Thiết kế responsive trên nền chuẩn màu nhận diện thương hiệu VKU (Deep Navy `#003B73`, Royal Blue `#0054A6`, Crimson `#C41230`).
- **Persistence Tier (IndexedDB):**
  - Database: `vku_survey_db` (Version 1).
  - Object Store: `sessions` với keyPath là `sessionId`.
  - Các trường cốt lõi: `sessionId`, `status`, `createdAt`, `syncedAt`, `retryCount`, `lastError`, `payload`.
- **Backend Tier (Serverless Google Cloud):**
  - Google Apps Script: Tiếp nhận HTTP POST, trích xuất chuỗi Base64 ảnh lưu thành tệp hình ảnh trong Google Drive (`VKU_Survey_Photos`), ghi thông tin vào trang tính `CSDL` của Google Spreadsheet.

---

## 3. CHI TIẾN LƯỢC ĐỒNG BỘ & QUẢN LÝ DỮ LIỆU

### 3.1. Vòng đời Trạng thái Biên bản (Record Lifecycle)

| Trạng thái | Ý nghĩa Kỹ thuật | Xử lý |
| :--- | :--- | :--- |
| `pending` | Đã lưu vào IndexedDB thành công, đang xếp hàng chờ đồng bộ | Giữ an toàn trong thiết bị; hiển thị badge vàng |
| `syncing` | Đang trong tiến trình gửi HTTP request lên Web App | Đặt cờ khóa; nếu crash sẽ tự phục hồi về `pending` |
| `synced` | Máy chủ Google Apps Script xác nhận ghi dữ liệu thành công | Hiển thị badge xanh; mở chức năng in biên bản PDF |
| `error` | Gặp lỗi mạng hoặc máy chủ phản hồi thất bại | Tăng `retryCount`, ghi nhận `lastError`, sẵn sàng thử lại |

### 3.2. Tính Idempotency (Chống gửi trùng lặp)
Mỗi phiên khảo sát mang một mã ID duy nhất theo mẫu:
`S-FAC-[TIMESTAMP]-[RANDOM_BASE36]` (Ví dụ: `S-FAC-MNC29-A7K2X`). Phía Google Apps Script sử dụng hàm kiểm tra:
```javascript
const existingRow = findSessionRow_(sheet, payload.sessionId);
if (existingRow > 0) {
  return jsonResponse_({
    result: "ok",
    message: "Phiên khảo sát đã tồn tại",
    sessionId: payload.sessionId,
    duplicate: true
  });
}
```
Nhờ vậy, ngay cả khi kết nối mạng chập chờn gửi lại nhiều lần, dữ liệu không bao giờ bị nhân đôi trong bảng tính.

---

## 4. TÍNH NĂNG CHUYÊN NGHIỆP NGOÀI THỰC ĐỊA

1. **Đo khoảng cách khuôn viên VKU (Haversine GPS Formula):**
   Ứng dụng tính khoảng cách thực tế giữa vị trí của người kiểm tra và tâm điểm trường Đại học VKU (15.9753° N, 108.2523° E), giúp phát hiện và gắn cờ vị trí hợp lệ trong khuôn viên.
2. **Nén ảnh & Đóng dấu Watermark thời gian thực:**
   Ảnh chụp từ camera được nén bằng Canvas API về kích thước tối đa 1280px (chất lượng 0.78, dung lượng < 1.2MB). Hệ thống trực tiếp vẽ dòng watermark:
   `[VKU FIELD INSPECTION - CSVC] | Mã phòng: K.A201 | Thời gian: DD/MM/YYYY | GPS: 15.9753, 108.2523` lên góc dưới ảnh.
3. **Chữ ký điện tử Canvas (Digital Signature Pad):**
   Cán bộ ký trực tiếp trên màn hình cảm ứng, xuất ra định dạng Base64 PNG đính kèm biên bản.
4. **Mẫu In Biên bản Chuẩn Hành chính (Print / Export PDF):**
   Tích hợp định dạng `@media print` sẵn sàng xuất file PDF biên bản kiểm tra cơ sở vật chất chuẩn mẫu đại học VKU có Quốc hiệu, Tiêu ngữ, Bảng chi tiết, Ảnh minh chứng và Chữ ký xác nhận.

---

## 5. ĐÓNG GÓI ANDROID APK BẰNG CAPACITOR BRIDGE

Dự án đã hoàn thiện yêu cầu gói APK Android bằng cách sử dụng **Capacitor 8.5.2 Bridge**:

```bash
# 1. Build production web bundle
npm run build

# 2. Đồng bộ asset sang thư mục Android Native
npx cap sync android

# 3. Biên dịch Native Android APK
cd android && gradlew.bat assembleDebug
```

- **Kết quả build:** `android/app/build/outputs/apk/debug/app-debug.apk`
- **Kích thước APK:** `8.27 MB`
- **Tương thích:** Android 7.0 đến Android 15 (API level 24 - 35)

---

## 6. KẾT QUẢ KIỂM THỬ THỰC ĐỊA (TESTING BENCHMARKS)

| Bài kiểm tra (Test Case) | Môi trường kiểm thử | Kết quả | Trạng thái |
| :--- | :--- | :--- | :--- |
| **PWA Cache Shell** | Chrome / Android WebView | Tải 100% offline từ Service Worker | **PASS** |
| **Offline Data Entry** | Bật Airplane Mode (0 KB/s) | Form lưu vào IndexedDB trong 42ms | **PASS** |
| **Auto-Sync Recovery** | Tắt Airplane Mode | Sự kiện `online` đồng bộ 100% records | **PASS** |
| **Camera & Watermark** | Camera điện thoại Android | Đóng dấu ngày giờ & tọa độ chính xác | **PASS** |
| **Cài đặt APK Native** | Thiết bị di động Android | Cài đặt và hoạt động trơn tru không lỗi | **PASS** |

---

## 7. HƯỚNG DẪN TRIỂN KHAI LIVE (DEPLOYMENT)

### 7.1. Triển khai Vercel
1. Đẩy mã nguồn lên GitHub: `git push origin main`
2. Kết nối repo tại [vercel.com](https://vercel.com)
3. Cấu hình tự động theo `vercel.json` (Build command: `npm run build`, Output: `www`).

### 7.2. Triển khai Cloudflare Pages
1. Tại Cloudflare Dashboard, chọn **Create a project** -> **Connect to Git**.
2. Chọn repository `vku-field-survey-pwa`.
3. Build setting: Framework `Vite`, Command `npm run build`, Directory `www`.
4. Cloudflare tự nhận diện `public/_headers` và cấp phát HTTPS miễn phí trọn đời.

---

*Báo cáo được hoàn thiện và kiểm thử thành công vào ngày 11/10/2026.*
