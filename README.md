VKU Field Survey PWA
Ứng dụng khảo sát sinh viên VKU ngoài thực địa, thiết kế theo hướng offline-first:

Form -> IndexedDB -> Google Apps Script -> Google Sheets + Google Drive
                    \-> Google Maps link từ GPS
1. File chính
index.html: giao diện khảo sát và quản lý session offline.
style.css: UI responsive pastel tím/trắng.
app.js: IndexedDB, draft, GPS, camera, nén ảnh, sync/retry, export và modal detail.
config.js: chỉ một nơi cấu hình URL Apps Script.
manifest.json: PWA manifest.
sw.js: Service Worker cache app shell; không cache request POST/API bên ngoài.
google-apps-script/Code.gs: backend Google Apps Script.
2. Cấu hình Apps Script
Bước 1 — Google Sheets
Tạo một Google Spreadsheet.
Đặt tên tab dữ liệu là CSDL hoặc để Apps Script tự tạo.
Lấy Spreadsheet ID trong URL:
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
Bước 2 — Apps Script
Mở Extensions -> Apps Script hoặc tạo project Apps Script mới.
Mở file google-apps-script/Code.gs.
Thay:
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID";
bằng ID thực tế.

Có thể để DRIVE_FOLDER_ID = "" để hệ thống tự tạo/tìm thư mục VKU_Survey_Photos.
Hoặc điền ID một folder Drive đã có.
Bước 3 — Cấp quyền
Trong Apps Script chạy lần lượt:

setupSheet()
setupDriveFolder()
testConfiguration()
Lần chạy đầu tiên Google sẽ yêu cầu cấp quyền. Kiểm tra testConfiguration() trả về tên spreadsheet, sheet và folder Drive.

Bước 4 — Deploy Web App
Chọn:

Deploy -> New deployment -> Web app
Thực hiện deployment dưới tài khoản có quyền ghi Google Sheets/Drive.

Nếu cần người dùng điện thoại không đăng nhập Google, Web App phải được cấu hình quyền truy cập phù hợp với mô hình sử dụng. Không chia sẻ rộng hơn mức cần thiết.

Sau khi deploy, lấy URL dạng:

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

sessionId
status
createdAt
syncedAt
retryCount
lastError
payload
Status:

pending
syncing
synced
error
6. Google Sheets
Backend dùng chính xác 19 cột:

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
Script không overwrite header/dữ liệu cũ. Nếu sheet đã có header nhưng không khớp, backend dừng với lỗi cấu hình thay vì tự sửa dữ liệu cũ.

7. Chống trùng
sessionId là idempotency key.

Apps Script dùng LockService trước khi kiểm tra và ghi. Nếu session đã tồn tại, backend trả:

{
  "result": "ok",
  "message": "Phiên khảo sát đã tồn tại",
  "sessionId": "S-...",
  "duplicate": true
}
Frontend chỉ mark synced khi JSON có result: "ok".

8. Ảnh Drive
Ảnh được nén ở frontend xuống khoảng <= 1.8 MB trước khi gửi.

Backend lưu file theo tên:

SESSION_ID.jpg
Retry cùng sessionId sẽ tái sử dụng file đã có thay vì tạo ảnh trùng.

Mặc định ảnh không được tự động public. Nếu thực sự cần link công khai, đổi:

const SHARE_PHOTOS_ANYONE_WITH_LINK = true;
và kiểm tra chính sách Google Workspace của tài khoản triển khai.

9. Đồng bộ lỗi
Nếu session hiển thị Lỗi, xem phần lỗi bên dưới session hoặc mở Xem chi tiết.

Kiểm tra theo thứ tự:

1. Internet
2. config.js -> APPS_SCRIPT_URL
3. Mở URL /exec bằng trình duyệt
4. Deployment có phải bản đang dùng không
5. Authorization của Apps Script
6. SPREADSHEET_ID
7. Sheet CSDL
8. Quyền Drive
9. Executions trong Apps Script
Nếu /exec trả:

{"result":"ok","message":"VKU Survey endpoint is alive"}
thì endpoint đang hoạt động.

10. Cập nhật PWA
Sau khi sửa JS/CSS/HTML, tăng CACHE_NAME trong sw.js, ví dụ:

const CACHE_NAME = "vku-field-survey-v3";
Service Worker sẽ xóa cache cũ và cache lại app shell.

Nếu điện thoại vẫn hiện bản cũ:

Đóng PWA.
Mở lại.
Hoặc xóa dữ liệu/cache của site trong trình duyệt rồi mở lại.
11. Kiểm thử
Frontend
thiếu field
online submit
offline submit
reload sau khi lưu
online trở lại tự sync
click sync nhiều lần
retry error
GPS success/denied/timeout
image preview/compression
export JSON
delete local record
responsive mobile
Backend
GET /exec
POST hợp lệ
JSON lỗi
thiếu sessionId
duplicate sessionId
ghi đúng 19 cột
GPS Maps URL
Drive photo
retry không tạo ảnh duplicate
header mismatch không overwrite
quyền Sheets/Drive
12. Lưu ý quan trọng về HTTP status của Apps Script
Apps Script Content Service dùng TextOutput/JSON để trả dữ liệu từ doGet/doPost. Phần client vì vậy không nên chỉ dựa vào HTTP 200 để xác định thành công; frontend trong project này bắt buộc kiểm tra JSON result và xử lý body không phải JSON.

Đây là lý do backend trả cấu trúc nhất quán:

{"result":"ok", ...}
hoặc:

{"result":"error", "message":"..."}
13. Giới hạn còn tồn tại
Một Web App Apps Script mở rộng cho anonymous users vẫn cần được bảo vệ về quyền truy cập và chống spam ở tầng triển khai.
Browser không cho PWA/Geolocation chạy đúng khi mở bằng file://.
Ảnh lớn làm tăng kích thước IndexedDB và request; frontend đã nén để giảm tải.
Muốn người khảo sát nhìn thấy file Drive, thư mục/file phải có quyền phù hợp; mặc định project không tự public ảnh.
