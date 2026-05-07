const deployBtn = document.getElementById("deployBtn");
const refreshStatusBtn = document.getElementById("refreshStatusBtn");
const statusBadge = document.getElementById("statusBadge");
const message = document.getElementById("message");
const log = document.getElementById("log");
const publicUrl = document.getElementById("publicUrl");

let pollTimer = null;

function setStatus(state, text) {
  statusBadge.textContent = `Status: ${state}`;
  message.textContent = text || "";
  deployBtn.disabled = state === "running" || state === "queued";
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function renderStatus(status) {
  setStatus(status.state ?? "unknown", status.message ?? "");
  log.textContent = status.log || "";
  log.scrollTop = log.scrollHeight;

  if (status.publicUrl) {
    publicUrl.href = status.publicUrl;
    publicUrl.textContent = "Open live site";
  }

  if (status.state === "running" || status.state === "queued") {
    startPolling();
  } else {
    stopPolling();
  }
}

async function refreshStatus() {
  try {
    renderStatus(await requestJson("/api/deploy/status"));
  } catch (err) {
    setStatus("error", err.message);
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = window.setInterval(refreshStatus, 2500);
}

function stopPolling() {
  if (!pollTimer) return;
  window.clearInterval(pollTimer);
  pollTimer = null;
}

refreshStatusBtn.addEventListener("click", refreshStatus);

deployBtn.addEventListener("click", async () => {
  setStatus("queued", "Deploy request sent.");
  log.textContent = "";

  try {
    const result = await requestJson("/api/deploy", { method: "POST", body: "{}" });
    renderStatus(result.status);
    startPolling();
  } catch (err) {
    setStatus("error", err.message);
  }
});

refreshStatus();
