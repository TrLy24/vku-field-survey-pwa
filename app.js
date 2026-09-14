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

  let db = null;
  let currentPhotoDataUrl = "";
  let currentPosition = null;
  let isSyncing = false;
  let isSubmitting = false;
  let toastTimer = null;
  let syncTimer = null;
  let activeDetailSessionId = null;

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
    el.textContent = String(message);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  function translateError(error, context = "") {
    const raw = safeText(error?.message || error);
    const lower = raw.toLowerCase();
    if (!navigator.onLine || lower.includes("failed to fetch") || lower.includes("networkerror")) {
      return "Không có kết nối tới máy chủ. Kiểm tra Internet rồi thử đồng bộ lại.";
    }
    if (lower.includes("apps script url") || lower.includes("url")) {
      return "URL Google Apps Script chưa được cấu hình đúng.";
    }
    if (lower.includes("timeout")) return "Máy chủ phản hồi quá lâu. Hãy thử lại sau.";
    if (lower.includes("server trả về dữ liệu không hợp lệ") || lower.includes("invalid response")) {
      return "Web App đã trả về dữ liệu không hợp lệ. Kiểm tra deployment của Apps Script.";
    }
    if (lower.includes("permission") || lower.includes("quyền")) {
      return "Web App chưa có quyền ghi Google Sheets hoặc Google Drive.";
    }
    if (lower.includes("sheet") || lower.includes("spreadsheet")) {
      return "Không thể ghi Google Sheets. Kiểm tra Spreadsheet ID và sheet CSDL.";
    }
    if (lower.includes("drive")) return "Không thể lưu ảnh Google Drive. Kiểm tra quyền thư mục Drive.";
    if (lower.includes("http 4") || lower.includes("http 5")) {
      return `Máy chủ trả về ${raw}. Kiểm tra deployment Web App và quyền truy cập.`;
    }
    return context ? `${context}: ${raw || "Lỗi không xác định"}` : (raw || "Đồng bộ thất bại.");
  }

  /* ---------------- IndexedDB ---------------- */

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
    const rows = await dbGetAll();
    for (const record of rows) {
      if (record.status === "syncing") {
        record.status = "pending";
        record.lastError = "Phiên đồng bộ trước đó bị gián đoạn; đã đưa về trạng thái chờ.";
        await dbPut(record);
      }
    }
  }

  /* ---------------- Draft persistence ---------------- */

  const DRAFT_KEY = `${DB_NAME}:draft:v1`;

  function collectDraft() {
    const form = $("surveyForm");
    const formData = new FormData(form);
    const draft = {};
    for (const [key, value] of formData.entries()) {
      if (key !== "photoInput") draft[key] = String(value);
    }
    draft.latitude = $("latitude").value;
    draft.longitude = $("longitude").value;
    draft.photoBase64 = currentPhotoDataUrl || "";
    return draft;
  }

  let draftTimer = null;
  function saveDraftSoon() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft())); }
      catch { /* Ignore draft persistence errors; submitted records remain in IndexedDB. */ }
    }, 250);
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      const draft = JSON.parse(raw);
      for (const [key, value] of Object.entries(draft)) {
        const element = $(key);
        if (element && element.type !== "radio") element.value = value;
      }
      for (const radio of document.querySelectorAll('input[type="radio"]')) {
        if (radio.value === draft[radio.name]) radio.checked = true;
      }
      if (draft.photoBase64 && /^data:image\//i.test(draft.photoBase64)) {
        currentPhotoDataUrl = draft.photoBase64;
        $("photoPreview").src = currentPhotoDataUrl;
        $("photoPreview").hidden = false;
        $("photoStatus").textContent = "Đã khôi phục ảnh từ bản nháp.";
      }
      if (draft.latitude && draft.longitude) {
        currentPosition = { latitude: Number(draft.latitude), longitude: Number(draft.longitude) };
        updateLocationUI(currentPosition.latitude, currentPosition.longitude, "Đã khôi phục vị trí từ bản nháp.");
      }
      return true;
    } catch {
      return false;
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
  }

  function bindDraftListeners() {
    $("surveyForm").addEventListener("input", saveDraftSoon);
    $("surveyForm").addEventListener("change", saveDraftSoon);
  }

  /* ---------------- Status UI ---------------- */

  async function refreshStatusBar() {
    const online = navigator.onLine;
    $("statusDot").className = `status-dot ${online ? "online" : "offline"}`;
    $("statusText").textContent = online ? "Đang trực tuyến" : "Đang ngoại tuyến — dữ liệu sẽ lưu vào máy";

    const rows = await dbGetAll();
    const synced = rows.filter((r) => r.status === "synced").length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const error = rows.filter((r) => r.status === "error").length;
    const syncing = rows.filter((r) => r.status === "syncing").length;

    $("syncedCount").textContent = synced;
    $("pendingCount").textContent = pending + syncing;
    $("errorCount").textContent = error;

    const badge = $("pendingBadge");
    const totalWaiting = pending + syncing + error;
    badge.hidden = totalWaiting === 0;
    if (totalWaiting) badge.textContent = `${totalWaiting} phiên cần xử lý`;
    $("syncNowBtn").hidden = !online || (pending + syncing + error) === 0;
    $("syncNowBtn").disabled = isSyncing;
  }

  /* ---------------- GPS ---------------- */

  function mapsUrl(latitude, longitude) {
    return `https://www.google.com/maps?q=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}`;
  }

  function updateLocationUI(latitude, longitude, message = "Đã lấy vị trí hiện tại.") {
    $("latitude").value = String(latitude);
    $("longitude").value = String(longitude);
    $("locationStatus").textContent = `${message} ${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
    const link = $("mapsLink");
    link.href = mapsUrl(latitude, longitude);
    link.hidden = false;
    saveDraftSoon();
  }

  function getLocationErrorMessage(error) {
    switch (error?.code) {
      case 1: return "Bạn đã từ chối quyền vị trí. Hãy cấp quyền GPS cho trình duyệt rồi thử lại.";
      case 2: return "Thiết bị không xác định được vị trí hiện tại.";
      case 3: return "Lấy vị trí quá lâu. Hãy thử lại ở nơi có tín hiệu GPS tốt hơn.";
      default: return "Không thể lấy vị trí hiện tại.";
    }
  }

  $("getLocationBtn").addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      $("locationStatus").textContent = "Trình duyệt không hỗ trợ định vị.";
      return;
    }
    if (!window.isSecureContext) {
      $("locationStatus").textContent = "GPS yêu cầu HTTPS hoặc localhost.";
      return;
    }
    const button = $("getLocationBtn");
    button.disabled = true;
    button.textContent = "Đang lấy vị trí…";
    $("locationStatus").textContent = "Đang yêu cầu quyền vị trí…";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentPosition = position.coords;
        updateLocationUI(position.coords.latitude, position.coords.longitude, "Đã lấy vị trí.");
        document.querySelector(".field-error[data-error-for='location']").textContent = "";
        button.disabled = false;
        button.textContent = "Lấy lại vị trí";
      },
      (error) => {
        $("locationStatus").textContent = getLocationErrorMessage(error);
        button.disabled = false;
        button.textContent = "Lấy vị trí hiện tại";
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });

  /* ---------------- Image ---------------- */

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Không thể đọc ảnh."));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Ảnh không hợp lệ hoặc không thể giải mã."));
      img.src = dataUrl;
    });
  }

  async function compressImage(file) {
    if (!file.type.startsWith("image/")) throw new Error("Vui lòng chọn tệp ảnh hợp lệ.");
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      throw new Error(`Ảnh gốc vượt quá ${MAX_IMAGE_SIZE_MB} MB.`);
    }

    const sourceUrl = await readFileAsDataUrl(file);
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Thiết bị không hỗ trợ xử lý ảnh.");
    ctx.drawImage(image, 0, 0, width, height);

    let quality = 0.78;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > Math.ceil(MAX_COMPRESSED_IMAGE_BYTES * 1.37) && quality > 0.48) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    const estimatedBytes = Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4);
    if (estimatedBytes > MAX_COMPRESSED_IMAGE_BYTES) {
      throw new Error("Không thể nén ảnh xuống kích thước cho phép. Hãy chọn ảnh nhỏ hơn.");
    }
    return { dataUrl, estimatedBytes, width, height };
  }

  $("takePhotoBtn").addEventListener("click", () => $("photoInput").click());

  $("photoInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const photoStatus = $("photoStatus");
    photoStatus.textContent = "Đang xử lý ảnh…";
    $("takePhotoBtn").disabled = true;
    document.querySelector(".field-error[data-error-for='photo']").textContent = "";
    try {
      const result = await compressImage(file);
      currentPhotoDataUrl = result.dataUrl;
      $("photoPreview").src = currentPhotoDataUrl;
      $("photoPreview").hidden = false;
      photoStatus.textContent = `Đã nén ${Math.round(result.estimatedBytes / 1024)} KB · ${result.width}×${result.height}`;
      saveDraftSoon();
    } catch (error) {
      currentPhotoDataUrl = "";
      $("photoPreview").hidden = true;
      photoStatus.textContent = "Ảnh không hợp lệ";
      document.querySelector(".field-error[data-error-for='photo']").textContent = translateError(error, "Ảnh");
    } finally {
      $("takePhotoBtn").disabled = false;
      event.target.value = "";
    }
  });

  /* ---------------- Form validation ---------------- */

  function clearValidation() {
    document.querySelectorAll(".field.invalid").forEach((el) => el.classList.remove("invalid"));
    document.querySelectorAll(".field-error").forEach((el) => { el.textContent = ""; });
  }

  function setFieldError(name, message) {
    const errorEl = document.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    if (errorEl) errorEl.textContent = message;
    const field = document.getElementById(name)?.closest(".field");
    if (field) field.classList.add("invalid");
  }

  function validateForm() {
    clearValidation();
    const requiredInputs = ["sessionName", "interviewerName", "sessionTime", "studentName", "studentClass", "studentYear", "q_industry", "q_salary"];
    let ok = true;
    for (const id of requiredInputs) {
      if (!safeText($(id).value)) { setFieldError(id, "Vui lòng nhập/chọn trường này."); ok = false; }
    }
    for (const radioName of ["q_working", "q_needJob"]) {
      if (!document.querySelector(`input[name="${radioName}"]:checked`)) {
        setFieldError(radioName, "Vui lòng chọn một đáp án.");
        ok = false;
      }
    }
    const lat = safeText($("latitude").value);
    const lng = safeText($("longitude").value);
    if (!lat || !lng || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      setFieldError("location", "Vui lòng lấy vị trí GPS trước khi gửi.");
      ok = false;
    }
    if (!currentPhotoDataUrl) {
      setFieldError("photo", "Vui lòng chụp hoặc chọn ảnh hiện trường.");
      ok = false;
    }
    if (!ok) showToast("Vui lòng kiểm tra các trường bắt buộc.");
    return ok;
  }

  function radioValue(name) {
    return document.querySelector(`input[name="${CSS.escape(name)}"]:checked`)?.value || "";
  }

  function createSessionId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto?.randomUUID ? crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase() : Math.random().toString(36).slice(2, 12).toUpperCase();
    return `S-${timestamp}-${random}`;
  }

  function buildPayload(sessionId) {
    return {
      sessionId,
      sessionName: safeText($("sessionName").value),
      interviewerName: safeText($("interviewerName").value),
      sessionTime: safeText($("sessionTime").value),
      latitude: safeText($("latitude").value),
      longitude: safeText($("longitude").value),
      studentName: safeText($("studentName").value),
      studentClass: safeText($("studentClass").value),
      studentYear: safeText($("studentYear").value),
      q_working: radioValue("q_working"),
      q_needJob: radioValue("q_needJob"),
      q_industry: safeText($("q_industry").value),
      q_salary: safeText($("q_salary").value),
      q_skillGap: safeText($("q_skillGap").value),
      q_support: safeText($("q_support").value),
      q_note: safeText($("q_note").value),
      photoBase64: currentPhotoDataUrl,
    };
  }

  function resetFormState() {
    $("surveyForm").reset();
    currentPhotoDataUrl = "";
    currentPosition = null;
    $("photoPreview").hidden = true;
    $("photoPreview").removeAttribute("src");
    $("photoStatus").textContent = "Chưa có ảnh";
    $("locationStatus").textContent = "Chưa lấy vị trí.";
    $("mapsLink").hidden = true;
    $("mapsLink").href = "#";
    $("latitude").value = "";
    $("longitude").value = "";
    clearValidation();
    $("sessionTime").value = formatLocalDateTimeInput();
    clearDraft();
  }

  $("resetBtn").addEventListener("click", () => {
    if (!confirm("Xóa dữ liệu đang nhập và ảnh hiện tại?")) return;
    resetFormState();
    showToast("Đã xóa biểu mẫu.");
  });

  /* ---------------- Sync ---------------- */

  function isConfiguredEndpoint() {
    return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(APPS_SCRIPT_URL);
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Request timeout");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function parseServerResponse(response) {
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch {
      const preview = text.replace(/\s+/g, " ").slice(0, 180);
      throw new Error(`Server trả về dữ liệu không hợp lệ${preview ? `: ${preview}` : "."}`);
    }
    if (!data || typeof data !== "object") throw new Error("Server trả về JSON không hợp lệ.");
    if (data.result !== "ok") throw new Error(data.message || "Lỗi server.");
    return data;
  }

  async function syncOne(record) {
    if (!isConfiguredEndpoint) throw new Error("Apps Script URL chưa được cấu hình hợp lệ.");
    if (!record?.payload?.sessionId) throw new Error("Bản ghi thiếu sessionId.");

    record.status = "syncing";
    record.retryCount = Number(record.retryCount || 0) + 1;
    await dbPut(record);
    await renderSessionList();

    try {
      const response = await fetchWithTimeout(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(record.payload),
        cache: "no-store",
      }, REQUEST_TIMEOUT_MS);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await parseServerResponse(response);
      record.status = "synced";
      record.syncedAt = Date.now();
      record.lastError = "";
      record.serverMessage = safeText(data.message);
      await dbPut(record);
      return data;
    } catch (error) {
      record.status = "error";
      record.lastError = translateError(error);
      record.lastErrorTechnical = safeText(error?.message || error);
      await dbPut(record);
      throw error;
    }
  }

  async function syncAll({ manual = false } = {}) {
    if (isSyncing) return;
    if (!navigator.onLine) {
      showToast("Đang offline. Phiên khảo sát vẫn được giữ trên máy.");
      return;
    }
    isSyncing = true;
    $("syncNowBtn").disabled = true;
    let successCount = 0;
    let failureCount = 0;
    try {
      const rows = await dbGetAll();
      const candidates = rows.filter((record) => {
        if (record.status === "synced" || record.status === "syncing") return false;
        if (record.status === "error" && !manual && Number(record.retryCount || 0) >= MAX_RETRY) return false;
        return true;
      });

      for (const record of candidates) {
        if (!navigator.onLine) break;
        try {
          await syncOne(record);
          successCount++;
        } catch {
          failureCount++;
        }
      }

      if (successCount && failureCount) showToast(`Đồng bộ ${successCount} phiên thành công, ${failureCount} phiên còn lỗi.`);
      else if (successCount) showToast(`Đồng bộ thành công ${successCount} phiên ✓`);
      else if (failureCount && manual) showToast(`Có ${failureCount} phiên chưa đồng bộ được. Xem chi tiết lỗi.`);
    } finally {
      isSyncing = false;
      $("syncNowBtn").disabled = false;
      await renderSessionList();
      await refreshStatusBar();
    }
  }

  async function retrySession(sessionId) {
    const record = await dbGet(sessionId);
    if (!record) return;
    if (!navigator.onLine) {
      showToast("Đang offline. Hãy kết nối Internet rồi thử lại.");
      return;
    }
    record.status = "pending";
    record.lastError = "";
    await dbPut(record);
    await renderSessionList();
    await refreshStatusBar();
    try {
      await syncAll({ manual: true });
    } catch { /* syncAll renders its own state */ }
  }

  function scheduleAutoSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { if (navigator.onLine) syncAll(); }, AUTO_SYNC_DELAY_MS);
  }

  $("syncNowBtn").addEventListener("click", () => syncAll({ manual: true }));
  window.addEventListener("online", () => {
    refreshStatusBar().catch(console.error);
    showToast("Đã có Internet — đang đồng bộ các phiên chờ.");
    scheduleAutoSync();
  });
  window.addEventListener("offline", () => {
    refreshStatusBar().catch(console.error);
    showToast("Mất mạng — dữ liệu mới sẽ tiếp tục được lưu trên máy.");
  });

  /* ---------------- Session list ---------------- */

  function statusInfo(status) {
    switch (status) {
      case "synced": return { className: "synced", text: "Đã đồng bộ" };
      case "syncing": return { className: "syncing", text: "Đang đồng bộ" };
      case "error": return { className: "error", text: "Lỗi" };
      default: return { className: "pending", text: "Chờ đồng bộ" };
    }
  }

  async function renderSessionList() {
    const list = $("sessionList");
    const rows = await dbGetAll();
    if (!rows.length) {
      list.innerHTML = '<p class="empty-note">Chưa có phiên khảo sát nào được lưu trên máy.</p>';
      return;
    }
    list.innerHTML = rows.map((record) => {
      const status = statusInfo(record.status);
      const error = record.status === "error" && record.lastError ? `<p class="error-text">${escapeHtml(record.lastError)}</p>` : "";
      const retryButton = record.status === "error" ? `<button type="button" class="btn btn-secondary btn-small" data-action="retry" data-session-id="${escapeHtml(record.sessionId)}">Thử lại</button>` : "";
      return `<article class="session-item">
        <div class="session-main">
          <div class="session-meta">
            <strong>${escapeHtml(record.payload?.sessionName || "Không tên phiên")}</strong>
            <p>${escapeHtml(record.payload?.studentName || "Không có tên")} · ${escapeHtml(record.payload?.sessionTime || "")} · ${formatDateTime(record.createdAt)}</p>
          </div>
          <span class="badge ${status.className}">${status.text}</span>
        </div>
        ${error}
        <div class="session-footer">
          <small class="muted">${record.status === "synced" ? `Đồng bộ ${formatDateTime(record.syncedAt)}` : `Đã thử ${Number(record.retryCount || 0)} lần`}</small>
          <div class="session-actions">
            <button type="button" class="btn btn-ghost btn-small" data-action="detail" data-session-id="${escapeHtml(record.sessionId)}">Xem chi tiết</button>
            ${retryButton}
          </div>
        </div>
      </article>`;
    }).join("");
  }

  $("sessionList").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const sessionId = button.dataset.sessionId;
    if (button.dataset.action === "detail") {
      await openDetail(sessionId);
    } else if (button.dataset.action === "retry") {
      await retrySession(sessionId);
    }
  });

  /* ---------------- Detail modal ---------------- */

  async function openDetail(sessionId) {
    const record = await dbGet(sessionId);
    if (!record) return;
    activeDetailSessionId = sessionId;
    const status = statusInfo(record.status);
    const p = record.payload || {};
    const rows = [
      ["Session ID", record.sessionId],
      ["Trạng thái", status.text],
      ["Tên phiên", p.sessionName],
      ["Người phỏng vấn", p.interviewerName],
      ["Thời gian thiết bị", p.sessionTime],
      ["Thời gian lưu máy", formatDateTime(record.createdAt)],
      ["Tên sinh viên", p.studentName],
      ["Lớp / Khoa", p.studentClass],
      ["Năm học", p.studentYear],
      ["Đang làm thêm", p.q_working],
      ["Nhu cầu tìm việc", p.q_needJob],
      ["Ngành mong muốn", p.q_industry],
      ["Mức lương", p.q_salary],
      ["Kỹ năng còn thiếu", p.q_skillGap],
      ["Đề xuất hỗ trợ", p.q_support],
      ["Ghi chú", p.q_note],
      ["GPS", `${p.latitude || ""}, ${p.longitude || ""}`],
      ["Lỗi gần nhất", record.lastError || "—"],
      ["Số lần thử", String(record.retryCount || 0)],
    ];
    $("detailContent").innerHTML = rows.map(([label, value]) => `<div class="detail-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || "—")}</span></div>`).join("");
    $("retryDetailBtn").hidden = record.status !== "error";
    $("detailModal").hidden = false;
  }

  function closeModal() {
    $("detailModal").hidden = true;
    activeDetailSessionId = null;
  }

  $("closeModalBtn").addEventListener("click", closeModal);
  $("closeModalBtn2").addEventListener("click", closeModal);
  $("detailModal").addEventListener("click", (event) => {
    if (event.target === $("detailModal")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("detailModal").hidden) closeModal();
  });

  $("retryDetailBtn").addEventListener("click", async () => {
    if (!activeDetailSessionId) return;
    const id = activeDetailSessionId;
    closeModal();
    await retrySession(id);
  });

  $("deleteDetailBtn").addEventListener("click", async () => {
    if (!activeDetailSessionId) return;
    const record = await dbGet(activeDetailSessionId);
    if (!record) return closeModal();
    if (!confirm(`Xóa phiên “${record.payload?.sessionName || record.sessionId}” khỏi thiết bị?\nDữ liệu đã đồng bộ trên Google Sheets sẽ không bị xóa.`)) return;
    await dbDelete(activeDetailSessionId);
    closeModal();
    await renderSessionList();
    await refreshStatusBar();
    showToast("Đã xóa phiên khỏi thiết bị.");
  });

  /* ---------------- Export ---------------- */

  $("exportBtn").addEventListener("click", async () => {
    const rows = await dbGetAll();
    if (!rows.length) {
      showToast("Chưa có dữ liệu để xuất.");
      return;
    }
    const exportPayload = {
      app: "VKU Field Survey",
      exportedAt: new Date().toISOString(),
      sessions: rows,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vku-survey-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Đã xuất bản sao dữ liệu JSON.");
  });

  /* ---------------- Submit ---------------- */

  $("surveyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!validateForm()) return;

    isSubmitting = true;
    $("submitBtn").disabled = true;
    $("submitBtn").textContent = "Đang lưu trên máy…";
    try {
      const sessionId = createSessionId();
      const payload = buildPayload(sessionId);
      const record = {
        sessionId,
        status: "pending",
        createdAt: Date.now(),
        syncedAt: null,
        retryCount: 0,
        lastError: "",
        payload,
      };

      // Critical rule: persist locally before any network call.
      await dbPut(record);
      clearDraft();
      resetFormState();
      await renderSessionList();
      await refreshStatusBar();
      showToast("Đã lưu phiên khảo sát vào máy ✓");

      if (navigator.onLine) scheduleAutoSync();
    } catch (error) {
      showToast(`Không thể lưu khảo sát offline: ${translateError(error)}`, 5000);
    } finally {
      isSubmitting = false;
      $("submitBtn").disabled = false;
      $("submitBtn").textContent = "Gửi phiên khảo sát";
    }
  });

  /* ---------------- PWA ---------------- */

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
      await registration.update();
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        // The new worker takes control after the old client is ready; avoid forced reload loops.
      });
    } catch (error) {
      console.warn("Service worker registration failed:", error);
    }
  }

  /* ---------------- Init ---------------- */

  async function init() {
    try {
      db = await openDB();
      await recoverStaleSyncingRecords();
      $("sessionTime").value = formatLocalDateTimeInput();
      bindDraftListeners();
      const restored = restoreDraft();
      if (restored) showToast("Đã khôi phục bản nháp chưa hoàn tất.", 2500);
      await renderSessionList();
      await refreshStatusBar();
      await registerServiceWorker();
      if (navigator.onLine) scheduleAutoSync();
    } catch (error) {
      console.error("VKU Field Survey init error:", error);
      showToast(`Ứng dụng chưa khởi tạo được: ${translateError(error)}`, 7000);
    }
  }

  init();
})();
