const CONFIG = Object.freeze({
  // ─── Apps Script Web App URL ──────────────────────────────────────────────
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxNrowQBMcPizJ6H_G0ORseDFfaBeyT4GLoSMZ0lx0cL_MG2C50XV5td42fphXNW1bp/exec",
  // ─── Ảnh ──────────────────────────────────────────────────────────────────
  MAX_PHOTO_SIZE_MB: 1.5,          // Giới hạn ảnh sau khi nén (MB)
  PHOTO_INITIAL_QUALITY: 0.85,     // Chất lượng JPEG ban đầu (0–1)
  PHOTO_MIN_QUALITY: 0.15,         // Chất lượng tối thiểu khi nén
  PHOTO_MAX_WIDTH: 1280,           // Chiều rộng tối đa ảnh (px)
  // ─── Đồng bộ ──────────────────────────────────────────────────────────────
  MAX_RETRIES: 3,                  // Số lần thử lại tối đa
  SYNC_TIMEOUT_MS: 30_000,         // Timeout 1 request (ms)
  SYNC_RETRY_DELAY_MS: 2_000,      // Delay giữa các lần retry (ms)
  AUTO_SYNC_ON_ONLINE: true,       // Tự động sync khi có mạng
  // ─── PWA Cache ────────────────────────────────────────────────────────────
  CACHE_NAME: "vku-survey-v1",
  // ─── IndexedDB ────────────────────────────────────────────────────────────
  DB_NAME: "vku_survey_db",
  DB_VERSION: 1,
  DB_STORE: "sessions",
});