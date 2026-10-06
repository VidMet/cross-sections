export const UI_LOADING_STABILIZER_VERSION = "0.6.7-ui-and-loading-stabilization";

const state = {
  activeOperations: new Map(),
  sequence: 0,
  lastMessage: "Klar"
};

const get = id => document.getElementById(id);

function updateUi() {
  const active = [...state.activeOperations.values()];
  const busy = active.length > 0;
  document.documentElement.classList.toggle("app-busy", busy);
  const refresh = get("btnRefreshModels");
  if (refresh) {
    refresh.disabled = active.some(item => item.lockRefresh);
    refresh.setAttribute("aria-busy", String(busy));
  }
  const status = get("status");
  if (status) {
    status.dataset.state = busy ? "loading" : "idle";
    status.setAttribute("aria-live", "polite");
  }
}

export function beginUiOperation(label, { lockRefresh = false } = {}) {
  const token = `ui-op-${++state.sequence}`;
  state.activeOperations.set(token, { label, lockRefresh, startedAt: Date.now() });
  const status = get("status");
  if (status && label) status.textContent = label;
  updateUi();
  return token;
}

export function endUiOperation(token, message = null) {
  state.activeOperations.delete(token);
  if (message) {
    state.lastMessage = message;
    const status = get("status");
    if (status) status.textContent = message;
  }
  updateUi();
}

export function setStableStatus(message, kind = "info") {
  state.lastMessage = message || state.lastMessage;
  const status = get("status");
  if (status) {
    status.textContent = state.lastMessage;
    status.dataset.kind = kind;
  }
  updateUi();
}

export function modelErrorDetail(source) {
  return [
    source?.errorStage ? `Trinn: ${source.errorStage}` : null,
    source?.error ? `Feil: ${source.error}` : null,
    source?.modelId ? `Modell-ID: ${source.modelId}` : null
  ].filter(Boolean).join("\n");
}

export function installUiLoadingStabilizer() {
  const enhance = () => {
    document.querySelectorAll(".geometry-source").forEach(row => {
      const details = row.querySelector(".geometry-source-details");
      const text = details?.textContent || "";
      const status = text.split("·").at(-1)?.trim().toLowerCase();
      row.dataset.status = status || "unknown";
      if (status === "error") row.setAttribute("role", "alert");
    });
    updateUi();
  };
  const observer = new MutationObserver(enhance);
  const start = () => {
    const root = get("geometrySourceList");
    if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
    enhance();
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start, { once: true }) : start();
  window.__crossSectionUiLoadingStabilizer = { version: UI_LOADING_STABILIZER_VERSION, state };
}

installUiLoadingStabilizer();
