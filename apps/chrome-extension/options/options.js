const schema = globalThis.JobAutofillProfile;
const form = document.querySelector("[data-profile-form]");
const fieldsContainer = document.querySelector("[data-fields]");
const enabledInput = document.querySelector("[data-enabled]");
const status = document.querySelector("[data-status]");

function createInput(field) {
  let input;

  if (field.input === "textarea") {
    input = document.createElement("textarea");
  } else if (field.input === "select") {
    input = document.createElement("select");
    for (const optionDefinition of field.options || []) {
      const option = document.createElement("option");
      option.value = optionDefinition.value;
      option.textContent = optionDefinition.label;
      input.append(option);
    }
  } else {
    input = document.createElement("input");
    input.type = field.input || "text";
  }

  input.name = field.key;
  input.id = `profile-${field.key}`;
  input.placeholder = field.placeholder || "";
  if (field.autocomplete?.[0]) {
    input.autocomplete = field.autocomplete[0];
  }
  return input;
}

function renderFields() {
  for (const group of schema.groups) {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = group.label;
    fieldset.append(legend);

    for (const field of schema.fields.filter(
      (candidate) => candidate.group === group.key && candidate.stored !== false
    )) {
      const label = document.createElement("label");
      label.htmlFor = `profile-${field.key}`;
      label.classList.toggle("full", field.input === "textarea");
      label.append(field.label, createInput(field));
      fieldset.append(label);
    }

    fieldsContainer.append(fieldset);
  }
}

async function load() {
  renderFields();
  const stored = await chrome.storage.local.get({
    profile: {},
    enabled: true,
    dashboardOrigin: "http://localhost:3000"
  });

  for (const field of schema.fields) {
    if (field.stored === false) {
      continue;
    }
    const input = form.elements.namedItem(field.key);
    if (input) {
      input.value = stored.profile[field.key] || "";
    }
  }

  enabledInput.checked = stored.enabled;
  document.querySelector("[data-enabled-label]").textContent = stored.enabled
    ? "Extension on"
    : "Extension off";
  document.querySelector("[data-extension-id]").textContent = chrome.runtime.id;
  document.querySelector("[data-dashboard-origin]").value =
    stored.dashboardOrigin;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const profile = {};
  const dashboardOriginInput = document.querySelector("[data-dashboard-origin]");
  let dashboardUrl;

  try {
    dashboardUrl = new URL(dashboardOriginInput.value);
  } catch {
    status.textContent = "Enter a valid dashboard origin.";
    dashboardOriginInput.focus();
    return;
  }

  const dashboardOrigin = dashboardUrl.origin;

  for (const field of schema.fields) {
    if (field.stored === false) {
      continue;
    }
    profile[field.key] = String(form.elements.namedItem(field.key)?.value || "").trim();
  }

  if (
    !["http:", "https:"].includes(dashboardUrl.protocol) ||
    !["localhost", "127.0.0.1"].includes(dashboardUrl.hostname)
  ) {
    status.textContent =
      "The MVP dashboard origin must use localhost or 127.0.0.1.";
    return;
  }

  dashboardOriginInput.value = dashboardOrigin;
  await chrome.storage.local.set({ profile, dashboardOrigin });
  status.textContent = "Profile saved locally.";
  setTimeout(() => {
    status.textContent = "";
  }, 2500);
});

enabledInput.addEventListener("change", async () => {
  const response = await chrome.runtime.sendMessage({
    type: "JOB_AUTOFILL_SET_ENABLED",
    enabled: enabledInput.checked
  });
  document.querySelector("[data-enabled-label]").textContent = response.enabled
    ? "Extension on"
    : "Extension off";
});

document.querySelector("[data-copy-id]").addEventListener("click", async () => {
  await navigator.clipboard.writeText(chrome.runtime.id);
  status.textContent = "Extension ID copied.";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
});

void load();
