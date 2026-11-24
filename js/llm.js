/*
 * llm.js — BYOK LLM narration layer (optional, off by default).
 *
 * The Brief Generator and the Draft Copilot are fully deterministic and
 * work with NO network at all. This module is an optional narration
 * layer on top: when the user configures their own OpenAI-compatible
 * endpoint, the app can send the ALREADY-GENERATED structured facts
 * (a brief's plain text, or a copilot state summary) to that model and
 * show the narrative it returns. The model is never given anything
 * else, and the system prompt forbids inventing numbers.
 *
 * PROVIDER PRESETS — endpoint + model name only, never a key:
 *   bailian  阿里云百炼 (DeepSeek) — the author's own provider, and
 *            therefore the default preset: endpoint and the
 *            deepseek-v4.1-flash model are prefilled; the user only
 *            pastes their own Bailian API key.
 *   openai   OpenAI — endpoint + a starter model, both editable.
 *   custom   Any OpenAI-compatible endpoint, filled in by hand.
 *
 * PRIVACY MODEL (also stated in the settings UI and README):
 *   - No API key is bundled with this app, in any file, ever.
 *   - The configuration (endpoint, model, key) is stored ONLY in this
 *     browser's localStorage.
 *   - The key is sent ONLY to the endpoint the user configured, as the
 *     Authorization header of that one request.
 *   - With no configuration saved, narrate() throws before any network
 *     call is made (the smoke tests stub fetch and assert exactly 0
 *     calls in that state).
 *
 * Environment-agnostic: module.exports under Node, window.LLM in
 * browsers. fetch is resolved from the global scope at call time.
 */
