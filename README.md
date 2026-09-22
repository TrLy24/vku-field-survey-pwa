# VKU Field Survey PWA

Ứng dụng khảo sát sinh viên VKU ngoài thực địa, được xây dựng theo hướng **offline-first**, cho phép người dùng nhập thông tin khảo sát, lấy vị trí GPS, chụp ảnh hiện trường và lưu dữ liệu ngay cả khi không có kết nối mạng.

Project được triển khai dưới dạng **Progressive Web App (PWA)** và được đóng gói thành ứng dụng Android bằng **Capacitor**.

## 1. Tổng quan hệ thống

```text
                    ┌──────────────────┐
                    │  VKU Field Survey│
                    │       PWA        │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │     IndexedDB     │
                    │  Offline Storage  │
                    └────────┬─────────┘
                             │
                    Network available
                             │
                    ┌────────▼─────────┐
                    │ Google Apps Script│
                    │      Web App      │
                    └───────┬───┬──────┘
                            │   │
                  ┌─────────┘   └──────────┐
                  ▼                        ▼
           Google Sheets             Google Drive
              (CSDL)                (Survey Photos)
```

### Công nghệ sử dụng

* HTML5
* CSS3
* JavaScript
* IndexedDB
* Progressive Web App (PWA)
* Service Worker
* Geolocation API
* Camera API
* Google Apps Script
* Google Sheets
* Google Drive
* Google Maps
* Capacitor
* Android

---

# 2. Các phiên bản của project

Project được phát triển theo từng giai đoạn.

### Week 1 — PWA

Branch: main
Chức năng chính:

* Responsive mobile UI
* Form khảo sát
* Lưu dữ liệu offline bằng IndexedDB
* GPS
* Chụp ảnh
* Nén ảnh
* Đồng bộ dữ liệu khi có mạng
* Google Sheets
* Google Drive
* Google Maps
* Service Worker
* GitHub Pages Live Demo

### Week 2 — Android với Capacitor

Branch: text
capacitor-android

Bổ sung:

* Capacitor Android project
* Android Studio
* Android native wrapper
* Đồng bộ PWA vào Android
* Build và chạy ứng dụng trên thiết bị/emulator Android

Các commit chính của Week 2:

Việc sử dụng branch riêng giúp giữ lại phiên bản PWA của Week 1 và phân biệt rõ phần phát triển Android của Week 2.

---

# 3. Cấu trúc project

```text
vku-field-survey-pwa/
│
├── index.html
├── style.css
├── app.js
├── config.js
├── manifest.json
├── sw.js
├── package.json
├── package-lock.json
├── vite.config.mjs
│
├── public/
│   └── ...
│
├── icons/
│   └── ...
│
├── google-apps-script/
│   └── Code.gs
│
└── android/
    ├── app/
    ├── gradle/
    ├── build.gradle
    ├── settings.gradle
    └── ...
```

## 4. File chính

### `index.html`

Giao diện chính của ứng dụng:

* Form khảo sát
* Quản lý session
* Hiển thị trạng thái đồng bộ
* Modal xem chi tiết
* Các thao tác với session

### `style.css`

Chứa giao diện responsive cho mobile và desktop.

### `app.js`

Xử lý logic chính:

* IndexedDB
* Draft/session
* Validate form
* GPS
* Camera
* Image compression
* Offline queue
* Sync
* Retry
* Export JSON
* Xóa dữ liệu local
* Hiển thị chi tiết session

### `config.js`

Chứa cấu hình frontend, đặc biệt là URL Google Apps Script.

Chỉ cần cấu hình URL tại đây:

```javascript
APPS_SCRIPT_URL: "YOUR_DEPLOYED_WEB_APP_URL"
```

### `manifest.json`

Khai báo PWA:

* App name
* Icons
* Theme
* Display mode
* Start URL

### `sw.js`

Service Worker dùng để:

* Cache app shell
* Hỗ trợ hoạt động offline
* Cập nhật cache khi phiên bản PWA thay đổi

Service Worker **không cache các request POST/API bên ngoài**.

### `google-apps-script/Code.gs`

Backend Google Apps Script:

* Nhận dữ liệu từ PWA
* Ghi dữ liệu vào Google Sheets
* Lưu ảnh vào Google Drive
* Kiểm tra session trùng
* Xử lý retry
* Trả JSON response cho frontend

### `android/`

Android project được tạo bằng Capacitor và có thể mở trực tiếp bằng Android Studio.

---

# 5. Cấu hình Google Sheets

Tạo một Google Spreadsheet.

Đặt tên sheet dữ liệu:

```text
CSDL
```

Lấy Spreadsheet ID từ URL:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

Trong:

```text
google-apps-script/Code.gs
```

thay:

```javascript
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID";
```

bằng Spreadsheet ID thực tế.

---

# 6. Cấu hình Google Drive

Project có thể sử dụng Google Drive để lưu ảnh khảo sát.

Có thể để:

```javascript
DRIVE_FOLDER_ID = ""
```

để Apps Script tự tìm hoặc tạo folder:

```text
VKU_Survey_Photos
```

