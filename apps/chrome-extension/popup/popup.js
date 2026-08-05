const enabledInput = document.querySelector("[data-enabled]");
const mode = document.querySelector("[data-mode]");
const fillButton = document.querySelector("[data-fill]");
const optionsButton = document.querySelector("[data-options]");
const notice = document.querySelector("[data-notice]");
const progress = document.querySelector("[data-progress]");

let activeTab = null;

function showNotice(message, isError = false) {
  notice.hidden = !message;
  notice.textContent = message;
  notice.classList.toggle("error", isError);
}

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  const state = await sendMessage({
    type: "JOB_AUTOFILL_GET_STATE",
    tabId: tab?.id
  });

  enabledInput.checked = Boolean(state.enabled);
  mode.textContent = state.enabled ? "Extension is on" : "Extension is off";
  fillButton.disabled = !state.enabled || !tab?.url?.startsWith("http");
  document.querySelector("[data-extension-id]").textContent = state.extensionId;

  if (!state.profileConfigured) {
    showNotice("Add your profile before filling applications.");
  }

  if (state.session?.progress) {
    progress.hidden = false;
    document.querySelector("[data-answered]").textContent =
      `${state.session.progress.answered} / ${state.session.progress.total}`;
    document.querySelector("[data-attention]").textContent =
      state.session.progress.needsAttention;
  }
}

enabledInput.addEventListener("change", async () => {
  const response = await sendMessage({
    type: "JOB_AUTOFILL_SET_ENABLED",
    enabled: enabledInput.checked
  });
  mode.textContent = response.enabled ? "Extension is on" : "Extension is off";
  fillButton.disabled = !response.enabled;
  showNotice(
    response.enabled ? "Extension enabled." : "Extension disabled everywhere."
  );
});

fillButton.addEventListener("click", async () => {
  fillButton.disabled = true;
  fillButton.textContent = "Filling...";
  showNotice("");

  try {
    const response = await sendMessage({
      type: "JOB_AUTOFILL_START_TAB",
      tabId: activeTab.id,
      url: activeTab.url,
      jobTitle: activeTab.title,
      autofill: true
    });

    if (!response.ok) {
      throw new Error(response.error || "Unable to fill this page.");
    }
    showNotice(
      `Filled ${response.filled || 0} field${response.filled === 1 ? "" : "s"}. Review the page.`
    );
    await refresh();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    fillButton.disabled = !enabledInput.checked;
    fillButton.textContent = "Autofill current page";
  }
});

optionsButton.addEventListener("click", () => {
  void sendMessage({ type: "JOB_AUTOFILL_OPEN_OPTIONS" });
});

void refresh().catch((error) => {
  showNotice(error instanceof Error ? error.message : String(error), true);
});

