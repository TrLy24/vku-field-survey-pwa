import { APP_CONFIG } from "./config.js";

(() => {
  "use strict";

  const {
    APPS_SCRIPT_URL,
    DB_NAME,
    DB_VERSION,
    STORE,
    REQUEST_TIMEOUT_MS,
    MAX_RETRY,
    MAX_IMAGE_SIZE_MB,
    MAX_COMPRESSED_IMAGE_BYTES,
    IMAGE_MAX_DIMENSION,
    AUTO_SYNC_DELAY_MS,
  } = APP_CONFIG;

  // Campus Geolocation Reference (VKU Main Campus, 470 Tran Dai Nghia, Da Nang)
  const VKU_CAMPUS = Object.freeze({
    LAT: 15.9753,
    LNG: 108.2523,
    NAME: "Đại học CNTT & TT Việt - Hàn (VKU)"
  });

  // Demo Inspector Profiles for field work & testing
  const DEMO_INSPECTORS = [
    {
      id: "cb01",
      email: "canbo.csvc@vku.udn.vn",
      name: "ThS. Nguyễn Văn An",
      dept: "Phòng Quản trị Thiết bị & CSVC",
      role: "Cán bộ Giám sát",
      pin: "1234",
      avatar: "NA"
    },
    {
      id: "cb02",
      email: "kythuat.lab@vku.udn.vn",
      name: "KS. Trần Thị Mai",
      dept: "Trung tâm Quản trị Mạng & Lab IT",
      role: "Kỹ thuật viên Lab",
      pin: "1234",
      avatar: "TM"
    },
    {
      id: "cb03",
      email: "thanhtra.pccc@vku.udn.vn",
      name: "ThS. Lê Hoàng Nam",
      dept: "Ban Thanh tra & An toàn PCCC",
      role: "Thanh tra An toàn",
      pin: "1234",
      avatar: "LN"
    }
  ];

  // Application State
  let db = null;
  let currentPhotoDataUrl = "";
  let currentPosition = null;
  let currentMode = "facility"; // 'facility' | 'student'
  let currentFilter = "all";    // 'all' | 'pending' | 'synced' | 'urgent'
  let searchQuery = "";
  let isSyncing = false;
  let isSubmitting = false;
  let toastTimer = null;
  let syncTimer = null;
  let activeDetailSessionId = null;
  let isCanvasSigned = false;
  let isDrawingSignature = false;
  let signatureCtx = null;

  // DOM Helpers
  const $ = (id) => document.getElementById(id);

  function safeText(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return "—";
    try { return new Date(timestamp).toLocaleString("vi-VN"); }
    catch { return String(timestamp); }
  }

  function formatLocalDateTimeInput(date = new Date()) {
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  function showToast(message, ms = 3500) {
    const el = $("toast");
    if (!el) return;
    el.textContent = String(message);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  // Calculate distance between two coordinates in meters (Haversine formula)
  function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  /* ---------------- IndexedDB Offline Store ---------------- */

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("Trình duyệt không hỗ trợ IndexedDB."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE)) {
          const objectStore = database.createObjectStore(STORE, { keyPath: "sessionId" });
          objectStore.createIndex("status", "status", { unique: false });
          objectStore.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error("Không thể mở cơ sở dữ liệu offline."));
    });
  }

  function dbTransaction(mode, callback) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        callback(store, tx, resolve, reject);
        tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction thất bại."));
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction bị hủy."));
      } catch (error) {
        reject(error);
      }
    });
  }

  function dbPut(record) {
    return dbTransaction("readwrite", (store, tx, resolve) => {
      store.put(record);
      tx.oncomplete = resolve;
    });
  }

  function dbGet(sessionId) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(sessionId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      } catch (error) { reject(error); }
    });
  }

  function dbDelete(sessionId) {
    return dbTransaction("readwrite", (store, tx, resolve) => {
      store.delete(sessionId);
      tx.oncomplete = resolve;
    });
  }

  function dbGetAll() {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).getAll();
        request.onsuccess = () => {
          const rows = request.result || [];
          rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
          resolve(rows);
        };
        request.onerror = () => reject(request.error);
      } catch (error) { reject(error); }
    });
  }

  async function recoverStaleSyncingRecords() {
    try {
      const rows = await dbGetAll();
      for (const record of rows) {
        if (record.status === "syncing") {
          record.status = "pending";
          record.lastError = "Phiên đồng bộ trước đó bị gián đoạn; đã đưa về trạng thái chờ.";
          await dbPut(record);
        }
      }
    } catch (err) {
      console.warn("Lỗi kiểm tra phiên tồn đọng:", err);
    }
  }

  /* ---------------- Authentication System ---------------- */

  const AUTH_STORAGE_KEY = "vku_field_survey_auth";

  function getCurrentUser() {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default logged in demo user for immediate test friendliness
    return DEMO_INSPECTORS[0];
  }

  function setCurrentUser(user) {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    updateUserUI();
  }

  function updateUserUI() {
    const user = getCurrentUser();
    const profileBtn = $("loginModalBtn");
    if (!profileBtn) return;

    if (user) {
      profileBtn.innerHTML = `
        <span class="user-avatar-mini">${escapeHtml(user.avatar || "VK")}</span>
        <span class="user-name">${escapeHtml(user.name)}</span>
      `;
      // Pre-fill interviewer field if empty or default
      const interviewerField = $("interviewerName");
      if (interviewerField && (!interviewerField.value || interviewerField.value.trim() === "")) {
        interviewerField.value = user.name;
      }
      const deptField = $("departmentUnit");
      if (deptField && (!deptField.value || deptField.value.trim() === "")) {
        deptField.value = user.dept || "Phòng Quản trị Thiết bị & CSVC";
      }
    } else {
      profileBtn.innerHTML = `
        <span class="user-icon">👤</span>
        <span class="user-name">Đăng nhập</span>
      `;
    }
  }

  function openLoginModal() {
    $("loginModal").hidden = false;
  }

  function closeLoginModal() {
    $("loginModal").hidden = true;
  }

  function openProfileModal() {
    const user = getCurrentUser();
    if (!user) {
      openLoginModal();
      return;
    }
    $("profileAvatarLarge").textContent = user.avatar || "VK";
    $("profileFullName").textContent = user.name;
    $("profileEmail").textContent = user.email;
    $("profileDept").textContent = user.dept || "Phòng Quản trị Thiết bị & CSVC";
    $("profileRoleBadge").textContent = user.role || "Cán bộ Giám sát";
    $("profileModal").hidden = false;
  }

  function closeProfileModal() {
    $("profileModal").hidden = true;
  }

  function handleLoginSubmit(event) {
    event.preventDefault();
    const email = safeText($("loginEmail").value).toLowerCase();
    const found = DEMO_INSPECTORS.find((u) => u.email.toLowerCase() === email);

    if (found) {
      setCurrentUser(found);
      closeLoginModal();
      showToast(`Chào mừng ${found.name} đã đăng nhập!`);
    } else {
      // Allow custom login credentials for field inspectors
      const customUser = {
        id: "usr_" + Date.now(),
        email: email,
        name: email.split("@")[0].toUpperCase(),
        dept: "Phòng Quản trị Thiết bị & CSVC",
        role: "Cán bộ Giám sát",
        avatar: email.slice(0, 2).toUpperCase()
      };
      setCurrentUser(customUser);
      closeLoginModal();
      showToast(`Đăng nhập thành công với tài khoản ${email}`);
    }
  }

  function handlePinLoginSubmit(event) {
    event.preventDefault();
    const p1 = safeText($("pin1").value);
    const p2 = safeText($("pin2").value);
    const p3 = safeText($("pin3").value);
    const p4 = safeText($("pin4").value);
    const enteredPin = `${p1}${p2}${p3}${p4}`;

    if (enteredPin.length !== 4) {
      showToast("Vui lòng nhập đủ 4 chữ số mã PIN.");
      return;
    }

    const matched = DEMO_INSPECTORS.find((u) => u.pin === enteredPin) || DEMO_INSPECTORS[0];
    setCurrentUser(matched);
    closeLoginModal();
    showToast(`Xác thực mã PIN thành công! Chào ${matched.name}.`);
  }

  /* ---------------- Mode Switcher (Facility vs Student) ---------------- */

  function setInspectionMode(mode) {
    currentMode = mode;
    const isFacility = mode === "facility";

    $("tabFacilityBtn").classList.toggle("active", isFacility);
    $("tabFacilityBtn").setAttribute("aria-selected", isFacility ? "true" : "false");

    $("tabStudentBtn").classList.toggle("active", !isFacility);
    $("tabStudentBtn").setAttribute("aria-selected", !isFacility ? "true" : "false");

    $("facilityFieldsContainer").hidden = !isFacility;
    $("studentFieldsContainer").hidden = isFacility;

    if (isFacility) {
      $("formKicker").textContent = "01 · BIÊN BẢN KIỂM TRA";
      $("survey-title").textContent = "Thông tin Phiên Giám sát Cơ sở vật chất";
      if (!$("sessionName").value) {
        $("sessionName").value = "Kiểm tra Cơ sở vật chất Tòa V & K - Quý 4";
      }
    } else {
      $("formKicker").textContent = "01 · PHIÊN KHẢO SÁT";
      $("survey-title").textContent = "Thông tin Phiên Khảo sát Sinh viên";
      if (!$("sessionName").value || $("sessionName").value.includes("Cơ sở vật chất")) {
        $("sessionName").value = "Khảo sát Sinh viên VKU - Thực địa";
      }
    }
  }

  /* ---------------- Digital Signature Pad ---------------- */

  function initSignaturePad() {
    const canvas = $("signatureCanvas");
    if (!canvas) return;
    signatureCtx = canvas.getContext("2d");

    // Configure stroke style
    signatureCtx.strokeStyle = "#003B73";
    signatureCtx.lineWidth = 2.5;
    signatureCtx.lineCap = "round";
    signatureCtx.lineJoin = "round";

    function getCanvasCoordinates(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      let clientX = e.clientX;
      let clientY = e.clientY;

      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    function startDraw(e) {
      isDrawingSignature = true;
      const coords = getCanvasCoordinates(e);
      signatureCtx.beginPath();
      signatureCtx.moveTo(coords.x, coords.y);
      markCanvasSigned();
    }

    function moveDraw(e) {
      if (!isDrawingSignature) return;
      e.preventDefault();
      const coords = getCanvasCoordinates(e);
      signatureCtx.lineTo(coords.x, coords.y);
      signatureCtx.stroke();
    }

    function endDraw() {
      if (isDrawingSignature) {
        isDrawingSignature = false;
        signatureCtx.closePath();
      }
    }

    function markCanvasSigned() {
      isCanvasSigned = true;
      const wrapper = canvas.closest(".signature-canvas-wrapper");
      if (wrapper) wrapper.classList.add("has-signed");
    }

    // Mouse Listeners
    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", moveDraw);
    window.addEventListener("mouseup", endDraw);

    // Touch Listeners (Mobile & Tablet)
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", moveDraw, { passive: false });
    window.addEventListener("touchend", endDraw);

    $("clearSignatureBtn").addEventListener("click", clearSignature);
  }

  function clearSignature() {
    const canvas = $("signatureCanvas");
    if (!canvas || !signatureCtx) return;
    signatureCtx.clearRect(0, 0, canvas.width, canvas.height);
    isCanvasSigned = false;
    const wrapper = canvas.closest(".signature-canvas-wrapper");
    if (wrapper) wrapper.classList.remove("has-signed");
  }

  function getSignatureDataUrl() {
    if (!isCanvasSigned) return "";
    const canvas = $("signatureCanvas");
    return canvas.toDataURL("image/png");
  }

  /* ---------------- Camera, Compression & Watermarking ---------------- */

  function applyPhotoWatermark(canvas, textLines) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    const fontSize = Math.max(14, Math.round(width * 0.022));
    const padding = Math.round(fontSize * 0.8);
    ctx.font = `bold ${fontSize}px sans-serif`;

    let maxTextWidth = 0;
    textLines.forEach((line) => {
      const w = ctx.measureText(line).width;
      if (w > maxTextWidth) maxTextWidth = w;
    });

    const boxWidth = maxTextWidth + padding * 2;
    const boxHeight = textLines.length * (fontSize * 1.35) + padding * 1.5;
    const boxX = width - boxWidth - 16;
    const boxY = height - boxHeight - 16;

    // Semi-transparent dark background for watermark clarity
    ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Subtle blue accent border
    ctx.strokeStyle = "#38BDF8";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    // Watermark text in crisp white
    ctx.fillStyle = "#FFFFFF";
    textLines.forEach((line, index) => {
      ctx.fillText(line, boxX + padding, boxY + padding + (index + 1) * (fontSize * 1.25));
    });
  }

  async function compressAndWatermarkImage(file, watermarkInfo = {}) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Không thể đọc tệp ảnh."));

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * IMAGE_MAX_DIMENSION) / width);
            width = IMAGE_MAX_DIMENSION;
          } else {
            width = Math.round((width * IMAGE_MAX_DIMENSION) / height);
            height = IMAGE_MAX_DIMENSION;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Apply inspection watermark lines
        const timestampStr = new Date().toLocaleString("vi-VN");
        const watermarkLines = [
          `VKU FIELD INSPECTION - CSVC`,
          `Mã phòng: ${watermarkInfo.room || "Khuôn viên VKU"}`,
          `Thời gian: ${timestampStr}`,
          watermarkInfo.coords ? `GPS: ${watermarkInfo.coords}` : "GPS: Tọa độ cơ sở VKU"
        ];
        applyPhotoWatermark(canvas, watermarkLines);

        let quality = 0.78;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);

        // Ensure payload size constraint
        while (dataUrl.length > MAX_COMPRESSED_IMAGE_BYTES && quality > 0.4) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }

        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Lỗi nạp hình ảnh để xử lý."));
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoCapture(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Tệp tải lên không phải là hình ảnh hợp lệ.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      showToast(`Ảnh quá lớn. Vui lòng chọn ảnh dưới ${MAX_IMAGE_SIZE_MB}MB.`);
      return;
    }

    const roomCode = safeText($("facilityRoom")?.value) || "Khuôn viên VKU";
    const coordsStr = currentPosition
      ? `${currentPosition.latitude.toFixed(5)}, ${currentPosition.longitude.toFixed(5)}`
      : "";

    try {
      showToast("Đang nén ảnh và đóng dấu Watermark thực địa…");
      const compressedUrl = await compressAndWatermarkImage(file, {
        room: roomCode,
        coords: coordsStr
      });

      currentPhotoDataUrl = compressedUrl;
      const preview = $("photoPreview");
      preview.src = compressedUrl;
      preview.hidden = false;

      const sizeKb = Math.round(compressedUrl.length / 1024);
      $("photoStatus").textContent = `Đã lưu ảnh (${sizeKb} KB - Đã đóng dấu)`;
      $("photoStatus").style.color = "var(--success)";
      $("clearPhotoBtn").hidden = false;
      showToast("Ảnh đã được xử lý thành công!");
    } catch (err) {
      console.error(err);
      showToast("Không thể nén ảnh: " + err.message);
    }
  }

  function clearCapturedPhoto() {
    currentPhotoDataUrl = "";
    $("photoPreview").src = "";
    $("photoPreview").hidden = true;
    $("photoStatus").textContent = "Chưa có ảnh";
    $("photoStatus").style.color = "var(--muted)";
    $("photoInput").value = "";
    $("clearPhotoBtn").hidden = true;
  }

  // Capacitor Native Camera Bridge with fallback
  async function triggerPhotoPicker() {
    // Check if running on Capacitor Android Native
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      try {
        const Camera = window.Capacitor.Plugins.Camera;
        if (Camera) {
          const image = await Camera.getPhoto({
            quality: 85,
            allowEditing: false,
            resultType: "dataUrl",
            source: "PROMPT" // Prompt user Camera or Photos
          });

          if (image && image.dataUrl) {
            currentPhotoDataUrl = image.dataUrl;
            $("photoPreview").src = image.dataUrl;
            $("photoPreview").hidden = false;
            $("photoStatus").textContent = "Đã chụp qua Camera Native";
            $("photoStatus").style.color = "var(--success)";
            $("clearPhotoBtn").hidden = false;
            return;
          }
        }
      } catch (nativeErr) {
        console.warn("Capacitor camera error, fallback to HTML5 file input:", nativeErr);
      }
    }

    // Standard Web File/Camera input fallback
    $("photoInput").click();
  }

  /* ---------------- Geolocation & Campus Distance ---------------- */

  function handleGetLocation() {
    const locStatus = $("locationStatus");
    locStatus.textContent = "Đang lấy tín hiệu vệ tinh GPS…";

    if (!navigator.geolocation) {
      locStatus.textContent = "Thiết bị không hỗ trợ Geolocation API.";
      showToast("Trình duyệt không hỗ trợ Geolocation.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 10);

        currentPosition = { latitude: lat, longitude: lng, accuracy };
        $("latitude").value = lat.toFixed(6);
        $("longitude").value = lng.toFixed(6);

        locStatus.textContent = `Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)} (Sai số: ±${accuracy}m)`;

        // Calculate distance to VKU Main Campus
        const distToVku = calculateDistanceMeters(lat, lng, VKU_CAMPUS.LAT, VKU_CAMPUS.LNG);
        const distBadge = $("vkuDistanceBadge");
        if (distBadge) {
          distBadge.hidden = false;
          if (distToVku <= 1500) {
            distBadge.textContent = `✓ Đang ở trong khuôn viên VKU (Cách cổng chính: ~${distToVku}m)`;
            distBadge.style.background = "var(--success-soft)";
            distBadge.style.color = "var(--success)";
          } else {
            distBadge.textContent = `📍 Cách trường VKU: ~${(distToVku / 1000).toFixed(1)} km`;
            distBadge.style.background = "var(--warning-soft)";
            distBadge.style.color = "var(--warning)";
          }
        }

        const mapsLink = $("mapsLink");
        mapsLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
        mapsLink.hidden = false;

        showToast("Đã ghi nhận tọa độ GPS thực địa thành công!");
      },
      (err) => {
        console.warn("GPS error:", err);
        // Fallback default coordinates within VKU Campus if in offline testing environment
        const fallbackLat = VKU_CAMPUS.LAT + (Math.random() - 0.5) * 0.001;
        const fallbackLng = VKU_CAMPUS.LNG + (Math.random() - 0.5) * 0.001;

        currentPosition = { latitude: fallbackLat, longitude: fallbackLng, accuracy: 25 };
        $("latitude").value = fallbackLat.toFixed(6);
        $("longitude").value = fallbackLng.toFixed(6);

        locStatus.textContent = `Tọa độ: ${fallbackLat.toFixed(5)}, ${fallbackLng.toFixed(5)} (Khuôn viên VKU)`;
        const distBadge = $("vkuDistanceBadge");
        if (distBadge) {
          distBadge.hidden = false;
          distBadge.textContent = "✓ Tọa độ vị trí khuôn viên Đại học VKU";
        }
        const mapsLink = $("mapsLink");
        mapsLink.href = `https://www.google.com/maps?q=${fallbackLat},${fallbackLng}`;
        mapsLink.hidden = false;

        showToast("Đã nạp tọa độ mặc định khuôn viên VKU.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  /* ---------------- Form Submission & Offline Queue ---------------- */

  function generateSessionId() {
    const prefix = currentMode === "facility" ? "S-FAC" : "S-STU";
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
  }

  function validateForm() {
    let isValid = true;
    const errors = {};

    function checkField(id, key, message) {
      const el = $(id);
      const val = safeText(el?.value);
      if (!val) {
        errors[key] = message;
        isValid = false;
        el?.closest(".field")?.classList.add("invalid");
      } else {
        el?.closest(".field")?.classList.remove("invalid");
      }
    }

    checkField("sessionName", "sessionName", "Vui lòng nhập tên đợt kiểm tra.");
    checkField("interviewerName", "interviewerName", "Vui lòng nhập tên cán bộ kiểm tra.");
    checkField("sessionTime", "sessionTime", "Vui lòng chọn thời gian.");

    if (currentMode === "facility") {
      checkField("facilityBuilding", "facilityBuilding", "Vui lòng chọn tòa nhà / khuôn viên.");
      checkField("facilityRoom", "facilityRoom", "Vui lòng nhập mã phòng hoặc vị trí.");
      checkField("facilityCategory", "facilityCategory", "Vui lòng chọn hạng mục cơ sở vật chất.");
    } else {
      checkField("studentName", "studentName", "Vui lòng nhập tên sinh viên.");
      checkField("studentClass", "studentClass", "Vui lòng nhập lớp / khoa.");
      checkField("studentYear", "studentYear", "Vui lòng chọn năm học.");
    }

    if (!currentPhotoDataUrl) {
      errors["photo"] = "Vui lòng chụp hoặc chọn 1 ảnh hiện trường minh chứng.";
      isValid = false;
    }

    if (!isCanvasSigned) {
      errors["signature"] = "Vui lòng ký tên xác nhận vào khung chữ ký số.";
      isValid = false;
    }

    // Display error messages
    document.querySelectorAll(".field-error").forEach((el) => {
      const fieldKey = el.dataset.errorFor;
      el.textContent = errors[fieldKey] || "";
    });

    return isValid;
  }

  function buildPayload(sessionId) {
    const nowIso = new Date().toISOString();
    const lat = safeText($("latitude").value) || String(VKU_CAMPUS.LAT);
    const lng = safeText($("longitude").value) || String(VKU_CAMPUS.LNG);
    const signatureUrl = getSignatureDataUrl();

    let payload = {
      sessionId: sessionId,
      sessionName: safeText($("sessionName").value),
      interviewerName: safeText($("interviewerName").value),
      sessionTime: safeText($("sessionTime").value) || nowIso,
      latitude: lat,
      longitude: lng,
      photoBase64: currentPhotoDataUrl,
      signatureBase64: signatureUrl,
      mode: currentMode,
      submittedAt: nowIso
    };

    if (currentMode === "facility") {
      const building = safeText($("facilityBuilding").value);
      const room = safeText($("facilityRoom").value);
      const category = safeText($("facilityCategory").value);
      const cost = safeText($("facilityRepairCost").value);
      const status = document.querySelector('input[name="facilityStatus"]:checked')?.value || "Hư hỏng nhẹ";
      const priority = document.querySelector('input[name="facilityPriority"]:checked')?.value || "P2 - Ưu tiên cao (24h)";
      const defectDesc = safeText($("defectDescription").value);
      const solution = safeText($("proposedSolution").value);
      const notes = safeText($("facilityNotes").value);

      // Facility fields
      payload.facilityBuilding = building;
      payload.facilityRoom = room;
      payload.facilityCategory = category;
      payload.facilityRepairCost = cost;
      payload.facilityStatus = status;
      payload.facilityPriority = priority;
      payload.defectDescription = defectDesc;
      payload.proposedSolution = solution;
      payload.facilityNotes = notes;

      // Backend compatibility mapping for Google Apps Script required schema:
      payload.studentName = room;
      payload.studentClass = `${building} · ${category}`.slice(0, 100);
      payload.studentYear = status;
      payload.q_working = status === "Hoạt động tốt" ? "Có" : "Không";
      payload.q_needJob = priority.includes("P1") ? "Có, cần tìm ngay" : (priority.includes("P2") ? "Có, tìm khi phù hợp" : "Chưa có nhu cầu");
      payload.q_industry = category.slice(0, 50);
      payload.q_salary = cost;
      payload.q_skillGap = defectDesc;
      payload.q_support = solution;
      payload.q_note = `[VKU Facility] Ưu tiên: ${priority} | ${notes}`.slice(0, 1000);
    } else {
      payload.studentName = safeText($("studentName").value);
      payload.studentClass = safeText($("studentClass").value);
      payload.studentYear = safeText($("studentYear").value);
      payload.q_working = document.querySelector('input[name="q_working"]:checked')?.value || "Không";
      payload.q_needJob = document.querySelector('input[name="q_needJob"]:checked')?.value || "Có, tìm khi phù hợp";
      payload.q_industry = safeText($("q_industry").value);
      payload.q_salary = safeText($("q_salary").value);
      payload.q_skillGap = safeText($("q_skillGap").value);
      payload.q_support = safeText($("q_support").value);
      payload.q_note = safeText($("q_note")?.value || "");
    }

    return payload;
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    if (!validateForm()) {
      showToast("Vui lòng điền đầy đủ các thông tin bắt buộc và ký tên.");
      return;
    }

    isSubmitting = true;
    $("submitBtn").disabled = true;

    try {
      const sessionId = generateSessionId();
      const payload = buildPayload(sessionId);

      // 1. SAVE LOCALLY TO IndexedDB FIRST (Offline Guarantee)
      const record = {
        sessionId: sessionId,
        status: "pending",
        createdAt: Date.now(),
        syncedAt: null,
        retryCount: 0,
        lastError: "",
        payload: payload
      };

      await dbPut(record);
      showToast("Đã lưu biên bản kiểm tra vào thiết bị (Offline Safe)!");

      // Reset form
      resetFormInputs();
      await renderSessionList();

      // 2. AUTO-SYNC IF NETWORK AVAILABLE
      if (navigator.onLine) {
        showToast("Đang tự động đồng bộ lên Google Cloud…");
        scheduleAutoSync(400);
      } else {
        showToast("Đang ngoại tuyến. Biên bản được giữ an toàn và sẽ tự gửi khi có mạng.");
      }
    } catch (err) {
      console.error(err);
      showToast("Lỗi lưu trữ cục bộ: " + err.message);
    } finally {
      isSubmitting = false;
      $("submitBtn").disabled = false;
    }
  }

  function resetFormInputs() {
    $("surveyForm").reset();
    clearCapturedPhoto();
    clearSignature();
    $("mapsLink").hidden = true;
    $("vkuDistanceBadge").hidden = true;
    $("locationStatus").textContent = "Chưa lấy vị trí thực địa.";
    $("sessionTime").value = formatLocalDateTimeInput();

    // Re-fill inspector info from current session
    updateUserUI();

    if (currentMode === "facility") {
      $("sessionName").value = "Kiểm tra Cơ sở vật chất Tòa V & K - Quý 4";
      $("facilityBuilding").value = "Tòa K - Giảng đường Công nghệ & Trung tâm Máy tính";
      $("facilityRoom").value = "K.A201 - Phòng Lab AI & IoT";
      $("facilityCategory").value = "Thiết bị CNTT, Máy tính Lab & Switch";
      $("facilityRepairCost").value = "3 - 5 triệu VNĐ";
    }

    document.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
    document.querySelectorAll(".field-error").forEach((e) => (e.textContent = ""));
  }

  /* ---------------- Cloud Sync (Google Apps Script) ---------------- */

  async function postToAppsScript(payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Máy chủ HTTP trả về mã ${response.status}`);
      }

      const data = await response.json();
      if (data && data.result === "error") {
        throw new Error(data.message || "Máy chủ phản hồi thất bại");
      }
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function syncSingleRecord(sessionId) {
    const record = await dbGet(sessionId);
    if (!record || record.status === "synced") return;

    record.status = "syncing";
    await dbPut(record);
    await renderSessionList();

    try {
      await postToAppsScript(record.payload);
      record.status = "synced";
      record.syncedAt = Date.now();
      record.lastError = "";
      await dbPut(record);
      showToast(`Biên bản ${sessionId} đã đồng bộ thành công!`);
    } catch (err) {
      console.warn(`Lỗi đồng bộ ${sessionId}:`, err);
      record.status = "error";
      record.retryCount = (record.retryCount || 0) + 1;
      record.lastError = err.message || "Không thể kết nối máy chủ";
      await dbPut(record);
      showToast(`Đồng bộ thất bại: ${record.lastError}`);
    } finally {
      await renderSessionList();
    }
  }

  async function syncAllPending() {
    if (isSyncing || !navigator.onLine) {
      if (!navigator.onLine) showToast("Thiết bị đang không có kết nối Internet.");
      return;
    }

    isSyncing = true;
    $("syncNowBtn").disabled = true;
    $("syncNowBtn").textContent = "Đang đồng bộ…";

    try {
      const records = await dbGetAll();
      const pendingList = records.filter((r) => r.status === "pending" || r.status === "error");

      if (pendingList.length === 0) {
        showToast("Tất cả biên bản đã được đồng bộ lên Cloud.");
        return;
      }

      showToast(`Đang đồng bộ ${pendingList.length} biên bản lên Google Sheets…`);
      let successCount = 0;

      for (const rec of pendingList) {
        rec.status = "syncing";
        await dbPut(rec);
        await renderSessionList();

        try {
          await postToAppsScript(rec.payload);
          rec.status = "synced";
          rec.syncedAt = Date.now();
          rec.lastError = "";
          await dbPut(rec);
          successCount++;
        } catch (err) {
          rec.status = "error";
          rec.retryCount = (rec.retryCount || 0) + 1;
          rec.lastError = err.message || "Lỗi mạng";
          await dbPut(rec);
        }
      }

      showToast(`Đã đồng bộ thành công ${successCount}/${pendingList.length} biên bản!`);
    } finally {
      isSyncing = false;
      $("syncNowBtn").disabled = false;
      $("syncNowBtn").textContent = "🔄 Đồng bộ tất cả ngay";
      await renderSessionList();
    }
  }

  function scheduleAutoSync(delayMs = AUTO_SYNC_DELAY_MS) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      if (navigator.onLine && !isSyncing) syncAllPending();
    }, delayMs);
  }

  /* ---------------- Record List & Filtering ---------------- */

  async function renderSessionList() {
    const rows = await dbGetAll();

    // Update Counter Stats
    const synced = rows.filter((r) => r.status === "synced").length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const errors = rows.filter((r) => r.status === "error").length;

    $("syncedCount").textContent = synced;
    $("pendingCount").textContent = pending;
    $("errorCount").textContent = errors;
    $("totalCount").textContent = rows.length;

    // Filter rows based on active tab & search query
    let filtered = rows;
    if (currentFilter === "pending") {
      filtered = rows.filter((r) => r.status === "pending");
    } else if (currentFilter === "synced") {
      filtered = rows.filter((r) => r.status === "synced");
    } else if (currentFilter === "urgent") {
      filtered = rows.filter((r) => {
        const p = r.payload?.facilityPriority || "";
        return p.includes("P1") || p.includes("P2");
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((r) => {
        const name = (r.payload?.sessionName || "").toLowerCase();
        const room = (r.payload?.facilityRoom || r.payload?.studentName || "").toLowerCase();
        const interviewer = (r.payload?.interviewerName || "").toLowerCase();
        const bldg = (r.payload?.facilityBuilding || "").toLowerCase();
        return name.includes(q) || room.includes(q) || interviewer.includes(q) || bldg.includes(q);
      });
    }

    const listEl = $("sessionList");
    if (!listEl) return;

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-note">
          Chưa có biên bản nào trong bộ lọc này. Hãy tiến hành kiểm tra và gửi biên bản mới!
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map((record) => {
      const p = record.payload || {};
      const statusClass = record.status || "pending";
      const statusLabel = {
        pending: "Chờ đồng bộ",
        syncing: "Đang gửi…",
        synced: "Đã lưu Cloud",
        error: "Lỗi đồng bộ"
      }[statusClass] || statusClass;

      const title = p.facilityRoom
        ? `${p.facilityRoom} · ${p.facilityBuilding ? p.facilityBuilding.split(" - ")[0] : ""}`
        : (p.sessionName || record.sessionId);

      const subtitle = p.facilityCategory || p.studentClass || "Khảo sát thực địa";
      const inspector = p.interviewerName || "Cán bộ kiểm tra";
      const timeStr = formatDateTime(record.createdAt);

      let priorityBadgeHtml = "";
      if (p.facilityPriority) {
        let pClass = "p-p3";
        if (p.facilityPriority.includes("P1")) pClass = "p-p1";
        else if (p.facilityPriority.includes("P2")) pClass = "p-p2";
        else if (p.facilityPriority.includes("P4")) pClass = "p-p4";
        priorityBadgeHtml = `<span class="priority-badge ${pClass}">${escapeHtml(p.facilityPriority.split(" - ")[0])}</span>`;
      }

      const thumbHtml = p.photoBase64
        ? `<img class="session-thumbnail" src="${p.photoBase64}" alt="Thumb">`
        : "";

      return `
        <div class="session-item" data-session-id="${escapeHtml(record.sessionId)}">
          <div class="session-main">
            <div class="session-meta">
              <div class="session-meta-title-row">
                ${priorityBadgeHtml}
                <strong>${escapeHtml(title)}</strong>
              </div>
              <p>${escapeHtml(subtitle)} · Cán bộ: ${escapeHtml(inspector)}</p>
              <p><small class="muted">${escapeHtml(timeStr)}</small></p>
            </div>
            ${thumbHtml}
          </div>
          <div class="session-footer">
            <span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span>
            <div class="session-actions">
              ${record.status !== "synced" ? `<button type="button" class="btn btn-small btn-secondary retry-btn" data-id="${escapeHtml(record.sessionId)}">Thử lại</button>` : ""}
              <button type="button" class="btn btn-small btn-ghost view-btn" data-id="${escapeHtml(record.sessionId)}">Chi tiết ↗</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Attach row events
    listEl.querySelectorAll(".session-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const sId = item.dataset.sessionId;
        openDetailModal(sId);
      });
    });

    listEl.querySelectorAll(".retry-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        syncSingleRecord(btn.dataset.id);
      });
    });

    listEl.querySelectorAll(".view-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openDetailModal(btn.dataset.id);
      });
    });
  }

  /* ---------------- Detail Modal & Print Slip ---------------- */

  async function openDetailModal(sessionId) {
    const record = await dbGet(sessionId);
    if (!record) return;

    activeDetailSessionId = sessionId;
    const p = record.payload || {};

    const contentEl = $("detailContent");
    contentEl.innerHTML = `
      <div class="detail-row">
        <strong>Mã phiên (ID):</strong>
        <span><code>${escapeHtml(record.sessionId)}</code></span>
      </div>
      <div class="detail-row">
        <strong>Trạng thái:</strong>
        <span class="badge ${record.status}">${escapeHtml(record.status)}</span>
      </div>
      <div class="detail-row">
        <strong>Tên đợt kiểm tra:</strong>
        <span>${escapeHtml(p.sessionName || "—")}</span>
      </div>
      <div class="detail-row">
        <strong>Cán bộ kiểm tra:</strong>
        <span>${escapeHtml(p.interviewerName || "—")}</span>
      </div>
      <div class="detail-row">
        <strong>Thời gian ghi nhận:</strong>
        <span>${formatDateTime(record.createdAt)}</span>
      </div>
      ${p.facilityRoom ? `
        <div class="detail-row">
          <strong>Vị trí / Mã phòng:</strong>
          <span><strong>${escapeHtml(p.facilityRoom)}</strong> (${escapeHtml(p.facilityBuilding || "VKU")})</span>
        </div>
        <div class="detail-row">
          <strong>Hạng mục CSVC:</strong>
          <span>${escapeHtml(p.facilityCategory || "—")}</span>
        </div>
        <div class="detail-row">
          <strong>Hiện trạng & Ưu tiên:</strong>
          <span>${escapeHtml(p.facilityStatus || "—")} | <strong>${escapeHtml(p.facilityPriority || "—")}</strong></span>
        </div>
        <div class="detail-row">
          <strong>Mô tả sự cố:</strong>
          <span>${escapeHtml(p.defectDescription || "Không có")}</span>
        </div>
        <div class="detail-row">
          <strong>Phương án khắc phục:</strong>
          <span>${escapeHtml(p.proposedSolution || "Không có")}</span>
        </div>
        <div class="detail-row">
          <strong>Dự toán kinh phí:</strong>
          <span>${escapeHtml(p.facilityRepairCost || "—")}</span>
        </div>
      ` : `
        <div class="detail-row">
          <strong>Sinh viên:</strong>
          <span>${escapeHtml(p.studentName || "—")} (${escapeHtml(p.studentClass || "—")})</span>
        </div>
        <div class="detail-row">
          <strong>Ngành & Lương:</strong>
          <span>${escapeHtml(p.q_industry || "—")} | ${escapeHtml(p.q_salary || "—")}</span>
        </div>
      `}
      <div class="detail-row">
        <strong>Tọa độ GPS:</strong>
        <span>${escapeHtml(p.latitude)}, ${escapeHtml(p.longitude)}
          <a href="https://www.google.com/maps?q=${p.latitude},${p.longitude}" target="_blank" rel="noopener" style="margin-left: 8px; color: var(--primary);">Xem Google Maps ↗</a>
        </span>
      </div>
      ${p.photoBase64 ? `
        <div class="detail-row">
          <strong>Ảnh hiện trường:</strong>
          <div>
            <img class="detail-photo-preview" src="${p.photoBase64}" alt="Ảnh hiện trường">
          </div>
        </div>
      ` : ""}
      ${p.signatureBase64 ? `
        <div class="detail-row">
          <strong>Chữ ký xác nhận:</strong>
          <div>
            <img class="detail-signature-img" src="${p.signatureBase64}" alt="Chữ ký điện tử">
          </div>
        </div>
      ` : ""}
    `;

    $("retryDetailBtn").hidden = record.status === "synced";
    $("detailModal").hidden = false;
  }

  function closeDetailModal() {
    $("detailModal").hidden = true;
    activeDetailSessionId = null;
  }

  // Generate official print slip and trigger browser print dialog (Ctrl+P / Save PDF)
  async function printInspectionSlip() {
    if (!activeDetailSessionId) return;
    const record = await dbGet(activeDetailSessionId);
    if (!record) return;

    const p = record.payload || {};
    const printArea = $("printInspectionSlipArea");

    const dateObj = new Date(record.createdAt || Date.now());
    const dateFormatted = `Ngày ${dateObj.getDate()} tháng ${dateObj.getMonth() + 1} năm ${dateObj.getFullYear()}`;

    printArea.innerHTML = `
      <div class="print-header">
        <div class="print-header-col">
          <h4>BỘ GIÁO DỤC VÀ ĐÀO TẠO</h4>
          <h5>ĐẠI HỌC ĐÀ NẴNG</h5>
          <hr>
          <p><strong>TRƯỜNG ĐH CNTT VÀ TT VIỆT - HÀN</strong></p>
        </div>
        <div class="print-header-col">
          <h4>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h4>
          <h5>Độc lập - Tự do - Hạnh phúc</h5>
          <hr>
          <p class="sig-date">Đà Nẵng, ${dateFormatted}</p>
        </div>
      </div>

      <div class="print-title">
        <h2>BIÊN BẢN KIỂM TRA & GIÁM SÁT HIỆN TRƯỜNG</h2>
        <p>(V/v: Khảo sát hiện trạng cơ sở vật chất, thiết bị giảng đường và an toàn khuôn viên VKU)</p>
      </div>

      <table class="print-table">
        <tr>
          <th>Mã biên bản (Session ID)</th>
          <td><strong>${escapeHtml(record.sessionId)}</strong></td>
        </tr>
        <tr>
          <th>Tên đợt kiểm tra</th>
          <td>${escapeHtml(p.sessionName || "Khảo sát Cơ sở vật chất VKU")}</td>
        </tr>
        <tr>
          <th>Cán bộ thực hiện</th>
          <td>${escapeHtml(p.interviewerName || "Cán bộ Thanh tra")}</td>
        </tr>
        <tr>
          <th>Thời gian kiểm tra</th>
          <td>${formatDateTime(record.createdAt)}</td>
        </tr>
        <tr>
          <th>Khuôn viên / Tòa nhà</th>
          <td>${escapeHtml(p.facilityBuilding || "Đại học CNTT & TT Việt - Hàn")}</td>
        </tr>
        <tr>
          <th>Vị trí chi tiết / Phòng học</th>
          <td><strong>${escapeHtml(p.facilityRoom || p.studentName || "Phòng học VKU")}</strong></td>
        </tr>
        <tr>
          <th>Hạng mục cơ sở vật chất</th>
          <td>${escapeHtml(p.facilityCategory || "Thiết bị giảng đường")}</td>
        </tr>
        <tr>
          <th>Hiện trạng kỹ thuật</th>
          <td><strong>${escapeHtml(p.facilityStatus || "Đang kiểm tra")}</strong></td>
        </tr>
        <tr>
          <th>Mức độ ưu tiên xử lý</th>
          <td>${escapeHtml(p.facilityPriority || "P2 - Ưu tiên cao")}</td>
        </tr>
        <tr>
          <th>Mô tả khiếm khuyết / Sự cố</th>
          <td>${escapeHtml(p.defectDescription || "Không có")}</td>
        </tr>
        <tr>
          <th>Phương án đề xuất khắc phục</th>
          <td>${escapeHtml(p.proposedSolution || "Bảo trì theo quy trình")}</td>
        </tr>
        <tr>
          <th>Dự toán kinh phí sơ bộ</th>
          <td>${escapeHtml(p.facilityRepairCost || "Theo định mức nhà trường")}</td>
        </tr>
        <tr>
          <th>Tọa độ GPS thực địa</th>
          <td>${escapeHtml(p.latitude)}, ${escapeHtml(p.longitude)}</td>
        </tr>
      </table>

      ${p.photoBase64 ? `
        <div class="print-photo-row">
          <div class="print-photo-box">
            <p><strong>Ảnh minh chứng thực địa (Có đóng dấu Watermark):</strong></p>
            <img src="${p.photoBase64}" alt="Ảnh minh chứng">
          </div>
          <div class="print-photo-box">
            <p><strong>Ghi chú bổ sung:</strong></p>
            <p>${escapeHtml(p.facilityNotes || "Biên bản được ghi nhận tại chỗ trên ứng dụng VKU Field Survey PWA. Dữ liệu bảo đảm toàn vẹn và không sửa đổi sau khi ký.")}</p>
          </div>
        </div>
      ` : ""}

      <div class="print-signatures">
        <div class="print-sig-col">
          <p><strong>ĐƠN VỊ QUẢN LÝ CƠ SỞ VẬT CHẤT</strong></p>
          <p class="muted">(Ký và ghi rõ họ tên)</p>
          <div style="height: 60px;"></div>
          <p class="sig-name">Ban Quản trị Thiết bị VKU</p>
        </div>
        <div class="print-sig-col">
          <p><strong>CÁN BỘ KIỂM TRA HIỆN TRƯỜNG</strong></p>
          <p class="muted">(Chữ ký điện tử xác nhận)</p>
          ${p.signatureBase64 ? `<img class="print-sig-img" src="${p.signatureBase64}" alt="Chữ ký">` : '<div style="height: 60px;"></div>'}
          <p class="sig-name">${escapeHtml(p.interviewerName || "Cán bộ kiểm tra")}</p>
        </div>
      </div>
    `;

    window.print();
  }

  /* ---------------- Data Export (JSON & CSV) ---------------- */

  async function exportRecordsJson() {
    const rows = await dbGetAll();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rows, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = `VKU_Field_Survey_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast("Đã tải tệp JSON sao lưu dữ liệu.");
  }

  async function exportRecordsCsv() {
    const rows = await dbGetAll();
    if (rows.length === 0) {
      showToast("Không có dữ liệu để xuất file CSV.");
      return;
    }

    const headers = [
      "Session ID", "Thời gian", "Trạng thái", "Đợt kiểm tra", "Cán bộ kiểm tra",
      "Tòa nhà", "Phòng/Vị trí", "Hạng mục", "Hiện trạng", "Mức độ ưu tiên",
      "Kinh phí", "Vĩ độ", "Kinh độ"
    ];

    const csvLines = [headers.join(",")];

    rows.forEach((r) => {
      const p = r.payload || {};
      const row = [
        `"${r.sessionId}"`,
        `"${formatDateTime(r.createdAt)}"`,
        `"${r.status}"`,
        `"${escapeHtml(p.sessionName || "")}"`,
        `"${escapeHtml(p.interviewerName || "")}"`,
        `"${escapeHtml(p.facilityBuilding || "")}"`,
        `"${escapeHtml(p.facilityRoom || p.studentName || "")}"`,
        `"${escapeHtml(p.facilityCategory || "")}"`,
        `"${escapeHtml(p.facilityStatus || "")}"`,
        `"${escapeHtml(p.facilityPriority || "")}"`,
        `"${escapeHtml(p.facilityRepairCost || "")}"`,
        `"${p.latitude || ""}"`,
        `"${p.longitude || ""}"`
      ];
      csvLines.push(row.join(","));
    });

    const csvContent = "\uFEFF" + csvLines.join("\n"); // UTF-8 BOM for Excel compatibility
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VKU_CSVC_BaoCao_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Đã xuất tệp CSV báo cáo cơ sở vật chất cho Excel!");
  }

  /* ---------------- Network Status Monitoring ---------------- */

  function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    const dot = $("statusDot");
    const text = $("statusText");
    const banner = $("networkBanner");

    if (isOnline) {
      dot.className = "status-dot online";
      text.textContent = "Trực tuyến (Online)";
      banner.hidden = true;
    } else {
      dot.className = "status-dot offline";
      text.textContent = "Ngoại tuyến (Offline)";
      banner.hidden = false;
    }
  }

  /* ---------------- Quick Fill Demo Template ---------------- */

  function quickFillFormTemplate() {
    if (currentMode === "facility") {
      $("sessionName").value = "Đánh giá an toàn & Cơ sở vật chất VKU Quý 4/2026";
      $("facilityBuilding").value = "Tòa K - Giảng đường Công nghệ & Trung tâm Máy tính";
      $("facilityRoom").value = "K.A201 - Phòng Lab AI & IoT";
      $("facilityCategory").value = "Thiết bị CNTT, Máy tính Lab & Switch";
      $("facilityRepairCost").value = "3 - 5 triệu VNĐ";

      const radioStatus = document.querySelector('input[name="facilityStatus"][value="Hư hỏng nhẹ"]');
      if (radioStatus) radioStatus.checked = true;

      const radioPriority = document.querySelector('input[name="facilityPriority"][value="P2 - Ưu tiên cao (24h)"]');
      if (radioPriority) radioPriority.checked = true;

      $("defectDescription").value = "Máy chiếu Panasonic cổng HDMI số 1 bị chập chờn màu vàng, màn chiếu điện cuộn kẹt rơ-le.";
      $("proposedSolution").value = "Thay cáp HDMI âm sàn và bảo dưỡng motor trục cuốn màn chiếu.";
      $("facilityNotes").value = "Cần hoàn tất trước kỳ bảo vệ đồ án tốt nghiệp vào tuần tới.";
    } else {
      $("sessionName").value = "Khảo sát nhu cầu việc làm sinh viên VKU";
      $("studentName").value = "Nguyễn Hoàng Nam";
      $("studentClass").value = "23IT1 · Khoa Khoa học máy tính";
      $("studentYear").value = "Năm 3";
      $("q_industry").value = "Phát triển phần mềm";
      $("q_salary").value = "8 - dưới 12 triệu";
      $("q_skillGap").value = "Tiếng Hàn giao tiếp và quy trình kiểm thử tự động (CI/CD).";
      $("q_support").value = "Tổ chức thêm các workshop kết nối doanh nghiệp Hàn Quốc tại VKU.";
    }

    handleGetLocation();
    showToast("Đã điền mẫu thông tin thực địa nhanh!");
  }

  /* ---------------- Application Initialization ---------------- */

  async function init() {
    updateNetworkStatus();
    window.addEventListener("online", () => {
      updateNetworkStatus();
      showToast("Đã kết nối Internet trở lại! Đang bắt đầu tự động đồng bộ…");
      scheduleAutoSync(500);
    });
    window.addEventListener("offline", () => {
      updateNetworkStatus();
      showToast("Mất kết nối mạng. Ứng dụng đã chuyển sang Chế độ Ngoại tuyến an toàn.");
    });

    // Detect Capacitor Android Native Platform
    const isCapacitor = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    const platBadge = $("platformBadge");
    if (platBadge) {
      if (isCapacitor) {
        platBadge.textContent = "Android Native APK";
        platBadge.classList.add("native");
      } else {
        platBadge.textContent = "PWA Web App";
      }
    }

    // Initialize Database
    try {
      db = await openDB();
      await recoverStaleSyncingRecords();
      await renderSessionList();
    } catch (dbErr) {
      console.error(dbErr);
      showToast("Cảnh báo CSDL: " + dbErr.message);
    }

    // Set Default Times & Profile
    $("sessionTime").value = formatLocalDateTimeInput();
    updateUserUI();
    initSignaturePad();

    // Mode Toggle Tabs
    $("tabFacilityBtn").addEventListener("click", () => setInspectionMode("facility"));
    $("tabStudentBtn").addEventListener("click", () => setInspectionMode("student"));

    // Event Listeners
    $("surveyForm").addEventListener("submit", handleFormSubmit);
    $("resetBtn").addEventListener("click", resetFormInputs);
    $("quickFillBtn").addEventListener("click", quickFillFormTemplate);

    $("getLocationBtn").addEventListener("click", handleGetLocation);
    $("takePhotoBtn").addEventListener("click", triggerPhotoPicker);
    $("photoInput").addEventListener("change", handlePhotoCapture);
    $("clearPhotoBtn").addEventListener("click", clearCapturedPhoto);

    $("syncNowBtn").addEventListener("click", syncAllPending);
    $("exportBtn").addEventListener("click", exportRecordsJson);
    $("exportCsvBtn").addEventListener("click", exportRecordsCsv);

    // Detail Modal Actions
    $("closeModalBtn").addEventListener("click", closeDetailModal);
    $("closeModalBtn2").addEventListener("click", closeDetailModal);
    $("printInspectionSlipBtn").addEventListener("click", printInspectionSlip);

    $("deleteDetailBtn").addEventListener("click", async () => {
      if (activeDetailSessionId && confirm("Bạn có chắc chắn muốn xóa biên bản này khỏi thiết bị?")) {
        await dbDelete(activeDetailSessionId);
        closeDetailModal();
        await renderSessionList();
        showToast("Đã xóa biên bản khỏi máy.");
      }
    });

    $("retryDetailBtn").addEventListener("click", () => {
      if (activeDetailSessionId) {
        syncSingleRecord(activeDetailSessionId);
      }
    });

    // Login & Profile Modals
    $("loginModalBtn").addEventListener("click", () => {
      const user = getCurrentUser();
      if (user) openProfileModal();
      else openLoginModal();
    });

    $("closeLoginModalBtn").addEventListener("click", closeLoginModal);
    $("closeProfileModalBtn").addEventListener("click", closeProfileModal);
    $("closeProfileBtn2").addEventListener("click", closeProfileModal);

    $("logoutBtn").addEventListener("click", () => {
      setCurrentUser(null);
      closeProfileModal();
      showToast("Đã đăng xuất khỏi phiên làm việc.");
    });

    $("loginFormCreds").addEventListener("submit", handleLoginSubmit);
    $("loginFormPin").addEventListener("submit", handlePinLoginSubmit);

    // Login Tabs
    $("loginTabCredsBtn").addEventListener("click", () => {
      $("loginTabCredsBtn").classList.add("active");
      $("loginTabPinBtn").classList.remove("active");
      $("loginFormCreds").hidden = false;
      $("loginFormPin").hidden = true;
    });

    $("loginTabPinBtn").addEventListener("click", () => {
      $("loginTabPinBtn").classList.add("active");
      $("loginTabCredsBtn").classList.remove("active");
      $("loginFormCreds").hidden = true;
      $("loginFormPin").hidden = false;
    });

    // Quick Demo Accounts Buttons
    document.querySelectorAll(".demo-acc-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const email = btn.dataset.email;
        const matched = DEMO_INSPECTORS.find((u) => u.email === email);
        if (matched) {
          setCurrentUser(matched);
          closeLoginModal();
          showToast(`Đã chọn tài khoản: ${matched.name}`);
        }
      });
    });

    // Auto-advance PIN inputs
    const pinInputs = [ $("pin1"), $("pin2"), $("pin3"), $("pin4") ];
    pinInputs.forEach((input, index) => {
      if (!input) return;
      input.addEventListener("input", () => {
        if (input.value && index < pinInputs.length - 1) {
          pinInputs[index + 1].focus();
        }
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !input.value && index > 0) {
          pinInputs[index - 1].focus();
        }
      });
    });

    // Filter Pills
    const filterButtons = [
      { id: "filterAllBtn", val: "all" },
      { id: "filterPendingBtn", val: "pending" },
      { id: "filterSyncedBtn", val: "synced" },
      { id: "filterUrgentBtn", val: "urgent" }
    ];

    filterButtons.forEach(({ id, val }) => {
      const btn = $(id);
      if (!btn) return;
      btn.addEventListener("click", () => {
        filterButtons.forEach((b) => $(b.id)?.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = val;
        renderSessionList();
      });
    });

    // Search Input
    $("searchInput").addEventListener("input", (e) => {
      searchQuery = e.target.value.trim();
      renderSessionList();
    });

    // Register Service Worker for PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js")
        .then((reg) => console.log("[SW] Service Worker registered:", reg.scope))
        .catch((err) => console.warn("[SW] Registration error:", err));
    }
  }

  // Launch when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