Hoặc có thể cấu hình ID của một folder Drive đã có.

Ảnh được nén ở frontend trước khi gửi để giảm kích thước request.

Tên file ảnh:

```text
SESSION_ID.jpg
```

Khi retry cùng một session, hệ thống sử dụng lại file tương ứng thay vì tạo ảnh trùng.

Mặc định ảnh **không được tự động public**.

Nếu cần chia sẻ ảnh bằng link, có thể cấu hình:

```javascript
const SHARE_PHOTOS_ANYONE_WITH_LINK = true;
```

Việc chia sẻ cần phù hợp với chính sách quyền truy cập của tài khoản Google Workspace.

---

# 7. Deploy Google Apps Script

Trong Apps Script:

```text
Deploy
→ New deployment
→ Web app
```

Sau khi deploy, lấy URL dạng:

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

Sau đó mở:

```text
config.js
```

và cấu hình:

```javascript
APPS_SCRIPT_URL: "https://script.google.com/macros/s/DEPLOYMENT_ID/exec"
```

Không cần khai báo URL Apps Script ở nhiều file khác nhau.

---

# 8. Cấp quyền và kiểm tra Backend

Trong Apps Script có thể chạy:

```javascript
setupSheet()
setupDriveFolder()
testConfiguration()
```

Lần đầu chạy, Google sẽ yêu cầu cấp quyền.

`testConfiguration()` được sử dụng để kiểm tra:

* Spreadsheet
* Sheet `CSDL`
* Drive folder

Endpoint cũng có thể kiểm tra bằng cách mở URL `/exec`.

Nếu hoạt động bình thường, endpoint trả về dạng:

```json
{
  "result": "ok",
  "message": "VKU Survey endpoint is alive"
}
```

---

# 9. Luồng Offline-first

Khi người dùng nhấn:

```text
Gửi phiên khảo sát
```

hệ thống thực hiện:

```text
1. Validate dữ liệu
       ↓
2. Tạo sessionId
       ↓
3. Lưu payload vào IndexedDB
       ↓
4. Hiển thị "Đã lưu phiên khảo sát vào máy"
       ↓
5. Kiểm tra kết nối mạng
       ↓
6. Nếu online → đồng bộ
       ↓
7. Nếu offline → giữ trạng thái pending
       ↓
8. Khi có mạng → tự động sync
```

Nếu đồng bộ thất bại, dữ liệu **không bị xóa khỏi máy**.

Session được giữ lại với trạng thái:

```text
error
```

Người dùng có thể:

* Thử lại
* Đồng bộ ngay

---

# 10. IndexedDB

Database:

```javascript
DB_NAME = "vku_survey_db";
DB_VERSION = 1;
STORE = "sessions";
```

Mỗi record gồm:

```text
sessionId
status
createdAt
syncedAt
retryCount
lastError
payload
```

Các trạng thái:

```text
pending
syncing
synced
error
```

Điều này giúp dữ liệu khảo sát vẫn tồn tại khi:

* Mất Wi-Fi
* Mất 4G/5G
* Đóng trình duyệt
* Reload trang
* Request đồng bộ thất bại

---

# 11. Chống gửi dữ liệu trùng

`sessionId` được sử dụng làm **idempotency key**.

Backend sử dụng `LockService` trước khi kiểm tra và ghi dữ liệu.

Nếu session đã tồn tại, backend trả về:

```json
{
  "result": "ok",
  "message": "Phiên khảo sát đã tồn tại",
  "sessionId": "S-...",
  "duplicate": true
}
```

Frontend chỉ đánh dấu session là `synced` khi nhận được response hợp lệ với:

```text
result: "ok"
```

---

# 12. Google Sheets

Backend sử dụng 19 cột dữ liệu:

```text
Timestamp (server)
Session ID
Tên phiên khảo sát
Người phỏng vấn
Thời gian (thiết bị)
Vĩ độ
Kinh độ
Bản đồ (link)
Ảnh hiện trường (link)
Tên sinh viên
Lớp / Khoa
Năm học
Đang làm thêm
Nhu cầu tìm việc
Ngành mong muốn
Mức lương mong muốn
Kỹ năng còn thiếu
Đề xuất hỗ trợ
Ghi chú
```

Backend không tự động overwrite dữ liệu cũ.

Nếu header hiện tại không khớp cấu hình, hệ thống dừng với lỗi cấu hình thay vì tự sửa dữ liệu.

---

# 13. Google Maps và GPS

Ứng dụng sử dụng Geolocation API để lấy:

```text
Latitude
Longitude
```

Sau đó tạo Google Maps link từ tọa độ.

Các trường hợp được xử lý:

* GPS thành công
* Người dùng từ chối quyền vị trí
* GPS timeout
* Không lấy được vị trí

---

# 14. Chạy PWA local

Không mở trực tiếp:

```text
file://
```

Thay vào đó chạy HTTP server.

Ví dụ:

```bash
python -m http.server 8080
```

Sau đó mở:

```text
http://localhost:8080
```

`localhost` là secure context phù hợp cho các API như:

* Service Worker
* Geolocation

---