(function (global) {
  "use strict";

  /* Localization hook (js/i18n.js), resolved lazily at call time:
   * error messages surface in the UI, and the narration request must
   * instruct the model to answer in the active UI language. */
  function T(key, params) {
    var I = global.I18n;
    return I && typeof I.t === "function" ? I.t(key, params) : key;
  }
  function currentLocale() {
    var I = global.I18n;
    return I && typeof I.getLocale === "function" ? I.getLocale() : "en";
  }

  var STORAGE_KEY = "fdr.llm.config.v1";

  var PRESET_ORDER = ["bailian", "openai", "custom"];
  /* Preset labels are NOT stored here — they live in i18n
   * (llm.preset.bailian / .openai / .custom) so they follow the UI
   * language: EN "Aliyun Bailian (DeepSeek)", ZH "阿里云百炼（DeepSeek）". */
  var PRESETS = {
    bailian: {
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "deepseek-v4.1-flash"
    },
    openai: {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini"
    },
    custom: {
      baseUrl: "",
      model: ""
    }
  };
  var DEFAULT_PRESET = "bailian";

  /* localStorage where available; an in-memory shim elsewhere (tests). */
  var memoryStore = {};
  var store = {
    get: function () {
      try {
        if (typeof localStorage !== "undefined") return localStorage.getItem(STORAGE_KEY);
      } catch (e) { /* storage blocked — fall through to memory */ }
      return Object.prototype.hasOwnProperty.call(memoryStore, STORAGE_KEY)
        ? memoryStore[STORAGE_KEY] : null;
    },
    set: function (v) {
      try {
        if (typeof localStorage !== "undefined") { localStorage.setItem(STORAGE_KEY, v); return; }
      } catch (e) { /* fall through */ }
      memoryStore[STORAGE_KEY] = v;
    },
    remove: function () {
      try {
        if (typeof localStorage !== "undefined") { localStorage.removeItem(STORAGE_KEY); return; }
      } catch (e) { /* fall through */ }
      delete memoryStore[STORAGE_KEY];
    }
  };

  function getConfig() {
    var raw = store.get();
    if (!raw) return null;
    try {
      var cfg = JSON.parse(raw);
      if (!cfg || typeof cfg !== "object") return null;
      return {
        preset: PRESETS[cfg.preset] ? cfg.preset : DEFAULT_PRESET,
        baseUrl: cfg.baseUrl || "",
        apiKey: cfg.apiKey || "",
        model: cfg.model || ""
      };
    } catch (e) { return null; }
  }

  function setConfig(cfg) {
    var clean = {
      preset: PRESETS[cfg.preset] ? cfg.preset : DEFAULT_PRESET,
      baseUrl: (cfg.baseUrl || "").trim().replace(/\/+$/, ""),
      apiKey: (cfg.apiKey || "").trim(),
      model: (cfg.model || "").trim()
    };
    // A non-empty endpoint must pass the URL policy; an invalid one
    // throws a clear error and is NOT stored.
    if (clean.baseUrl && !validateBaseUrl(clean.baseUrl)) {
      throw new Error(T("llm.errBadUrl"));
    }
    store.set(JSON.stringify(clean));
    return clean;
  }

  function clearConfig() { store.remove(); }

  function isConfigured(cfg) {
    cfg = cfg || getConfig();
    return !!(cfg && cfg.baseUrl && cfg.apiKey && cfg.model);
  }

  /*
   * Endpoint policy: https:// only — except plain http:// on
   * localhost / 127.0.0.1, so a locally hosted model server still
   * works. Anything else (e.g. http://evil.example) would send the
   * user's API key in cleartext and is rejected.
   */
  function validateBaseUrl(baseUrl) {
    if (typeof baseUrl !== "string" || !baseUrl) return false;
    var u;
    try { u = new URL(baseUrl); } catch (e) { return false; }
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" &&
        (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return false;
  }

  /*
   * narrate(factsText) -> Promise<string>
   * Sends ONLY the supplied structured facts to the configured model.
   * Rejects (without any network call) when not configured.
   */
  function narrate(factsText) {
    var cfg = getConfig();
    if (!isConfigured(cfg)) {
      return Promise.reject(new Error(T("llm.errNoConfig")));
    }
    // Defense in depth: even a hand-edited stored config must obey
    // the endpoint policy before any key leaves the machine.
    if (!validateBaseUrl(cfg.baseUrl)) {
      return Promise.reject(new Error(T("llm.errBadUrl")));
    }
    var fetchFn = global.fetch;
    if (typeof fetchFn !== "function") {
      return Promise.reject(new Error(T("llm.errNoFetch")));
    }
    var url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    // 30-second timeout: a hung endpoint must not spin forever.
    var controller = typeof AbortController !== "undefined"
      ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () { controller.abort(); }, 30000) : null;
    var request = fetchFn(url, {
      signal: controller ? controller.signal : undefined,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + cfg.apiKey
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.4,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content: "You are a League of Legends draft analyst writing for a " +
              "professional coach. Turn the structured facts you are given " +
              "into a short, sharp narrative (at most ~200 words). Use ONLY " +
              "the facts and numbers provided — never invent statistics, " +
              "matchups, or player names. If the facts include warnings, " +
              "surface them prominently. " +
              (currentLocale() === "zh"
                ? "Write the narrative in Simplified Chinese."
                : "Write the narrative in English.")
          },
          { role: "user", content: factsText }
        ]
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (body) {
          throw new Error(T("llm.errHttp", { status: res.status }) +
            (body ? " — " + body.slice(0, 160) : ""));
        });
      }
      return res.json();
    }).then(function (json) {
      var content = json && json.choices && json.choices[0] &&
        json.choices[0].message && json.choices[0].message.content;
      if (!content) throw new Error(T("llm.errEmpty"));
      return content.trim();
    });
    return request.then(function (v) {
      if (timer) clearTimeout(timer);
      return v;
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === "AbortError") {
        throw new Error(T("llm.errTimeout"));
      }
      throw err;
    });
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    PRESET_ORDER: PRESET_ORDER,
    PRESETS: PRESETS,
    DEFAULT_PRESET: DEFAULT_PRESET,
    getConfig: getConfig,
    setConfig: setConfig,
    clearConfig: clearConfig,
    isConfigured: isConfigured,
    validateBaseUrl: validateBaseUrl,
    narrate: narrate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LLM = api;
})(typeof window !== "undefined" ? window : globalThis);