# 15. Chạy Android bằng Android Studio

Project Android được tạo bằng Capacitor.

Từ thư mục project:

```bash
npx cap sync android
```

Sau đó mở Android Studio:

```text
android/
```

Hoặc dùng:

```bash
npx cap open android
```

Trong Android Studio có thể:

* Chọn Android Emulator
* Kết nối thiết bị Android thật
* Run project
* Build APK

---

# 16. Build APK

Trong Android Studio:

```text
Build
→ Build APK(s)
```

APK debug thường được tạo trong:

```text
android/app/build/outputs/apk/debug/
```

Ví dụ:

```text
app-debug.apk
```

Thư mục `build/` không được commit lên GitHub.

---

# 17. Kiểm thử

## Frontend

Kiểm tra:

* Responsive mobile
* Thiếu field
* Online submit
* Offline submit
* Reload sau khi lưu
* Online trở lại tự động sync
* Sync nhiều lần
* Retry khi lỗi
* GPS success
* GPS denied
* GPS timeout
* Camera
* Image preview
* Image compression
* Export JSON
* Delete local record

## Backend

Kiểm tra:

* GET `/exec`
* POST hợp lệ
* JSON lỗi
* Thiếu `sessionId`
* Duplicate `sessionId`
* Ghi đúng 19 cột
* GPS Maps URL
* Drive photo
* Retry không tạo ảnh duplicate
* Header mismatch
* Quyền Google Sheets
* Quyền Google Drive

## Android

Kiểm tra:

* App khởi động
* Scroll toàn bộ form
* Nhập dữ liệu
* Camera
* GPS
* Offline storage
* Sync khi có mạng
* Android back button
* Responsive layout
* Build APK thành công

---

# 18. Cập nhật PWA

Sau khi sửa:

```text
index.html
app.js
style.css
```

hãy tăng phiên bản cache trong:

```text
sw.js
```

Ví dụ:

```javascript
const CACHE_NAME = "vku-field-survey-v3";
```

Service Worker sẽ sử dụng cache mới.

Nếu điện thoại vẫn hiển thị phiên bản cũ:

1. Đóng PWA.
2. Mở lại.
3. Nếu cần, xóa cache/site data của website.
4. Mở lại Live Demo.

---

# 19. Xử lý lỗi đồng bộ

Nếu session hiển thị:

```text
Lỗi
```

kiểm tra theo thứ tự:

```text
1. Internet
2. config.js
3. APPS_SCRIPT_URL
4. URL /exec
5. Deployment Apps Script
6. Authorization
7. SPREADSHEET_ID
8. Sheet CSDL
9. Google Drive permission
10. Apps Script Executions
```

Frontend không chỉ dựa vào HTTP status để xác định thành công.

Response cần kiểm tra JSON:

```json
{
  "result": "ok"
}
```

hoặc:

```json
{
  "result": "error",
  "message": "..."
}
```

---

# 20. Git và các phiên bản

Repository:

```text
https://github.com/TrLy24/vku-field-survey-pwa
```

### Week 1

Branch:

```text
main
```

Dùng cho phiên bản PWA và GitHub Pages.

### Week 2

Branch:

```text
capacitor-android
```

Dùng cho phiên bản Android được đóng gói bằng Capacitor.

Các commit Week 2:

```text
3ef7c99 Add Capacitor Android baseline
ac9961d Complete PWA and Android Capacitor app
```

Cách tổ chức này giúp giữ lại phiên bản Week 1 và đồng thời lưu riêng quá trình phát triển Android của Week 2.

---

# 21. Live Demo

GitHub Pages:

https://trly24.github.io/vku-field-survey-pwa/

GitHub Repository:

https://github.com/TrLy24/vku-field-survey-pwa

> Live Demo sử dụng phiên bản PWA được triển khai bằng GitHub Pages. Phiên bản Android được chạy/build thông qua Capacitor và Android Studio.

---

# 22. Giới hạn hiện tại

* PWA cần HTTPS hoặc localhost để sử dụng đầy đủ một số Web API như Service Worker và Geolocation.
* Dữ liệu offline được lưu trên thiết bị bằng IndexedDB.
* Ảnh làm tăng kích thước dữ liệu local và request; frontend đã nén ảnh trước khi upload.
* Google Apps Script có giới hạn về thời gian thực thi và kích thước request.
* Google Drive cần quyền phù hợp để người dùng có thể xem ảnh.
* Nếu triển khai Web App cho anonymous users, cần cân nhắc quyền truy cập và chống spam ở tầng triển khai.

---

# 23. Mục tiêu của project

VKU Field Survey PWA hướng đến một quy trình khảo sát có thể hoạt động trong điều kiện mạng không ổn định:

```text
Nhập khảo sát
      ↓
Lưu local
      ↓
Không có mạng
      ↓
Dữ liệu vẫn được giữ trên thiết bị
      ↓
Có mạng trở lại
      ↓
Automatic Sync
      ↓
Google Sheets / Google Drive
```

Phiên bản Android sử dụng Capacitor để đóng gói cùng ứng dụng web thành ứng dụng có thể chạy trên Android.

