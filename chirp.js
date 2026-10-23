/* CHIRP_RELEASE_TAB_TITLE_OVERRIDE */
(function keepChirpTabTitleGeneric() {
  const desiredTitle = "New Tab";
  const setTitle = () => {
    if (document.title !== desiredTitle) document.title = desiredTitle;
  };
  setTitle();
  const titleElement = document.querySelector("title");
  if (titleElement && typeof MutationObserver !== "undefined") {
    new MutationObserver(setTitle).observe(titleElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
})();

const firebaseConfig = {
      apiKey: "AIzaSyBbFH9U0Kd3IAN6Ah92mH9JsARIkkt3mPk",
      authDomain: "chatroom-42628.firebaseapp.com",
      databaseURL: "https://chatroom-42628-default-rtdb.firebaseio.com",
      projectId: "chatroom-42628",
      storageBucket: "chatroom-42628.firebasestorage.app",
      messagingSenderId: "1089718026157",
      appId: "1:1089718026157:web:f5037cfb671f85d801ab24",
      measurementId: "G-6483C9BZ0C"
    };

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.database();

    let currentUserIsAdmin = false;
    let currentUserIsModerator = false;
    let currentUserIsJuniorModerator = false;
    let currentChannel = "general";
    let usersCache = {};
    let replyTarget = null;
    let profileRequestCounter = 0;
    let pingListeners = {};
    let pingSessionStartedAt = 0;
    const PUBLIC_CHANNELS = ["general"];
    let privateChannels = {};
    // Tracks private-channel memberships granted temporarily to admins through
    // Moderation → See channel. Existing/normal memberships are never removed.
    const temporaryPrivateChannelAccess = new Set();
    let notificationItems = [];
    let notificationListeners = [];
    let notificationIds = new Set();
    let notificationReadIds = new Set();
    let notificationSessionStart = 0;
    let notificationInitialBadges = null;
    let notificationInitialChannels = null;
    let notificationInitialMessages = new Set();
    let notificationOwnMessageChannels = {};
    const MUTE_DURATION = 5 * 60 * 1000;

    let SWEAR_FILTER_RULES = [];
    let profanityFilterLoaded = false;

    // Supplemental high-severity hate-speech rules. These are merged with the
    // existing Firebase config/filter entries; they do not replace the server list.
    // Keep matching focused on explicit slurs and common evasion spellings.
    const BUILTIN_HATE_FILTER_ENTRIES = [
      {
        id: "builtin-anti-black-slur-variants",
        severity: 5,
        tags: ["hate", "racism"],
        match: [
          "nigger", "niggers", "nigga", "niggas",
          "nlgger", "nlggers", "nlgga", "nlggas",
          "n1gger", "n1ggers", "n1gga", "n1ggas",
          "n!gger", "n!ggers", "n!gga", "n!ggas",
          "ni99er", "ni99ers", "ni99a", "ni99as",
          "n1gg3r", "n1gg3rs", "n1gg4", "n1gg4s",
          "nigg3r", "nigg3rs", "nigg4", "nigg4s"
        ]
      },
      {
        id: "builtin-ethnic-hate-slurs",
        severity: 4,
        tags: ["hate", "ethnic-slur"],
        match: [
          "kike", "kikes", "kyke", "kykes", "k1ke", "k!ke",
          "chink", "chinks", "ch1nk", "ch!nk",
          "gook", "gooks", "spic", "spics", "spick", "spicks",
          "beaner", "beaners", "wetback", "wetbacks", "wet back", "wet backs",
          "raghead", "ragheads", "towelhead", "towelheads", "ching chong", "chingchong"
        ]
      },
      {
        id: "builtin-anti-lgbtq-slurs",
        severity: 4,
        tags: ["hate", "anti-lgbtq"],
        match: ["faggot", "faggots", "f4ggot", "f4ggots"]
      },
      {
        id: "builtin-ambiguous-slur-abbreviations",
        severity: 3,
        tags: ["hate", "anti-lgbtq", "context-sensitive"],
        // Shortened forms can have non-hateful meanings, so block them but use
        // the existing temporary-mute action rather than the auto-ban threshold.
        match: ["fag", "fags", "f4g", "f4gs"]
      }
    ];

    let BADGES = {};
    const BADGE_IMAGE_FILES = {
      "Burger": "burger.png",
      "Artist": "artist.png",
      "Gamer": "gamer.png",
      "Elite": "elite.png",
      "Beta Tester": "beta_tester.png",
      "OG": "og.png"
    };
    function badgeAssetUrl(name) {
      const file = BADGE_IMAGE_FILES[name];
      if (!file) return null;
      const base = (window.CHIRP_ASSET_BASE || "https://cdn.jsdelivr.net/gh/Lordluna67/chirp-code@main/assets/").replace(/\/?$/, "/");
      return base + file;
    }

    const DEFAULT_BADGES = {
      "OG": { label: "OG", color: "#2787f5", icon: "star" },
      "Burger": { label: "Burger", color: "#f3a43b", icon: "star" },
      "Artist": { label: "Artist", color: "#b985ff", icon: "star" },
      "Gamer": { label: "Gamer", color: "#35a8ff", icon: "star" },
      "Moderator": { label: "Moderator", color: "#55b9ef", icon: "shield" },
      "Admin": { label: "Admin", color: "#ffcc33", icon: "crown" },
      "Junior Moderator": { label: "J Moderator", color: "#67d7a4", icon: "shield-small" },
      "Developer": { label: "Developer", color: "#c59cff", icon: "code" },
      "Verified": { label: "Verified", color: "#37c5a0", icon: "verified" },
      "Verified Bot": { label: "Verified Bot", color: "#89929e", icon: "verified-bot" },
      "Elite": { label: "Elite", color: "#ff6bff", icon: "star" },
      "Beta Tester": { label: "Beta Tester", color: "#f5a142", icon: "star" }
    };

    const tabLogin = document.getElementById("tab-login");
    const tabSignup = document.getElementById("tab-signup");
    const loginView = document.getElementById("login-view");
    const signupView = document.getElementById("signup-view");
    const authView = document.getElementById("auth-view");
    const chatView = document.getElementById("chat-view");
    const userInfo = document.getElementById("user-info");
    const sidebarAccountName = document.getElementById("sidebar-account-name");
    const sidebarAccountBadges = document.getElementById("sidebar-account-badges");
    const messagesDiv = document.getElementById("messages");
    const userList = document.getElementById("user-list");
    const moderationPanel = document.getElementById("moderation-panel");
    const profilePanel = document.getElementById("profile-panel");
    const messageForm = document.getElementById("message-form");

    function show(mode) {
      const login = mode === "login";
      loginView.classList.toggle("hidden", !login);
      signupView.classList.toggle("hidden", login);
      tabLogin.classList.toggle("active", login);
      tabSignup.classList.toggle("active", !login);
      document.title = login ? "Chat — Log in" : "Chat — Sign up";
    }
    tabLogin.addEventListener("click", () => show("login"));
    tabSignup.addEventListener("click", () => show("signup"));

    function setMessage(id, text) {
      const el = document.getElementById(id);
      el.textContent = text;
      el.classList.add("show");
    }
    function clearMessages(prefix) {
      document.getElementById(prefix + "-error").classList.remove("show");
      document.getElementById(prefix + "-success").classList.remove("show");
    }

    function usernameToEmail(username) {
      return username.trim().toLowerCase() + "@chatroom.local";
    }

    document.getElementById("login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessages("login");
      const data = new FormData(event.currentTarget);
      const username = String(data.get("username") || "").trim();
      const password = String(data.get("password") || "");
      if (username.length < 3) { setMessage("login-error", "Username needs at least 3 characters."); return; }
      if (password.length < 8) { setMessage("login-error", "Password needs at least 8 characters."); return; }
      try {
        await auth.signInWithEmailAndPassword(usernameToEmail(username), password);
      } catch (err) {
        setMessage("login-error", err.message || "Login failed.");
      }
    });

    document.getElementById("signup-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessages("signup");
      const data = new FormData(event.currentTarget);
      const name = String(data.get("name") || "").trim();
      const username = String(data.get("username") || "").trim();
      const password = String(data.get("password") || "");
      const confirm = String(data.get("confirm") || "");
      if (name.length < 2) { setMessage("signup-error", "Enter a display name."); return; }
      if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) { setMessage("signup-error", "Username: 3–16 letters, numbers, or underscores."); return; }
      if (password.length < 8) { setMessage("signup-error", "Password needs at least 8 characters."); return; }
      if (password !== confirm) { setMessage("signup-error", "Passwords do not match."); return; }
      try {
        const cred = await auth.createUserWithEmailAndPassword(usernameToEmail(username), password);
        await cred.user.updateProfile({ displayName: name });
        const claim = await claimDevice(cred.user.uid);
        if (!claim.ok) {
          await db.ref("users/" + cred.user.uid + "/banned").set(true);
          await auth.signOut();
          setMessage("signup-error", claim.reason + " You cannot make another account on this device.");
          return;
        }
        setMessage("signup-success", "Account created! You can log in now.");
        show("login");
      } catch (err) {
        setMessage("signup-error", err.message || "Signup failed.");
      }
    });

    document.getElementById("forgot").addEventListener("click", (event) => {
      event.preventDefault();
      clearMessages("login");
      setMessage("login-error", "Password reset is not set up.");
    });

    function normalizeFilterText(value) {
      return String(value == null ? "" : value)
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\u200B-\u200F\uFEFF\u2060]/g, "");
    }

    function numericKeySort(keys) {
      return keys.sort((a, b) => {
        const an = Number(a), bn = Number(b);
        const aNumeric = a.trim() !== "" && Number.isFinite(an);
        const bNumeric = b.trim() !== "" && Number.isFinite(bn);
        if (aNumeric && bNumeric) return an - bn;
        if (aNumeric) return -1;
        if (bNumeric) return 1;
        return String(a).localeCompare(String(b));
      });
    }

    function filterArray(value) {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") return value.split("|");
      if (value && typeof value === "object") {
        return numericKeySort(Object.keys(value)).map(key => value[key]);
      }
      return [];
    }

    function filterGlobSource(pattern) {
      const chars = [...normalizeFilterText(pattern).trim()];
      let source = "";
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (ch === "*") {
          source += "[^\\s]*";
        } else if (/\s/u.test(ch)) {
          while (i + 1 < chars.length && /\s/u.test(chars[i + 1])) i++;
          source += "\\s+";
        } else {
          source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
      }
      return source;
    }

    function compileFilterGlob(pattern, anchored = false) {
      const source = filterGlobSource(pattern);
      if (!source) return null;
      try {
        return new RegExp((anchored ? "^" : "") + source + (anchored ? "$" : ""), anchored ? "iu" : "giu");
      } catch (err) {
        console.warn("Skipping invalid profanity filter pattern", pattern, err);
        return null;
      }
    }

    // Additional matcher for obfuscated text such as "f u c k", "fuc.k", or "fuc-k".
    // It allows punctuation/spacing between letters but does not remove or invent letters.
    function compileObfuscatedFilterGlob(pattern) {
      const compact = [...normalizeFilterText(pattern).replace(/[^\p{L}\p{N}*]/gu, "")];
      if (!compact.length) return null;
      let source = "";
      for (let i = 0; i < compact.length; i++) {
        const ch = compact[i];
        if (ch === "*") source += "[^\\p{L}\\p{N}]*";
        else source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (i < compact.length - 1 && ch !== "*" && compact[i + 1] !== "*") {
          source += "[^\\p{L}\\p{N}]*";
        }
      }
      try {
        return new RegExp(source, "giu");
      } catch (err) {
        console.warn("Skipping invalid obfuscated profanity pattern", pattern, err);
        return null;
      }
    }
//profanity normalizer raw object ADAM THIS IS GOOD FINALLYYYY
    function normalizeProfanityFilter(raw) {
      let entries = [];
      if (Array.isArray(raw)) {
        entries = raw;
      } else if (raw && typeof raw === "object") {
        if (raw.match || raw.word || raw.term || raw.id) entries = [raw];
        else entries = numericKeySort(Object.keys(raw)).map(key => raw[key]);
      } else if (typeof raw === "string") {
        entries = raw.split("|");
      }

      // Only activate the supplement when Firebase supplied a real filter list.
      // The app intentionally remains fail-closed when config/filter is missing.
      const hasServerFilterEntries = entries.some(entry =>
        entry && typeof entry === "object" && !Array.isArray(entry) &&
        (entry.match || entry.word || entry.term || entry.id)
      );
      if (hasServerFilterEntries) {
        // Put these first so a weaker duplicate rule in the database cannot
        // downgrade the severity of a high-risk hate-speech match.
        entries = [...BUILTIN_HATE_FILTER_ENTRIES, ...entries];
      }

      const normalized = [];
      for (const entry of entries) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const id = String(entry.id || "");
        const matchValue = entry.match || entry.word || entry.term || entry.id || "";
        const matches = filterArray(matchValue)
          .map(pattern => String(pattern || "").trim())
          .filter(Boolean)
          .map(pattern => ({
            pattern,
            regex: compileFilterGlob(pattern, false),
            obfuscatedRegex: compileObfuscatedFilterGlob(pattern)
          }))
          .filter(item => item.regex || item.obfuscatedRegex);
        const exceptions = filterArray(entry.exceptions)
          .flatMap(item => String(item || "").split("|"))
          .map(pattern => pattern.trim())
          .filter(Boolean);
        const compiledExceptions = exceptions
          .map(pattern => ({ pattern, regex: compileFilterGlob(pattern, true) }))
          .filter(item => item.regex);
        if (!matches.length) continue;

        const severityNumber = Number(entry.severity);
        normalized.push({
          id,
          severity: Number.isFinite(severityNumber) ? Math.max(1, Math.min(5, severityNumber)) : 1,
          tags: filterArray(entry.tags).map(tag => String(tag || "").trim().toLowerCase()).filter(Boolean),
          matches,
          exceptions,
          compiledExceptions
        });
      }
      return normalized;
    }

    function isFilterWordChar(char) {
      return !!char && /[\p{L}\p{N}_'’\-]/u.test(char);
    }

    function profanityMatchContext(text, start, end) {
      let rangeStart = start;
      let rangeEnd = end;
      while (rangeStart > 0 && isFilterWordChar(text[rangeStart - 1])) rangeStart--;
      while (rangeEnd < text.length && isFilterWordChar(text[rangeEnd])) rangeEnd++;
      const candidate = text.slice(rangeStart, rangeEnd).trim();
      const before = text.slice(0, rangeStart).trimEnd();
      const after = text.slice(rangeEnd).trimStart();
      const previousWord = (before.match(/[\p{L}\p{N}_'’\-]+$/u) || [""])[0];
      const nextWord = (after.match(/^[\p{L}\p{N}_'’\-]+/u) || [""])[0];
      return {
        candidate,
        embedded: isFilterWordChar(text[start - 1]) || isFilterWordChar(text[end]),
        exceptionCandidates: [
          candidate,
          previousWord ? previousWord + " " + candidate : "",
          nextWord ? candidate + " " + nextWord : "",
          previousWord && nextWord ? previousWord + " " + candidate + " " + nextWord : ""
        ].filter(Boolean)
      };
    }
//This little function is insaine
    function containsSwear(text) {
      const normalizedText = normalizeFilterText(text);
      if (!normalizedText || !SWEAR_FILTER_RULES.length) return null;

      for (const rule of SWEAR_FILTER_RULES) {
        for (const item of rule.matches) {
          for (const regex of [item.regex, item.obfuscatedRegex].filter(Boolean)) {
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(normalizedText)) !== null) {
              const start = match.index;
              const end = start + match[0].length;
              const context = profanityMatchContext(normalizedText, start, end);
              const excepted = rule.compiledExceptions.some(exception =>
                context.exceptionCandidates.some(candidate => exception.regex.test(candidate))
              );
              if (excepted) continue;
              if (context.embedded && rule.exceptions.length === 0) continue;
              return { id: rule.id, severity: rule.severity, tags: rule.tags, matchedText: match[0] };
            }
          }
        }
      }
      return null;
    }

    async function loadServerConfig() {
      try {
        const badgeSnap = await db.ref("config/badges").once("value");
        const badges = badgeSnap.val();
        BADGES = badges && typeof badges === "object" ? { ...DEFAULT_BADGES, ...badges } : { ...DEFAULT_BADGES };
      } catch (err) {
        console.warn("Could not load badges", err);
        BADGES = { ...DEFAULT_BADGES };
      }

      try {
        const filterSnap = await db.ref("config/filter").once("value");
        SWEAR_FILTER_RULES = normalizeProfanityFilter(filterSnap.val());
        profanityFilterLoaded = SWEAR_FILTER_RULES.length > 0;
        if (!profanityFilterLoaded) {
          console.error("Firebase config/filter was read, but no valid filter rules were found.");
        } else {
          console.info("Loaded profanity filter rules from Firebase config/filter:", SWEAR_FILTER_RULES.length);
        }
      } catch (err) {
        profanityFilterLoaded = false;
        SWEAR_FILTER_RULES = [];
        console.error("Could not read the profanity filter at config/filter. Check Firebase read permissions.", err);
      }
    }

    function getDeviceId() {
      const key = "chat-device-id";
      let id = localStorage.getItem(key);
      if (!id) {
        id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(key, id);
      }
      return id;
    }

    async function claimDevice(uid) {
      const deviceId = getDeviceId();
      const bannedSnap = await db.ref("bannedDevices/" + deviceId).once("value");
      if (bannedSnap.val() === true) {
        return { ok: false, reason: "This device is banned." };
      }
      const deviceRef = db.ref("devices/" + deviceId);
      const existing = await deviceRef.once("value");
      if (existing.exists() && existing.val() !== uid) {
        return { ok: false, reason: "This device already has an account." };
      }
      await deviceRef.set(uid);
      await db.ref("users/" + uid + "/deviceId").set(deviceId);
      return { ok: true };
    }

    function displayNameFromUser(u, uid) {
      const record = u && typeof u === "object" ? u : {};
      const candidates = [record.name, record.username, record.displayName];
      for (const value of candidates) {
        const text = String(value || "").trim();
        if (!text || text.includes("{") || text.includes("$") || text === "undefined") continue;
        return text;
      }
      return "User " + String(uid || "").slice(0, 6);
    }

    async function checkIfAdmin(uid) {
      const snap = await db.ref("admins/" + uid).once("value");
      return snap.exists() && snap.val() === true;
    }

    async function checkIfModerator(uid) {
      const snap = await db.ref("moderators/" + uid).once("value");
      return snap.exists() && snap.val() === true;
    }

    async function checkIfJuniorModerator(uid) {
      try {
        const snap = await db.ref("userBadges/" + uid + "/Junior Moderator").once("value");
        return snap.val() === true;
      } catch (err) {
        console.warn("Could not check Junior Moderator status:", err);
        return false;
      }
    }

    async function checkIfBanned(uid) {
      const snap = await db.ref("users/" + uid + "/banned").once("value");
      return snap.val() === true;
    }

    function badgeImageData(name) {
      const b = BADGES[name] || { label: name, color: "#888", icon: "star" };
      const customImage = badgeAssetUrl(name);
      if (customImage) return customImage;
      if (name === "OG") {
        const ogSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="20" viewBox="0 0 32 20"><rect x=".5" y=".5" width="31" height="19" rx="5" fill="#2787f5" stroke="#66b0ff"/><text x="16" y="14" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="#fff">OG</text></svg>';
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ogSvg);
      }
      if (name === "Verified" || name === "Verified Bot") {
        const bg = name === "Verified" ? '<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#21c55d"/><stop offset="100%" stop-color="#168bff"/></linearGradient></defs><rect x="1.5" y="1.5" width="21" height="21" rx="7" fill="url(#g)"/>' : '<rect x="1.5" y="1.5" width="21" height="21" rx="7" fill="#808a98"/>';
        const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${bg}<path d="m6.5 12.2 3.4 3.4 7.7-7.8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(checkSvg);
      }
      const paths = {
        star: '<path d="M12 2.2l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17l-5.8 3.1 1.1-6.5L2.6 9l6.5-.9z"/>',
        shield: '<path d="M12 2 20 5v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5z"/><path d="m8 12 2.5 2.5L16 9" fill="none" stroke="#151515" stroke-width="2"/>',
        crown: '<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/><circle cx="3" cy="6" r="2"/><circle cx="12" cy="3" r="2"/><circle cx="21" cy="6" r="2"/>',
        "shield-small": '<path d="M12 2 20 5v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5z"/><path d="M8 12h8" fill="none" stroke="#151515" stroke-width="2"/>',
        code: '<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M14 4l-4 16" fill="none" stroke="COLOR" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
      };
      const icon = paths[b.icon].replaceAll("COLOR", b.color);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="translate(1 1) scale(0.92)" fill="${b.color}">${icon}</g></svg>`;
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }

    function applyUsernameColor(el, uid, data) {
      if (!el || !uid) return;
      // Keep reserved role colors intact; Elite no longer overrides a user's chosen color.
      if (el.classList.contains("junior-moderator") || el.classList.contains("admin") || el.classList.contains("mod")) return;
      const userData = data || usersCache[uid] || {};
      const color = userData.usernameColor;
      el.classList.toggle("chirp-rainbow-username", userData.usernameRainbow === true);
      el.classList.toggle("chirp-elite-glow", userData.usernameGlow === true);
      if (userData.usernameRainbow !== true && color && /^#[0-9a-fA-F]{6}$/.test(color)) {
        el.classList.remove("elite-rainbow");
        el.style.color = color;
        el.style.removeProperty("-webkit-text-fill-color");
      }
    }

    async function hasElite(uid) {
      if (!uid) return false;
      try {
        const snap = await db.ref("userBadges/" + uid + "/Elite").once("value");
        return snap.val() === true;
      } catch (e) { return false; }
    }

    async function getUserBadges(uid, isAdmin, isMod) {
      const names = [];
      let admin = !!isAdmin;
      let mod = !!isMod;
      try {
        const [adminSnap, modSnap] = await Promise.all([
          db.ref("admins/" + uid).once("value"),
          db.ref("moderators/" + uid).once("value")
        ]);
        if (adminSnap.val() === true) admin = true;
        if (modSnap.val() === true) mod = true;
      } catch (err) {
        console.warn("Could not read role for badges", uid, err);
      }
      if (admin) names.push("Admin");
      else if (mod) names.push("Moderator");

      try {
        const snap = await db.ref("userBadges/" + uid).once("value");
        const saved = snap.val() || {};
        const known = new Set([...Object.keys(BADGES), ...Object.keys(DEFAULT_BADGES), ...Object.keys(saved)]);
        known.forEach(name => {
          const value = saved[name];
          const hasBadge = value === true || value === "true" || value === 1;
          if (hasBadge && !names.includes(name)) names.push(name);
        });
      } catch (err) {
        console.warn("Could not read assigned badges for user", uid, err);
      }
      return names;
    }

    async function appendBadges(container, uid, isAdmin, isMod) {
      if (!uid) return;
      const names = await getUserBadges(uid, isAdmin, isMod);
      if (!names.length) return;

      const list = document.createElement("span");
      list.className = "badge-list";
      list.setAttribute("aria-label", "User badges");
      names.forEach(name => {
        const badge = BADGES[name] || DEFAULT_BADGES[name] || { label: name, color: "#888", icon: "star" };
        const icon = document.createElement("span");
        icon.className = "badge-icon" + (name === "OG" ? " badge-og" : "");
        icon.dataset.tooltip = badge.label;
        icon.title = badge.label;
        icon.setAttribute("role", "img");
        icon.setAttribute("aria-label", badge.label + " badge");
        icon.tabIndex = 0;
        const img = document.createElement("img");
        img.className = "chat-badge";
        img.src = badgeImageData(name);
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        icon.appendChild(img);
        list.appendChild(icon);
      });
      if (list.childElementCount) container.appendChild(list);
    }

    // Render just the badge's symbol for the profile avatar (rather than the full badge label).
    function badgeSymbolImageData(name) {
      const customImage = badgeAssetUrl(name);
      if (customImage) return customImage;
      const badge = BADGES[name] || DEFAULT_BADGES[name] || { label: name, color: "#8b95a5", icon: "star" };
      const color = typeof badge.color === "string" && /^#[0-9a-fA-F]{6}$/.test(badge.color) ? badge.color : "#8b95a5";
      const iconName = String(badge.icon || "star");
      if (name === "Verified" || name === "Verified Bot" || iconName === "verified" || iconName === "verified-bot") {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="6" fill="${color}"/><path d="m6.5 12.2 3.4 3.4 7.7-7.8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      }
      const paths = {
        star: '<path d="M12 2.2l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17l-5.8 3.1 1.1-6.5L2.6 9l6.5-.9z"/>',
        shield: '<path d="M12 2 20 5v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5z"/><path d="m8 12 2.5 2.5L16 9" fill="none" stroke="#151515" stroke-width="2"/>',
        crown: '<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/><circle cx="3" cy="6" r="2"/><circle cx="12" cy="3" r="2"/><circle cx="21" cy="6" r="2"/>',
        "shield-small": '<path d="M12 2 20 5v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5z"/><path d="M8 12h8" fill="none" stroke="#151515" stroke-width="2"/>',
        code: '<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M14 4l-4 16" fill="none" stroke="COLOR" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
      };
      const selectedPath = paths[iconName] || paths.star;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><g fill="${color}">${selectedPath.replaceAll("COLOR", color)}</g></svg>`;
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }

    function renderProfileAvatarContent(avatar, displayName, badgeName) {
      if (!avatar) return;
      avatar.replaceChildren();
      avatar.classList.toggle("profile-avatar-has-symbol", !!badgeName);
      if (badgeName) {
        const symbol = document.createElement("img");
        symbol.src = badgeSymbolImageData(badgeName);
        symbol.alt = "";
        symbol.setAttribute("aria-hidden", "true");
        symbol.style.cssText = "display:block;width:48px;height:48px;max-width:72%;max-height:72%;object-fit:contain;pointer-events:none;";
        avatar.appendChild(symbol);
        const badge = BADGES[badgeName] || DEFAULT_BADGES[badgeName] || { label: badgeName };
        avatar.title = "Featured badge symbol: " + badge.label;
        avatar.setAttribute("aria-label", "Profile avatar showing the " + badge.label + " badge symbol");
      } else {
        avatar.textContent = String(displayName || "U").trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "U";
        avatar.title = avatar.dataset.editable === "true" ? "Click to choose a badge symbol for your profile" : "Profile avatar";
        avatar.setAttribute("aria-label", avatar.textContent + " profile avatar");
      }
    }

    async function openProfileBadgePicker(uid, avatar, displayName, currentSelection, onChosen) {
      if (!auth.currentUser || auth.currentUser.uid !== uid) return;
      document.getElementById("profile-badge-picker")?.remove();
      const overlay = document.createElement("div");
      overlay.id = "profile-badge-picker";
      overlay.style.cssText = "position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.76);";
      const modal = document.createElement("div");
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "profile-badge-picker-title");
      modal.style.cssText = "width:min(480px,100%);max-height:85vh;overflow:auto;padding:20px;background:#14171d;border:1px solid #303743;border-radius:12px;box-shadow:0 14px 55px rgba(0,0,0,.55);color:#eee;";
      const heading = document.createElement("h3");
      heading.id = "profile-badge-picker-title";
      heading.textContent = "Choose your profile symbol";
      heading.style.cssText = "margin:0 0 7px;font-size:18px;";
      const hint = document.createElement("p");
      hint.textContent = "Choose a symbol from a badge you own. Everyone who views your profile will see it in your circle.";
      hint.style.cssText = "margin:0 0 14px;color:#aab1bc;font-size:13px;line-height:1.5;";
      const grid = document.createElement("div");
      grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:9px;";
      const status = document.createElement("p");
      status.setAttribute("aria-live", "polite");
      status.style.cssText = "min-height:17px;margin:12px 0 0;color:#a2f56a;font-size:12px;overflow-wrap:anywhere;";
      const footer = document.createElement("div");
      footer.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.style.cssText = "border:1px solid #424956;border-radius:6px;padding:9px 12px;background:#242a33;color:#eee;cursor:pointer;";
      close.addEventListener("click", () => overlay.remove());
      footer.appendChild(close);
      modal.append(heading, hint, grid, status, footer);
      overlay.appendChild(modal);
      overlay.addEventListener("click", event => { if (event.target === overlay) overlay.remove(); });
      document.addEventListener("keydown", function escPicker(event) {
        if (event.key === "Escape" && overlay.isConnected) { overlay.remove(); document.removeEventListener("keydown", escPicker); }
        if (!overlay.isConnected) document.removeEventListener("keydown", escPicker);
      });
      document.body.appendChild(overlay);
      status.textContent = "Loading your badges…";
      try {
        const ownedBadges = await getUserBadges(uid, await checkIfAdmin(uid), await checkIfModerator(uid));
        if (!overlay.isConnected) return;
        grid.replaceChildren();
        status.textContent = ownedBadges.length ? "" : "You don't have any badges yet. You can still use your initials.";
        const makeChoice = (badgeName, label, noSymbol = false) => {
          const button = document.createElement("button");
          button.type = "button";
          button.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:96px;padding:10px 8px;border:1px solid " + ((badgeName || "") === (currentSelection || "") ? "#8bd450" : "#303743") + ";border-radius:8px;background:#0c0e12;color:#eef1f5;font:inherit;cursor:pointer;";
          if (noSymbol) {
            const initials = document.createElement("span");
            initials.textContent = String(displayName || "U").trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "U";
            initials.style.cssText = "display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:#242a33;color:#d9e4d2;font-size:15px;font-weight:800;";
            button.appendChild(initials);
          } else {
            const preview = document.createElement("span");
            preview.style.cssText = "display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:#242a33;border:2px solid #343c48;";
            const img = document.createElement("img");
            img.src = badgeSymbolImageData(badgeName);
            img.alt = "";
            img.style.cssText = "width:26px;height:26px;object-fit:contain;";
            preview.appendChild(img);
            button.appendChild(preview);
          }
          const text = document.createElement("span");
          text.textContent = label;
          text.style.cssText = "font-size:12px;font-weight:700;text-align:center;";
          button.appendChild(text);
          button.addEventListener("mouseenter", () => { if (!button.disabled) button.style.backgroundColor = "#191f28"; });
          button.addEventListener("mouseleave", () => { button.style.backgroundColor = "#0c0e12"; });
          button.addEventListener("click", async () => {
            if (!auth.currentUser || auth.currentUser.uid !== uid) { overlay.remove(); return; }
            button.disabled = true;
            status.style.color = "#aab1bc";
            status.textContent = "Saving…";
            try {
              let verifiedBadge = badgeName || "";
              if (verifiedBadge) {
                const freshOwnedBadges = await getUserBadges(uid, await checkIfAdmin(uid), await checkIfModerator(uid));
                if (!freshOwnedBadges.includes(verifiedBadge)) throw new Error("You no longer own that badge. Reopen the picker and choose another.");
                await db.ref("users/" + uid + "/profileBadgeSymbol").set(verifiedBadge);
              } else {
                await db.ref("users/" + uid + "/profileBadgeSymbol").remove();
              }
              if (typeof onChosen === "function") onChosen(verifiedBadge);
              overlay.remove();
            } catch (err) {
              console.error("Could not save profile badge symbol:", err);
              status.style.color = "#ff8d8d";
              status.textContent = "Couldn't save this choice: " + (err.code || err.message || "unknown error") + ". Check the Firebase rules update.";
              button.disabled = false;
            }
          });
          grid.appendChild(button);
        };
        ownedBadges.forEach(name => {
          const badge = BADGES[name] || DEFAULT_BADGES[name] || { label: name };
          makeChoice(name, badge.label || name, false);
        });
        makeChoice("", "Use initials instead", true);
      } catch (err) {
        console.error("Could not load owned badges for the profile symbol picker:", err);
        status.style.color = "#ff8d8d";
        status.textContent = "Couldn't load your badges. Try again after checking your connection.";
      }
    }

    let sidebarBadgesRef = null;
    async function renderSidebarAccount(user) {
      if (!user || !sidebarAccountName || !sidebarAccountBadges) return;
      const display = user.displayName || (user.email || "").split("@")[0] || "Account";
      sidebarAccountName.textContent = display;
      sidebarAccountName.classList.toggle("junior-moderator", currentUserIsJuniorModerator && !currentUserIsAdmin);
      // Username color is user-selected for all accounts, including Elite.
      sidebarAccountName.classList.remove("elite-rainbow");
      applyUsernameColor(sidebarAccountName, user.uid, usersCache[user.uid]);
      if (userInfo) {
        userInfo.classList.remove("elite-rainbow");
        applyUsernameColor(userInfo, user.uid, usersCache[user.uid]);
      }
      sidebarAccountBadges.replaceChildren();
      await appendBadges(sidebarAccountBadges, user.uid, currentUserIsAdmin, currentUserIsModerator);
    }

    document.getElementById("sidebar-account-name").addEventListener("click", () => {
      if (auth.currentUser) openUserProfile(auth.currentUser.uid, true);
    });

    function watchSidebarBadges(user) {
      if (sidebarBadgesRef) sidebarBadgesRef.off();
      sidebarBadgesRef = null;
      if (!user) {
        if (sidebarAccountName) {
          sidebarAccountName.textContent = "";
          sidebarAccountName.classList.remove("elite-rainbow", "junior-moderator");
        }
        if (userInfo) userInfo.classList.remove("elite-rainbow", "junior-moderator");
        if (sidebarAccountBadges) sidebarAccountBadges.replaceChildren();
        return;
      }
      sidebarBadgesRef = db.ref("userBadges/" + user.uid);
      sidebarBadgesRef.on("value", snapshot => {
        if (auth.currentUser && auth.currentUser.uid === user.uid) {
          const liveBadgeValues = snapshot.val() || {};
          currentUserIsJuniorModerator = !!liveBadgeValues["Junior Moderator"];
          if (sidebarAccountName) sidebarAccountName.classList.remove("elite-rainbow");
          if (userInfo) userInfo.classList.remove("elite-rainbow");
          const display = auth.currentUser.displayName || (auth.currentUser.email || "").split("@")[0] || "Account";
          const rank = currentUserIsAdmin ? " (Admin)" : (currentUserIsJuniorModerator ? " (J Moderator)" : (currentUserIsModerator ? " (Mod)" : ""));
          userInfo.textContent = display + rank;
          userInfo.classList.toggle("junior-moderator", currentUserIsJuniorModerator && !currentUserIsAdmin);
          sidebarAccountName.classList.toggle("junior-moderator", currentUserIsJuniorModerator && !currentUserIsAdmin);
          applyUsernameColor(sidebarAccountName, user.uid, usersCache[user.uid]);
          applyUsernameColor(userInfo, user.uid, usersCache[user.uid]);
          const canModerate = currentUserIsAdmin || (currentUserIsModerator && !currentUserIsJuniorModerator);
          document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !canModerate));
          if (!canModerate && currentChannel === "moderation") {
            currentChannel = "general";
            document.querySelectorAll(".channel").forEach(el => el.classList.toggle("active", el.dataset.channel === "general"));
            showChatPanel();
            document.getElementById("current-channel").textContent = "# general";
            loadMessages();
          }
        }
        renderSidebarAccount(user).catch(err => console.error("Could not refresh account badges:", err));
      });
    }

    async function readRoleFlag(path) {
      try {
        const snap = await db.ref(path).once("value");
        return snap.val() === true;
      } catch (err) {
        return null;
      }
    }

    const notificationCenter = document.getElementById("notification-center");
    const notificationList = document.getElementById("notification-list");
    const notificationButton = document.getElementById("notifications-btn");
    const notificationCount = document.getElementById("notification-count");

    function notificationStorageKey(uid) { return "chirp_notifications_read_v1_" + uid; }
    function saveNotificationReadState() {
      const uid = auth.currentUser && auth.currentUser.uid;
      if (!uid) return;
      try { localStorage.setItem(notificationStorageKey(uid), JSON.stringify([...notificationReadIds])); } catch (_) {}
    }
    function formatNotificationTime(timestamp) {
      const elapsed = Math.max(0, Date.now() - (Number(timestamp) || Date.now()));
      if (elapsed < 60000) return "Just now";
      if (elapsed < 3600000) return Math.floor(elapsed / 60000) + "m ago";
      if (elapsed < 86400000) return Math.floor(elapsed / 3600000) + "h ago";
      return Math.floor(elapsed / 86400000) + "d ago";
    }
    function addChirpNotification(item) {
      if (!item || !item.id || notificationIds.has(item.id)) return;
      notificationIds.add(item.id);
      notificationItems.unshift({ timestamp: Date.now(), ...item });
      notificationItems = notificationItems.slice(0, 100);
      renderNotificationCenter();
    }
    function renderNotificationCenter() {
      const unread = notificationItems.filter(item => !notificationReadIds.has(item.id)).length;
      notificationCount.textContent = unread > 99 ? "99+" : String(unread);
      notificationCount.classList.toggle("has-count", unread > 0);
      notificationButton.title = unread ? unread + " unread notification" + (unread === 1 ? "" : "s") : "Notifications";
      notificationList.replaceChildren();
      if (!notificationItems.length) {
        const empty = document.createElement("div");
        empty.className = "notification-empty";
        empty.textContent = "You're all caught up.";
        notificationList.appendChild(empty);
        return;
      }
      notificationItems.forEach(item => {
        const unreadItem = !notificationReadIds.has(item.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "notification-item" + (unreadItem ? " unread" : "");
        const icon = document.createElement("span");
        icon.className = "notification-icon";
        icon.textContent = item.icon || "🔔";
        const copy = document.createElement("span");
        copy.className = "notification-copy";
        const title = document.createElement("span");
        title.className = "notification-title";
        title.textContent = item.title || "Notification";
        const detail = document.createElement("span");
        detail.className = "notification-detail";
        detail.textContent = item.detail || "";
        const time = document.createElement("span");
        time.className = "notification-time";
        time.textContent = formatNotificationTime(item.timestamp);
        copy.append(title);
        if (item.detail) copy.append(detail);
        copy.append(time);
        button.append(icon, copy);
        if (unreadItem) { const dot = document.createElement("span"); dot.className = "notification-dot"; button.append(dot); }
        button.addEventListener("click", () => {
          notificationReadIds.add(item.id);
          saveNotificationReadState();
          renderNotificationCenter();
          notificationCenter.classList.add("hidden");
          notificationButton.setAttribute("aria-expanded", "false");
          if (item.action === "channel" && item.channel) jumpToChannel(item.channel);
          else if (item.action === "friend-request") jumpToChannel("profile");
        });
        notificationList.appendChild(button);
      });
    }
    function stopNotificationCenter() {
      notificationListeners.forEach(entry => entry.ref.off(entry.event || "value", entry.handler));
      notificationListeners = [];
      notificationItems = [];
      notificationIds = new Set();
      notificationReadIds = new Set();
      notificationInitialBadges = null;
      notificationInitialChannels = null;
      notificationInitialMessages = new Set();
      notificationOwnMessageChannels = {};
      notificationCenter.classList.add("hidden");
      notificationButton.setAttribute("aria-expanded", "false");
      renderNotificationCenter();
    }
    function watchNotification(ref, event, handler) {
      ref.on(event, handler, err => console.warn("Notification listener unavailable:", err));
      notificationListeners.push({ ref, event, handler });
    }
    function startNotificationCenter(uid) {
      stopNotificationCenter();
      if (!uid) return;
      notificationSessionStart = Date.now();
      try {
        const saved = JSON.parse(localStorage.getItem(notificationStorageKey(uid)) || "[]");
        if (Array.isArray(saved)) notificationReadIds = new Set(saved);
      } catch (_) {}
      const requestsRef = db.ref("friendRequests/" + uid);
      watchNotification(requestsRef, "value", snap => {
        const requests = snap.val() || {};
        Object.entries(requests).forEach(([senderUid, request]) => {
          if (!request || request.status !== "pending") return;
          const name = request.fromName || request.fromUsername || "Someone";
          addChirpNotification({ id: "friend-request:" + senderUid, icon: "👥", title: "Friend request", detail: name + " sent you a friend request.", action: "friend-request", timestamp: request.createdAt || Date.now() });
        });
      });
      const badgesRef = db.ref("userBadges/" + uid);
      watchNotification(badgesRef, "value", snap => {
        const next = snap.val() || {};
        if (notificationInitialBadges === null) { notificationInitialBadges = next; return; }
        Object.entries(next).forEach(([badge, enabled]) => {
          if (enabled === true && notificationInitialBadges[badge] !== true) {
            addChirpNotification({ id: "badge:" + badge + ":" + Date.now(), icon: "🏅", title: "New badge awarded", detail: "You received the " + badge + " badge." });
          }
        });
        notificationInitialBadges = next;
      });
      const channelsRef = db.ref("privateChannels");
      watchNotification(channelsRef, "value", snap => {
        const all = snap.val() || {};
        const next = {};
        Object.entries(all).forEach(([channelId, channel]) => {
          if (channel && channel.members && channel.members[uid] === true) next[channelId] = channel;
        });
        if (notificationInitialChannels !== null) {
          Object.entries(next).forEach(([channelId, channel]) => {
            if (!notificationInitialChannels[channelId]) addChirpNotification({ id: "private-channel:" + channelId, icon: "💬", title: "Private channel invitation", detail: "You now have access to #" + (channel.name || "private"), action: "channel", channel: channelId });
          });
        }
        notificationInitialChannels = next;
      });
      const channelIds = new Set(["general"]);
      Object.keys(privateChannels).forEach(id => channelIds.add(id));
      channelIds.forEach(channelId => {
        const ref = db.ref("messages/" + channelId).limitToLast(60);
        const handler = snap => {
          const msg = snap.val();
          if (!msg || !msg.timestamp || msg.timestamp < notificationSessionStart) return;
          if (msg.uid === uid) {
            notificationOwnMessageChannels[snap.key] = channelId;
            return;
          }
          const mentioned = Array.isArray(msg.mentions) ? msg.mentions : (msg.mentions && typeof msg.mentions === "object" ? Object.values(msg.mentions) : []);
          if (mentioned.includes(uid)) addChirpNotification({ id: "mention:" + channelId + ":" + snap.key, icon: "📣", title: "You were mentioned", detail: (msg.user || msg.username || "Someone") + " mentioned you in #" + (privateChannels[channelId]?.name || channelId), action: "channel", channel: channelId, timestamp: msg.timestamp });
          if (msg.replyTo && msg.replyTo.key && notificationOwnMessageChannels[msg.replyTo.key]) {
            const targetChannel = msg.replyTo.channel || notificationOwnMessageChannels[msg.replyTo.key];
            addChirpNotification({ id: "reply:" + channelId + ":" + snap.key, icon: "↩️", title: "Someone replied to your message", detail: (msg.user || msg.username || "Someone") + " replied in #" + (privateChannels[channelId]?.name || channelId), action: "channel", channel: targetChannel, timestamp: msg.timestamp });
          }
        };
        watchNotification(ref, "child_added", handler);
      });
      renderNotificationCenter();
    }
    notificationButton.addEventListener("click", () => {
      const opening = notificationCenter.classList.contains("hidden");
      notificationCenter.classList.toggle("hidden", !opening);
      notificationButton.setAttribute("aria-expanded", opening ? "true" : "false");
    });
    document.getElementById("close-notifications").addEventListener("click", () => {
      notificationCenter.classList.add("hidden");
      notificationButton.setAttribute("aria-expanded", "false");
    });
    document.getElementById("mark-notifications-read").addEventListener("click", () => {
      notificationItems.forEach(item => notificationReadIds.add(item.id));
      saveNotificationReadState();
      renderNotificationCenter();
    });
    document.addEventListener("click", event => {
      if (!notificationCenter.contains(event.target) && !notificationButton.contains(event.target)) {
        notificationCenter.classList.add("hidden");
        notificationButton.setAttribute("aria-expanded", "false");
      }
    });

    auth.onAuthStateChanged(async (user) => {
      if (user) {
        if (await checkIfBanned(user.uid)) {
          alert("You are banned from this chat.");
          await auth.signOut();
          return;
        }
        const deviceId = getDeviceId();
        const deviceBanned = await db.ref("bannedDevices/" + deviceId).once("value");
        if (deviceBanned.val() === true) {
          alert("This device is banned.");
          await auth.signOut();
          return;
        }
        await claimDevice(user.uid).catch(() => {});
        [currentUserIsAdmin, currentUserIsModerator, currentUserIsJuniorModerator] = await Promise.all([
          checkIfAdmin(user.uid),
          checkIfModerator(user.uid),
          checkIfJuniorModerator(user.uid)
        ]);
        watchSidebarBadges(user);
        authView.classList.add("hidden");
        chatView.classList.remove("hidden");
        const display = user.displayName || (user.email || "").split("@")[0];
        let rank = "";
        if (currentUserIsAdmin) rank = " (Admin)";
        else if (currentUserIsJuniorModerator) rank = " (J Moderator)";
        else if (currentUserIsModerator) rank = " (Mod)";
        userInfo.textContent = display + rank;
        userInfo.classList.toggle("junior-moderator", currentUserIsJuniorModerator && !currentUserIsAdmin);

        const canModerate = currentUserIsAdmin || (currentUserIsModerator && !currentUserIsJuniorModerator);
        document.querySelectorAll(".admin-only").forEach(el => {
          el.classList.toggle("hidden", !canModerate);
        });
        if (currentChannel === "moderation" && !canModerate) currentChannel = "general";

        const userRef = db.ref("users/" + user.uid);
        userRef.update({
          name: display || "User",
          username: (user.email || "").split("@")[0] || "user",
          online: true,
          lastSeen: Date.now()
        });
        userRef.onDisconnect().update({ online: false, lastSeen: Date.now() });

        db.ref("users/" + user.uid + "/banned").on("value", (snap) => {
          if (snap.exists() && snap.val() === true) {
            alert("You have been banned from this chat.");
            auth.signOut().then(() => location.reload());
          }
        });

        loadOnlineUsers();
        await loadServerConfig();
        startPingListeners(user.uid);
        watchPrivateChannels();
        startNotificationCenter(user.uid);
        if (currentChannel === "moderation") showModerationPanel();
        else loadMessages();
        updateAdminTools();
      } else {
        authView.classList.remove("hidden");
        chatView.classList.add("hidden");
        messagesDiv.innerHTML = "";
        userList.innerHTML = "";
        profileRequestCounter += 1;
        profilePanel.classList.remove("active");
        profilePanel.replaceChildren();
        moderationPanel.classList.remove("active");
        currentUserIsAdmin = false;
        currentUserIsModerator = false;
        currentUserIsJuniorModerator = false;
        userInfo.classList.remove("junior-moderator");
        usersCache = {};
        stopPingListeners();
        stopNotificationCenter();
        db.ref("privateChannels").off();
        privateChannels = {};
        setReplyTarget(null);
        watchSidebarBadges(null);
        syncMessageComposerState();
      }
    });

    document.getElementById("logout-btn").addEventListener("click", async () => {
      await releaseAllTemporaryChannelAccess();
      await auth.signOut();
    });

    document.getElementById("channels").addEventListener("click", async (event) => {
      const el = event.target.closest(".channel");
      if (!el) return;
      const requested = el.dataset.channel;
      const previousChannel = currentChannel;
      const canModerate = currentUserIsAdmin || (currentUserIsModerator && !currentUserIsJuniorModerator);
      if (requested === "moderation" && !canModerate) {
        currentChannel = "general";
        if (temporaryPrivateChannelAccess.has(previousChannel)) await releaseTemporaryChannelAccess(previousChannel);
        document.querySelectorAll(".channel").forEach(c => c.classList.toggle("active", c.dataset.channel === "general"));
        showChatPanel();
        document.getElementById("current-channel").textContent = "# general";
        loadMessages();
        return;
      }
      document.querySelectorAll(".channel").forEach(c => c.classList.toggle("active", c === el));
      if (requested === "profile") {
        // Keep the current channel as the return destination while the Profile
        // panel is open. Temporary access is released when the user leaves it.
        if (auth.currentUser) openUserProfile(auth.currentUser.uid, true);
        return;
      }
      currentChannel = requested;
      if (previousChannel !== requested && temporaryPrivateChannelAccess.has(previousChannel)) {
        await releaseTemporaryChannelAccess(previousChannel);
      }
      document.getElementById("current-channel").textContent = "# " + (privateChannels[requested]?.name || currentChannel);
      if (currentChannel === "moderation") {
        showModerationPanel();
      } else {
        hideModerationPanel();
        showChatPanel();
        loadMessages();
        updateInviteButton();
        updateAdminTools();
      }
    });

    document.getElementById("add-channel-btn").addEventListener("click", createPrivateChannel);

    function canSendMessages() {
      const isPublic = PUBLIC_CHANNELS.includes(currentChannel);
      const isPrivateMember = !!privateChannels[currentChannel];
      return !!auth.currentUser && (isPublic || isPrivateMember) &&
        !profilePanel.classList.contains("active") &&
        !moderationPanel.classList.contains("active") &&
        !messageForm.classList.contains("hidden");
    }

    function syncMessageComposerState() {
      const enabled = canSendMessages();
      const input = document.getElementById("message-input");
      const send = document.getElementById("send-btn");
      if (input) input.disabled = !enabled;
      if (send) send.disabled = !enabled;
      if (messageForm) messageForm.setAttribute("aria-disabled", String(!enabled));
      updateInviteButton();
      updateAdminTools();
    }

    function updateAdminTools() {
      const clearBtn = document.getElementById("clear-general-btn");
      if (!clearBtn) return;
      clearBtn.classList.toggle("hidden", !(currentUserIsAdmin && currentChannel === "general"));
    }

    async function clearGeneral() {
      if (!currentUserIsAdmin || currentChannel !== "general") return;
      if (!confirm("Delete all messages")) return;
      const snap = await db.ref("messages/general").once("value");
      const updates = {};
      snap.forEach(child => {
        const msg = child.val();
        if (!msg || msg.pinned === true) return;
        updates[child.key] = null;
      });
      if (!Object.keys(updates).length) {
        alert("No messages to delete.");
        return;
      }
      await db.ref("messages/general").update(updates);
    }

    document.getElementById("clear-general-btn").addEventListener("click", () => {
      clearGeneral().catch(err => {
        console.error(err);
        alert("Couldn't clear messages.");
      });
    });

    function updateInviteButton() {
      ["invite-btn", "rename-btn", "delete-channel-btn", "kick-member-btn", "leave-channel-btn"].forEach(id => {
        const existing = document.getElementById(id);
        if (existing) existing.remove();
      });
      const header = document.getElementById("chat-header");
      const holder = header && header.querySelector("div");
      const channel = privateChannels[currentChannel];
      const user = auth.currentUser;
      if (!holder || !channel || !user || !channel.members || channel.members[user.uid] !== true) return;
      const isOwner = channel.owner === user.uid;
      const makeBtn = (id, label, onClick, bg) => {
        const btn = document.createElement("button");
        btn.id = id;
        btn.type = "button";
        btn.textContent = label;
        btn.style.cssText = "margin-right: 8px; background: " + bg + "; color: #fff; border: 0; border-radius: 4px; padding: 6px 10px; cursor: pointer;";
        btn.onclick = onClick;
        holder.prepend(btn);
      };
      if (isOwner) {
        makeBtn("delete-channel-btn", "Delete", deleteCurrentChannel, "#e74c3c");
        makeBtn("rename-btn", "Rename", renameCurrentChannel, "#333");
        makeBtn("invite-btn", "Invite", inviteToCurrentChannel, "#333");
        makeBtn("kick-member-btn", "Kick", kickMemberFromCurrentChannel, "#b83232");
      } else {
        makeBtn("leave-channel-btn", "Leave", leaveCurrentChannel, "#b83232");
      }
    }

    async function kickMemberFromCurrentChannel() {
      const user = auth.currentUser;
      const channelId = currentChannel;
      const channel = privateChannels[channelId];
      if (!user || !channel || channel.owner !== user.uid) return;

      try {
        const memberIds = Object.entries(channel.members || {})
          .filter(([uid, isMember]) => uid !== channel.owner && isMember === true)
          .map(([uid]) => uid);
        if (!memberIds.length) {
          alert("There are no other members to kick.");
          return;
        }
        const usersSnap = await db.ref("users").once("value");
        const users = usersSnap.val() || {};
        const members = memberIds.map(uid => ({
          uid,
          username: String((users[uid] && (users[uid].username || users[uid].name)) || uid)
        }));
        const roster = members.map(member => member.username).join(", ");
        const wanted = prompt("Enter the username of the member to kick from #" + (channel.name || channelId) + ".\nMembers: " + roster);
        if (!wanted) return;
        const normalized = wanted.trim().toLowerCase().replace(/^@/, "");
        const target = members.find(member => member.username.toLowerCase() === normalized);
        if (!target) {
          alert("No channel member matched that username. Use one of: " + roster);
          return;
        }
        if (!confirm("Kick " + target.username + " from this channel? They can be invited again later.")) return;
        await db.ref("privateChannels/" + channelId + "/members/" + target.uid).remove();
        alert(target.username + " was kicked from the channel.");
      } catch (err) {
        console.error(err);
        alert("Couldn't kick that member. Check your Firebase rules and try again.");
      }
    }

    async function leaveCurrentChannel() {
      const user = auth.currentUser;
      const channelId = currentChannel;
      const channel = privateChannels[channelId];
      if (!user || !channel || channel.owner === user.uid || !channel.members || channel.members[user.uid] !== true) return;
      if (!confirm("Leave #" + (channel.name || channelId) + "? You will need an invitation to rejoin.")) return;
      try {
        await db.ref("privateChannels/" + channelId + "/members/" + user.uid).remove();
        currentChannel = "general";
        document.querySelectorAll(".channel").forEach(el => el.classList.toggle("active", el.dataset.channel === "general"));
        document.getElementById("current-channel").textContent = "# general";
        showChatPanel();
        loadMessages();
      } catch (err) {
        console.error(err);
        alert("Couldn't leave this channel. Check your Firebase rules and try again.");
      }
    }

    async function renameCurrentChannel() {
      if (!auth.currentUser) return;
      const channel = privateChannels[currentChannel];
      if (!channel || channel.owner !== auth.currentUser.uid) return;
      const name = prompt("New channel name:", channel.name || "");
      if (!name) return;
      const clean = name.trim().replace(/^#+/, "");
      if (!/^[a-zA-Z0-9 _-]{2,20}$/.test(clean)) {
        alert("Use 2–20 letters, numbers, spaces, - or _.");
        return;
      }
      try {
        await db.ref("privateChannels/" + currentChannel + "/name").set(clean);
        document.getElementById("current-channel").textContent = "# " + clean;
      } catch (err) {
        console.error(err);
        alert("Couldn't rename the channel.");
      }
    }

    async function deleteCurrentChannel() {
      if (!auth.currentUser) return;
      const channel = privateChannels[currentChannel];
      if (!channel || channel.owner !== auth.currentUser.uid) return;
      if (!confirm("Delete this channel and its messages? This cannot be undone.")) return;
      try {
        await db.ref("privateChannels/" + currentChannel).remove();
        await db.ref("messages/" + currentChannel).remove();
        currentChannel = "general";
        document.querySelectorAll(".channel").forEach(c => c.classList.toggle("active", c.dataset.channel === "general"));
        document.getElementById("current-channel").textContent = "# general";
        showChatPanel();
        loadMessages();
      } catch (err) {
        console.error(err);
        alert("Channel Deleted!");
      }
    }

    async function createPrivateChannel() {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;
      const existing = await db.ref("privateChannels/" + uid).once("value");
      if (existing.exists()) {
        alert("You can only make 1 channel.");
        return;
      }
      const name = prompt("Channel name (letters, numbers, spaces, 2–20 characters):");
      if (!name) return;
      const clean = name.trim().replace(/^#+/, "");
      if (!/^[a-zA-Z0-9 _-]{2,20}$/.test(clean)) {
        alert("Use 2–20 letters, numbers, spaces, - or _.");
        return;
      }
      try {
        await db.ref("privateChannels/" + uid).set({
          name: clean,
          owner: uid,
          createdAt: Date.now(),
          members: { [uid]: true }
        });
        alert("Private channel created. Only people you invite can see it.");
      } catch (err) {
        console.error(err);
        alert("Couldn't create channel. Publish the new rules if you see PERMISSION_DENIED.");
      }
    }

    async function inviteToCurrentChannel() {
      if (!auth.currentUser) return;
      const channelId = currentChannel;
      const channel = privateChannels[channelId];
      if (!channel || channel.owner !== auth.currentUser.uid) return;
      const username = prompt("Username to invite:");
      if (!username) return;
      const wanted = username.trim().toLowerCase().replace(/^@/, "");
      const usersSnap = await db.ref("users").once("value");
      const users = usersSnap.val() || {};
      const match = Object.entries(users).find(([, u]) => String(u.username || "").toLowerCase() === wanted);
      if (!match) {
        alert("No user found with that username.");
        return;
      }
      const [inviteUid, inviteUser] = match;
      try {
        await db.ref("privateChannels/" + channelId + "/members/" + inviteUid).set(true);
        alert((inviteUser.name || inviteUser.username || "User") + " was invited.");
      } catch (err) {
        console.error(err);
        alert("Couldn't invite that user.");
      }
    }

    function renderPrivateChannels() {
      const list = document.getElementById("channels");
      list.querySelectorAll(".private-channel").forEach(el => el.remove());
      Object.entries(privateChannels).forEach(([id, channel]) => {
        const el = document.createElement("div");
        el.className = "channel private-channel";
        el.dataset.channel = id;
        el.textContent = "# " + (channel.name || "private");
        if (temporaryPrivateChannelAccess.has(id)) el.title = "Temporary admin access — leaving this channel removes your temporary membership";
        if (id === currentChannel) el.classList.add("active");
        list.appendChild(el);
      });
    }

    async function seePrivateChannelAsAdmin(channelId) {
      const user = auth.currentUser;
      if (!user) return;
      if (!(await verifyFreshRole("admin"))) {
        alert("Only verified admins can temporarily view private channels.");
        return;
      }

      const channelRef = db.ref("privateChannels/" + channelId);
      try {
        const channelSnap = await channelRef.once("value");
        const channelData = channelSnap.val();
        if (!channelData || typeof channelData !== "object") {
          alert("That private channel no longer exists.");
          await renderModerationList();
          return;
        }

        const memberRef = channelRef.child("members/" + user.uid);
        const memberSnap = await memberRef.once("value");
        const alreadyMember = memberSnap.val() === true;
        if (!alreadyMember) {
          // Schedule automatic cleanup first so temporary access is removed if
          // this browser closes unexpectedly, then grant this admin membership.
          await memberRef.onDisconnect().remove();
          try {
            await memberRef.set(true);
            temporaryPrivateChannelAccess.add(channelId);
          } catch (err) {
            await memberRef.onDisconnect().cancel().catch(() => {});
            throw err;
          }
        }

        const confirmedSnap = await channelRef.once("value");
        const confirmed = confirmedSnap.val();
        if (!confirmed || !confirmed.members || confirmed.members[user.uid] !== true) {
          if (temporaryPrivateChannelAccess.has(channelId)) await releaseTemporaryChannelAccess(channelId);
          alert("Chirp couldn't confirm your channel access. Check your Firebase Realtime Database Rules.");
          return;
        }

        privateChannels[channelId] = confirmed;
        currentChannel = channelId;
        renderPrivateChannels();
        document.querySelectorAll(".channel").forEach(el => el.classList.toggle("active", el.dataset.channel === channelId));
        document.getElementById("current-channel").textContent = "# " + (confirmed.name || "private");
        hideModerationPanel();
        showChatPanel();
        loadMessages();
        updateInviteButton();
        updateAdminTools();
      } catch (err) {
        console.error("Couldn't open private channel as admin:", err);
        alert("Couldn't access that channel: " + (err.code || err.message || "unknown error") + ". Make sure your Firebase rules allow a signed-in user to write their own membership at privateChannels/{channelId}/members/{yourUid}.");
      }
    }

    async function releaseTemporaryChannelAccess(channelId) {
      if (!temporaryPrivateChannelAccess.has(channelId)) return true;
      const user = auth.currentUser;
      if (!user) return false; // onDisconnect will remove the temporary membership.
      const memberRef = db.ref("privateChannels/" + channelId + "/members/" + user.uid);
      try {
        // Remove first; if the tab disconnects during cleanup, the scheduled
        // onDisconnect remove remains harmless. Cancel it after removal succeeds.
        await memberRef.remove();
        await memberRef.onDisconnect().cancel().catch(() => {});
        temporaryPrivateChannelAccess.delete(channelId);
        delete privateChannels[channelId];
        renderPrivateChannels();
        return true;
      } catch (err) {
        console.warn("Could not remove temporary channel membership; onDisconnect cleanup is still scheduled.", err);
        return false;
      }
    }

    async function releaseAllTemporaryChannelAccess() {
      const ids = [...temporaryPrivateChannelAccess];
      for (const id of ids) await releaseTemporaryChannelAccess(id);
    }

    function watchPrivateChannels() {
      db.ref("privateChannels").on("value", (snap) => {
        const all = snap.val() || {};
        const uid = auth.currentUser && auth.currentUser.uid;
        const wasViewingPrivateChannel = !!privateChannels[currentChannel];
        const nextChannels = {};
        Object.entries(all).forEach(([id, channel]) => {
          if (channel && channel.members && uid && channel.members[uid] === true) {
            nextChannels[id] = channel;
          }
        });
        privateChannels = nextChannels;
        renderPrivateChannels();

        // If the owner kicks the current user, or the channel is deleted,
        // move them out of the now-inaccessible channel immediately.
        if (wasViewingPrivateChannel && !privateChannels[currentChannel]) {
          const lostChannelId = currentChannel;
          if (temporaryPrivateChannelAccess.has(lostChannelId)) {
            temporaryPrivateChannelAccess.delete(lostChannelId);
            const uid = auth.currentUser && auth.currentUser.uid;
            if (uid) db.ref("privateChannels/" + lostChannelId + "/members/" + uid).onDisconnect().cancel().catch(() => {});
          }
          currentChannel = "general";
          document.querySelectorAll(".channel").forEach(el => el.classList.toggle("active", el.dataset.channel === "general"));
          document.getElementById("current-channel").textContent = "# general";
          showChatPanel();
          loadMessages();
        } else {
          syncMessageComposerState();
          updateInviteButton();
        }
      });
    }

    function showChatPanel() {
      profilePanel.classList.remove("active", "editing");
      moderationPanel.classList.remove("active");
      moderationPanel.innerHTML = "";
      messagesDiv.classList.remove("hidden");
      messageForm.classList.remove("hidden");
      syncMessageComposerState();
    }

    function showModerationPanel() {
      if (!currentUserIsAdmin && (!currentUserIsModerator || currentUserIsJuniorModerator)) {
        currentChannel = "general";
        document.querySelectorAll(".channel").forEach(el => el.classList.toggle("active", el.dataset.channel === "general"));
        showChatPanel();
        document.getElementById("current-channel").textContent = "# general";
        loadMessages();
        return;
      }
      messagesDiv.classList.add("hidden");
      messageForm.classList.add("hidden");
      profilePanel.classList.remove("active", "editing");
      moderationPanel.classList.add("active");
      syncMessageComposerState();
      renderModerationList();
    }

    function hideModerationPanel() {
      moderationPanel.classList.remove("active");
      moderationPanel.innerHTML = "";
    }

    function restorePreviousView() {
      profileRequestCounter += 1; // Ignore any profile request that is still loading.
      document.querySelectorAll(".channel").forEach(el => {
        el.classList.toggle("active", el.dataset.channel === currentChannel);
      });
      if (currentChannel === "moderation") {
        document.getElementById("current-channel").textContent = "# moderation";
        showModerationPanel();
      } else {
        document.getElementById("current-channel").textContent = "# " + currentChannel;
        showChatPanel();
        loadMessages();
      }
    }

    function makeReportModal(titleText) {
      document.getElementById("admin-report-modal")?.remove();
      const overlay = document.createElement("div");
      overlay.id = "admin-report-modal";
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:12000;display:flex;align-items:center;justify-content:center;padding:16px;";
      const modal = document.createElement("section");
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.style.cssText = "background:#14171d;border:1px solid #303743;border-radius:12px;padding:20px;width:min(620px,100%);max-height:88vh;overflow-y:auto;box-shadow:0 14px 55px rgba(0,0,0,.55);color:#eee;";
      const header = document.createElement("div");
      header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;";
      const title = document.createElement("h2");
      title.textContent = titleText;
      title.style.cssText = "margin:0;font-size:19px;color:#f5f6f8;overflow-wrap:anywhere;";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.style.cssText = "border:1px solid #424956;border-radius:6px;padding:7px 10px;background:#242a33;color:#eee;cursor:pointer;flex:0 0 auto;";
      close.addEventListener("click", () => overlay.remove());
      header.append(title, close);
      modal.appendChild(header);
      overlay.appendChild(modal);
      overlay.addEventListener("click", event => { if (event.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
      return { overlay, modal };
    }

    async function openAdminReportForm() {
      const currentAtOpen = auth.currentUser;
      if (!currentAtOpen) return;

      // A user may keep only one active report. The pointer is readable only by its owner/admins.
      try {
        const activeSnap = await db.ref("activeReports/" + currentAtOpen.uid).once("value");
        const activeReportId = activeSnap.val();
        if (activeReportId) {
          const existingSnap = await db.ref("reportInbox/" + currentAtOpen.uid + "/" + activeReportId).once("value");
          const existing = existingSnap.val() || {};
          const { overlay, modal } = makeReportModal("Your active report");
          const message = document.createElement("p");
          message.style.cssText = "margin:0;color:#c4cad3;font-size:13px;line-height:1.6;overflow-wrap:anywhere;";
          const labels = { open: "Waiting for an admin", reviewed: "Under review", responded: "An admin has responded", completed: "Marked complete", dismissed: "Dismissed" };
          message.textContent = existing.status
            ? "You already have an active report. Status: " + (labels[existing.status] || existing.status) + ". You can send another report after this one is dismissed."
            : "You already have an active report awaiting review. You can send another after an admin dismisses it.";
          modal.appendChild(message);
          if (existing.adminResponse) {
            const response = document.createElement("p");
            response.style.cssText = "margin:12px 0 0;padding:10px 0 0;border-top:1px solid #303743;color:#a2f56a;font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;";
            response.textContent = "Admin response: " + String(existing.adminResponse);
            modal.appendChild(response);
          }
          return;
        }
      } catch (err) {
        console.error("Could not check active report:", err);
        alert("Couldn't check your report status. Publish the updated Firebase rules and try again.");
        return;
      }

      const { overlay, modal } = makeReportModal("Report a player");
      const intro = document.createElement("p");
      intro.textContent = "Enter the player's username. Reports are sent to the admin team for review. Please include specific, accurate details.";
      intro.style.cssText = "margin:0 0 14px;color:#aab1bc;font-size:13px;line-height:1.5;";
      const form = document.createElement("form");
      form.style.cssText = "display:grid;gap:12px;";
      const makeLabel = text => {
        const label = document.createElement("label");
        label.textContent = text;
        label.style.cssText = "display:grid;gap:7px;color:#c4cad3;font-size:13px;";
        return label;
      };
      const fieldStyle = "width:100%;padding:10px 11px;background:#0b0d11;border:1px solid #343b47;border-radius:6px;color:#f1f3f5;font:inherit;";
      const usernameLabel = makeLabel("Player username");
      const usernameInput = document.createElement("input");
      usernameInput.type = "text";
      usernameInput.name = "targetUsername";
      usernameInput.autocomplete = "off";
      usernameInput.maxLength = 64;
      usernameInput.required = true;
      usernameInput.placeholder = "Enter username (without @)";
      usernameInput.style.cssText = fieldStyle;
      usernameLabel.appendChild(usernameInput);
      const reasonLabel = makeLabel("Reason for report");
      const reason = document.createElement("select");
      reason.required = true;
      reason.style.cssText = fieldStyle;
      ["Harassment or abuse", "Threats or intimidation", "Spam or disruptive behavior", "Impersonation", "Inappropriate content", "Other"].forEach(text => {
        const option = document.createElement("option");
        option.value = text;
        option.textContent = text;
        reason.appendChild(option);
      });
      reasonLabel.appendChild(reason);
      const detailsLabel = makeLabel("What happened? (10–1000 characters)");
      const details = document.createElement("textarea");
      details.required = true;
      details.minLength = 10;
      details.maxLength = 1000;
      details.rows = 5;
      details.placeholder = "Describe what happened, and include relevant context…";
      details.style.cssText = fieldStyle + "min-height:110px;resize:vertical;";
      detailsLabel.appendChild(details);
      const status = document.createElement("div");
      status.setAttribute("aria-live", "polite");
      status.style.cssText = "min-height:18px;color:#a2f56a;font-size:12px;overflow-wrap:anywhere;";
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;";
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Send report";
      submit.style.cssText = "border:0;border-radius:6px;padding:10px 14px;background:#e74c3c;color:#fff;font-weight:700;cursor:pointer;";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.style.cssText = "border:1px solid #424956;border-radius:6px;padding:10px 14px;background:#242a33;color:#eee;cursor:pointer;";
      cancel.addEventListener("click", () => overlay.remove());
      actions.append(submit, cancel);
      form.append(usernameLabel, reasonLabel, detailsLabel, status, actions);
      modal.append(intro, form);
      usernameInput.focus();

      form.addEventListener("submit", async event => {
        event.preventDefault();
        const current = auth.currentUser;
        if (!current) return;
        const enteredUsername = usernameInput.value.trim().replace(/^@+/, "");
        const normalizedUsername = enteredUsername.toLocaleLowerCase();
        const reportDetails = details.value.trim();
        if (!enteredUsername) {
          status.style.color = "#ff8d8d";
          status.textContent = "Enter the username of the player you want to report.";
          return;
        }
        if (reportDetails.length < 10 || reportDetails.length > 1000) {
          status.style.color = "#ff8d8d";
          status.textContent = "Please enter between 10 and 1000 characters.";
          return;
        }
        submit.disabled = true;
        submit.textContent = "Sending…";
        status.style.color = "#a2f56a";
        status.textContent = "Finding player and sending report…";
        let activeRef = null;
        let lockAcquired = false;
        let reportId = null;
        try {
          const usersSnap = await db.ref("users").once("value");
          let target = null;
          usersSnap.forEach(child => {
            const record = child.val() || {};
            const candidate = String(record.username || (record.email ? String(record.email).split("@")[0] : "") || "").trim().replace(/^@+/, "");
            if (candidate && candidate.toLocaleLowerCase() === normalizedUsername) {
              target = { uid: child.key, data: record, username: candidate };
              return true;
            }
            return false;
          });
          if (!target) throw new Error("No player was found with that username. Check the spelling and try again.");
          if (target.uid === current.uid) throw new Error("You cannot report your own account.");

          const reporterSnap = await db.ref("users/" + current.uid).once("value");
          const reporterData = reporterSnap.val() || {};
          const reporterName = displayNameFromUser(reporterData, current.uid) || current.displayName || (current.email || "").split("@")[0] || "Unknown user";
          const targetName = displayNameFromUser(target.data, target.uid);
          const reportRef = db.ref("adminReports").push();
          reportId = reportRef.key;
          activeRef = db.ref("activeReports/" + current.uid);

          // The transaction prevents two tabs from submitting separate active reports at once.
          const lock = await activeRef.transaction(existingId => {
            if (existingId === null || existingId === undefined) return reportId;
            return;
          });
          if (!lock.committed) throw new Error("You already have an active report. Wait until an admin responds or completes and dismisses it.");
          lockAcquired = true;

          const record = {
            reporterUid: current.uid,
            reporterName,
            targetUid: target.uid,
            targetName,
            targetUsername: target.username,
            reason: reason.value,
            details: reportDetails,
            createdAt: Date.now(),
            status: "open"
          };
          const updates = {};
          updates["adminReports/" + reportId] = record;
          updates["reportInbox/" + current.uid + "/" + reportId] = record;
          await db.ref().update(updates);

          status.textContent = "Report sent successfully to the admin team.";
          status.style.color = "#a2f56a";
          submit.textContent = "Report sent";
          usernameInput.disabled = true;
          reason.disabled = true;
          details.disabled = true;
          submit.disabled = true;
          cancel.textContent = "Close";
          cancel.onclick = () => overlay.remove();
        } catch (err) {
          console.error("Could not submit player report:", err);
          // If report creation failed after acquiring the lock, remove only the orphan lock.
          if (lockAcquired && activeRef) {
            try {
              // Deleting is allowed by the rules only when the referenced report was not created.
              // A non-admin client cannot read adminReports directly, so do not query that path here.
              await activeRef.remove();
            } catch (cleanupErr) {
              console.warn("Could not release orphan active-report lock:", cleanupErr);
            }
          }
          status.style.color = "#ff8d8d";
          status.textContent = err && err.message && (err.message.startsWith("No player") || err.message.startsWith("You cannot") || err.message.startsWith("You already have"))
            ? err.message
            : "Couldn't send the report. Publish the updated Firebase rules and try again.";
          submit.disabled = false;
          submit.textContent = "Send report";
        }
      });
    }

    async function openAdminReports() {
      const current = auth.currentUser;
      if (!current || !(await checkIfAdmin(current.uid))) {
        alert("Only admins can view reports.");
        return;
      }
      const { overlay, modal } = makeReportModal("Admin Reports");
      const statusLine = document.createElement("p");
      statusLine.textContent = "Loading reports…";
      statusLine.style.cssText = "color:#aab1bc;font-size:13px;margin:0;";
      modal.appendChild(statusLine);

      const actionButton = (label, background, foreground = "#fff") => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText = "border:0;border-radius:5px;padding:7px 10px;background:" + background + ";color:" + foreground + ";font-weight:700;cursor:pointer;";
        return button;
      };

      async function saveReportChange(report, patch, dismiss = false) {
        const actor = auth.currentUser;
        if (!actor || !(await checkIfAdmin(actor.uid))) throw new Error("Admin access required");
        const updates = {};
        Object.entries(patch).forEach(([key, value]) => {
          updates["adminReports/" + report.id + "/" + key] = value;
        });
        // Mirror status/response in the reporter's private inbox so they can see admin replies.
        const inboxRef = db.ref("reportInbox/" + report.reporterUid + "/" + report.id);
        const inboxSnap = await inboxRef.once("value");
        if (inboxSnap.exists()) {
          Object.entries(patch).forEach(([key, value]) => {
            updates["reportInbox/" + report.reporterUid + "/" + report.id + "/" + key] = value;
          });
        }
        if (dismiss) {
          const activeRef = db.ref("activeReports/" + report.reporterUid);
          const activeSnap = await activeRef.once("value");
          if (activeSnap.val() === report.id) updates["activeReports/" + report.reporterUid] = null;
        }
        await db.ref().update(updates);
      }

      async function runReportAction(button, report, patch, dismiss = false) {
        button.disabled = true;
        const oldLabel = button.textContent;
        button.textContent = "Saving…";
        try {
          await saveReportChange(report, patch, dismiss);
          overlay.remove();
          await openAdminReports();
        } catch (err) {
          console.error("Could not update report:", err);
          button.disabled = false;
          button.textContent = oldLabel;
          alert("Couldn't update this report. Publish the updated Firebase rules and try again.");
        }
      }

      try {
        const snapshot = await db.ref("adminReports").once("value");
        if (!auth.currentUser || !(await checkIfAdmin(auth.currentUser.uid))) {
          overlay.remove();
          alert("Only admins can view reports.");
          return;
        }
        const reports = [];
        snapshot.forEach(child => {
          const value = child.val();
          if (value && typeof value === "object" && value.status !== "dismissed") reports.push({ id: child.key, ...value });
        });
        reports.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        statusLine.remove();
        if (!reports.length) {
          const empty = document.createElement("p");
          empty.textContent = "No active reports. Dismissed reports are hidden from this list.";
          empty.style.cssText = "color:#aab1bc;font-size:13px;margin:0;";
          modal.appendChild(empty);
          return;
        }

        const list = document.createElement("div");
        list.style.cssText = "display:grid;gap:12px;";
        reports.forEach(report => {
          const card = document.createElement("article");
          card.style.cssText = "padding:13px;border:1px solid #303743;background:#0d1015;border-radius:8px;min-width:0;display:grid;gap:9px;";
          const top = document.createElement("div");
          top.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;";
          const heading = document.createElement("div");
          heading.style.cssText = "font-size:14px;font-weight:700;color:#f4f6f8;overflow-wrap:anywhere;";
          heading.textContent = String(report.reason || "Report");
          const badge = document.createElement("span");
          const state = String(report.status || "open");
          const stateLabels = { open: "OPEN", reviewed: "REVIEWED", responded: "RESPONDED", completed: "COMPLETED" };
          const stateColors = { open: "#ffb0a8;background:#3a1c1b;", reviewed: "#aab1bc;background:#252a32;", responded: "#a8d8ff;background:#173149;", completed: "#a2f56a;background:#20321a;" };
          badge.textContent = stateLabels[state] || state.toUpperCase();
          badge.style.cssText = "padding:4px 7px;border-radius:5px;font-size:10px;font-weight:800;letter-spacing:.06em;color:" + (stateColors[state] || stateColors.open);
          top.append(heading, badge);
          const meta = document.createElement("div");
          meta.style.cssText = "font-size:12px;color:#aab1bc;line-height:1.5;overflow-wrap:anywhere;";
          const dateText = Number.isFinite(Number(report.createdAt)) && Number(report.createdAt) > 0 ? new Date(Number(report.createdAt)).toLocaleString() : "Unknown date";
          meta.textContent = "From " + String(report.reporterName || "Unknown user") + " · About " + String(report.targetUsername ? "@" + report.targetUsername : (report.targetName || report.targetAdminName || "Unknown player")) + " · " + dateText;
          const detail = document.createElement("p");
          detail.textContent = String(report.details || "No details provided.");
          detail.style.cssText = "margin:0;color:#e0e4e9;font-size:13px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;";
          card.append(top, meta, detail);

          if (report.adminResponse) {
            const responseView = document.createElement("p");
            responseView.style.cssText = "margin:0;padding-top:8px;border-top:1px solid #303743;color:#a2f56a;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;";
            responseView.textContent = "Admin response: " + String(report.adminResponse);
            card.appendChild(responseView);
          }

          const responseLabel = document.createElement("label");
          responseLabel.textContent = report.adminResponse ? "Update response" : "Reply to reporter";
          responseLabel.style.cssText = "display:grid;gap:6px;color:#c4cad3;font-size:12px;";
          const responseInput = document.createElement("textarea");
          responseInput.rows = 3;
          responseInput.maxLength = 1000;
          responseInput.value = String(report.adminResponse || "");
          responseInput.placeholder = "Write a response to the person who submitted this report…";
          responseInput.style.cssText = "width:100%;box-sizing:border-box;resize:vertical;padding:9px 10px;border:1px solid #343b47;border-radius:6px;background:#0b0d11;color:#f1f3f5;font:inherit;line-height:1.45;";
          responseLabel.appendChild(responseInput);
          card.appendChild(responseLabel);

          const actions = document.createElement("div");
          actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;";
          const respond = actionButton(report.adminResponse ? "Save response" : "Send response", "#8bd450", "#101010");
          respond.addEventListener("click", async () => {
            const responseText = responseInput.value.trim();
            if (responseText.length < 2 || responseText.length > 1000) {
              alert("Please enter a response between 2 and 1000 characters.");
              return;
            }
            const actor = auth.currentUser;
            if (!actor) return;
            await runReportAction(respond, report, {
              adminResponse: responseText,
              respondedAt: Date.now(),
              respondedBy: actor.uid,
              status: "responded"
            });
          });
          actions.appendChild(respond);

          if (state !== "completed") {
            const complete = actionButton("Mark complete", "#303743", "#f5f6f8");
            complete.addEventListener("click", async () => {
              const actor = auth.currentUser;
              if (!actor) return;
              await runReportAction(complete, report, { status: "completed", completedAt: Date.now(), completedBy: actor.uid });
            });
            actions.appendChild(complete);
          }

          if (state === "responded" || state === "completed") {
            const dismiss = actionButton("Dismiss report", "#242a33", "#e5e9ef");
            dismiss.style.border = "1px solid #424956";
            dismiss.addEventListener("click", async () => {
              const actor = auth.currentUser;
              if (!actor) return;
              if (!confirm("Dismiss this report from the active reports list? The report record will be retained, and the reporter will be allowed to submit another report.")) return;
              await runReportAction(dismiss, report, { status: "dismissed", dismissedAt: Date.now(), dismissedBy: actor.uid }, true);
            });
            actions.appendChild(dismiss);
          }
          card.appendChild(actions);
          list.appendChild(card);
        });
        modal.appendChild(list);
      } catch (err) {
        console.error("Could not load admin reports:", err);
        statusLine.style.color = "#ff8d8d";
        statusLine.textContent = "Couldn't load reports. Check that Firebase rules allow admins to read adminReports.";
      }
    }

    function usernameFromProfileRecord(data, uid) {
      const record = data && typeof data === "object" ? data : {};
      return String(record.username || (record.email ? String(record.email).split("@")[0] : "") || (uid ? String(uid).slice(0, 8) : "user"));
    }

    function styleFriendActionButton(button, kind = "primary") {
      button.type = "button";
      button.className = "profile-save";
      if (kind === "danger") button.style.cssText = "background:#a83232;color:#fff;border:1px solid #d24a4a;";
      else if (kind === "secondary") button.style.cssText = "background:#242a33;color:#eef1f5;border:1px solid #424956;";
      else button.style.cssText = "background:#8bd450;color:#101010;";
      return button;
    }

    async function sendFriendRequest(targetUid) {
      const current = auth.currentUser;
      if (!current || !targetUid || targetUid === current.uid) throw new Error("You cannot add yourself as a friend.");
      const [targetSnap, senderSnap, existingRequestSnap, existingFriendSnap] = await Promise.all([
        db.ref("users/" + targetUid).once("value"),
        db.ref("users/" + current.uid).once("value"),
        db.ref("friendRequests/" + targetUid + "/" + current.uid).once("value"),
        db.ref("friends/" + current.uid + "/" + targetUid).once("value")
      ]);
      if (!targetSnap.exists()) throw new Error("This profile could not be found.");
      if (existingFriendSnap.exists()) throw new Error("You are already friends.");
      if (existingRequestSnap.exists()) throw new Error("You have already sent a friend request.");
      const senderData = senderSnap.val() || {};
      await db.ref("friendRequests/" + targetUid + "/" + current.uid).set({
        fromUid: current.uid,
        fromName: displayNameFromUser(senderData, current.uid),
        fromUsername: usernameFromProfileRecord(senderData, current.uid),
        createdAt: Date.now(),
        status: "pending"
      });
    }

    async function acceptFriendRequest(senderUid, refreshProfileUid, editMode = false) {
      const current = auth.currentUser;
      if (!current || !senderUid || senderUid === current.uid) throw new Error("Invalid friend request.");
      const requestRef = db.ref("friendRequests/" + current.uid + "/" + senderUid);
      const requestSnap = await requestRef.once("value");
      const request = requestSnap.val();
      if (!request || request.status !== "pending") throw new Error("This friend request is no longer pending.");
      const [recipientSnap, senderSnap] = await Promise.all([
        db.ref("users/" + current.uid).once("value"),
        db.ref("users/" + senderUid).once("value")
      ]);
      if (!senderSnap.exists()) throw new Error("This user's account could not be found.");
      const recipientData = recipientSnap.val() || {};
      const senderData = senderSnap.val() || {};
      const timestamp = Date.now();
      const recipientName = displayNameFromUser(recipientData, current.uid);
      const senderName = displayNameFromUser(senderData, senderUid);
      const recipientUsername = usernameFromProfileRecord(recipientData, current.uid);
      const senderUsername = usernameFromProfileRecord(senderData, senderUid);
      const updates = {};
      updates["friends/" + current.uid + "/" + senderUid] = { uid: senderUid, name: senderName, username: senderUsername, since: timestamp };
      updates["friends/" + senderUid + "/" + current.uid] = { uid: current.uid, name: recipientName, username: recipientUsername, since: timestamp };
      // The pending request stays in place until both reciprocal friend records are written.
      await db.ref().update(updates);
      await requestRef.remove();
      if (refreshProfileUid) await openUserProfile(refreshProfileUid, editMode);
    }

    async function declineFriendRequest(senderUid, refreshProfileUid, editMode = false) {
      const current = auth.currentUser;
      if (!current || !senderUid || senderUid === current.uid) return;
      await db.ref("friendRequests/" + current.uid + "/" + senderUid).remove();
      if (refreshProfileUid) await openUserProfile(refreshProfileUid, editMode);
    }

    async function removeFriend(friendUid, refreshProfileUid, editMode = false) {
      const current = auth.currentUser;
      if (!current || !friendUid || friendUid === current.uid) return;
      await Promise.all([
        db.ref("friends/" + current.uid + "/" + friendUid).remove(),
        db.ref("friends/" + friendUid + "/" + current.uid).remove()
      ]);
      if (refreshProfileUid) await openUserProfile(refreshProfileUid, editMode);
    }

    async function appendFriendProfileActions(profileActions, targetUid, targetUsername, profileRequest, requestedEdit) {
      const current = auth.currentUser;
      if (!current || targetUid === current.uid) return;
      const controls = document.createElement("div");
      controls.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:8px;";
      const status = document.createElement("span");
      status.style.cssText = "font-size:12px;color:#aab1bc;";
      status.textContent = "Checking friends…";
      controls.appendChild(status);
      profileActions.appendChild(controls);
      try {
        const currentUid = current.uid;
        const [friendA, friendB, outgoing, incoming] = await Promise.all([
          db.ref("friends/" + currentUid + "/" + targetUid).once("value"),
          db.ref("friends/" + targetUid + "/" + currentUid).once("value"),
          db.ref("friendRequests/" + targetUid + "/" + currentUid).once("value"),
          db.ref("friendRequests/" + currentUid + "/" + targetUid).once("value")
        ]);
        if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;
        controls.replaceChildren();
        status.textContent = "";
        const setStatus = text => { status.textContent = text; if (text && !status.parentNode) controls.appendChild(status); };
        const button = (label, kind, handler) => {
          const el = styleFriendActionButton(document.createElement("button"), kind);
          el.textContent = label;
          el.addEventListener("click", async () => {
            el.disabled = true;
            const oldLabel = el.textContent;
            el.textContent = "Please wait…";
            try {
              await handler();
            } catch (err) {
              console.error("Friend action failed:", err);
              setStatus(err && err.message ? err.message : "That friend action failed. Check your Firebase friend rules.");
              el.disabled = false;
              el.textContent = oldLabel;
            }
          });
          controls.appendChild(el);
          return el;
        };
        if (friendA.exists() || friendB.exists()) {
          button("Friends ✓", "secondary", async () => {} ).disabled = true;
          button("Remove Friend", "danger", () => removeFriend(targetUid, targetUid, false));
        } else if (incoming.exists() && incoming.val() && incoming.val().status === "pending") {
          button("Accept Request", "primary", () => acceptFriendRequest(targetUid, targetUid, false));
          button("Decline", "danger", () => declineFriendRequest(targetUid, targetUid, false));
        } else if (outgoing.exists() && outgoing.val() && outgoing.val().status === "pending") {
          button("Request Sent", "secondary", async () => { throw new Error("Your request is still pending."); }).disabled = true;
          button("Cancel Request", "danger", async () => {
            await db.ref("friendRequests/" + targetUid + "/" + currentUid).remove();
            await openUserProfile(targetUid, false);
          });
        } else {
          button("Add Friend", "primary", async () => {
            await sendFriendRequest(targetUid);
            await openUserProfile(targetUid, false);
          });
        }
        if (status.textContent) controls.appendChild(status);
      } catch (err) {
        console.warn("Could not load friend status:", err);
        controls.replaceChildren();
        const note = document.createElement("span");
        note.style.cssText = "font-size:12px;color:#ff8d8d;";
        note.textContent = "Friend status unavailable. Check Firebase friend rules.";
        controls.appendChild(note);
      }
    }

    async function appendFriendsSections(wrap, profileUid, profileRequest, requestedEdit) {
      const friendsCard = document.createElement("section");
      friendsCard.className = "profile-card profile-friends-card";
      friendsCard.style.cssText = "grid-column:1 / -1;min-width:0;";
      const heading = document.createElement("h3");
      heading.className = "profile-section-title";
      heading.textContent = "Friends";
      const list = document.createElement("div");
      list.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;";
      const loading = document.createElement("p");
      loading.className = "profile-description";
      loading.style.fontSize = "12px";
      loading.textContent = "Loading friends…";
      list.appendChild(loading);
      friendsCard.append(heading, list);
      wrap.appendChild(friendsCard);
      try {
        const snapshot = await db.ref("friends/" + profileUid).once("value");
        if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;
        const friendEntries = [];
        snapshot.forEach(child => {
          const value = child.val();
          if (value && typeof value === "object") friendEntries.push({ uid: child.key, record: value });
        });
        list.replaceChildren();
        if (!friendEntries.length) {
          const empty = document.createElement("p");
          empty.className = "profile-description";
          empty.style.fontSize = "12px";
          empty.textContent = "No friends yet.";
          list.appendChild(empty);
        } else {
          const currentData = await Promise.all(friendEntries.map(async entry => {
            try {
              const userSnap = await db.ref("users/" + entry.uid).once("value");
              return { ...entry, data: userSnap.val() || {} };
            } catch (e) { return { ...entry, data: {} }; }
          }));
          if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;
          currentData.forEach(entry => {
            const name = displayNameFromUser(entry.data, entry.uid) || entry.record.name || "Unknown user";
            const username = usernameFromProfileRecord(entry.data, entry.uid) || entry.record.username || entry.uid.slice(0, 8);
            const friendButton = document.createElement("button");
            friendButton.type = "button";
            friendButton.style.cssText = "padding:8px 11px;border:1px solid #343b47;border-radius:7px;background:#0d1015;color:#e8ebef;font:inherit;font-size:12px;cursor:pointer;max-width:100%;overflow-wrap:anywhere;";
            friendButton.textContent = name + "  ·  @" + username;
            friendButton.classList.add("username-link");
            applyUsernameColor(friendButton, entry.uid, entry.data);
            friendButton.title = "View " + name + "'s profile";
            friendButton.addEventListener("mouseenter", () => { friendButton.style.borderColor = "#8bd450"; });
            friendButton.addEventListener("mouseleave", () => { friendButton.style.borderColor = "#343b47"; });
            friendButton.addEventListener("click", () => openUserProfile(entry.uid));
            list.appendChild(friendButton);
          });
        }
      } catch (err) {
        console.warn("Could not load profile friends:", err);
        list.replaceChildren();
        const error = document.createElement("p");
        error.className = "profile-description";
        error.style.cssText = "font-size:12px;color:#ff8d8d;";
        error.textContent = "Couldn't load this friends list. Check your Firebase friend rules.";
        list.appendChild(error);
      }

      if (profileUid !== auth.currentUser?.uid) return;
      const requestCard = document.createElement("section");
      requestCard.className = "profile-card profile-friend-requests-card";
      requestCard.style.cssText = "grid-column:1 / -1;min-width:0;";
      const requestHeading = document.createElement("h3");
      requestHeading.className = "profile-section-title";
      requestHeading.textContent = "Friend Requests";
      const requestList = document.createElement("div");
      requestList.style.cssText = "display:grid;gap:10px;";
      const requestLoading = document.createElement("p");
      requestLoading.className = "profile-description";
      requestLoading.style.fontSize = "12px";
      requestLoading.textContent = "Loading requests…";
      requestList.appendChild(requestLoading);
      requestCard.append(requestHeading, requestList);
      wrap.appendChild(requestCard);
      try {
        const requestSnap = await db.ref("friendRequests/" + profileUid).once("value");
        if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;
        const requests = [];
        requestSnap.forEach(child => {
          const request = child.val();
          if (request && request.status === "pending") requests.push({ uid: child.key, request });
        });
        requestList.replaceChildren();
        if (!requests.length) {
          const empty = document.createElement("p");
          empty.className = "profile-description";
          empty.style.fontSize = "12px";
          empty.textContent = "No pending friend requests.";
          requestList.appendChild(empty);
        } else {
          const requestRecords = await Promise.all(requests.map(async item => {
            try {
              const userSnap = await db.ref("users/" + item.uid).once("value");
              return { ...item, data: userSnap.val() || {} };
            } catch (e) { return { ...item, data: {} }; }
          }));
          if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;
          requestRecords.forEach(item => {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px;border:1px solid #303743;border-radius:7px;background:#0d1015;";
            const profileButton = document.createElement("button");
            profileButton.type = "button";
            profileButton.style.cssText = "border:0;background:transparent;padding:0;color:#eef1f5;font:inherit;cursor:pointer;text-align:left;overflow-wrap:anywhere;";
            profileButton.textContent = displayNameFromUser(item.data, item.uid) + "  ·  @" + usernameFromProfileRecord(item.data, item.uid);
            profileButton.classList.add("username-link");
            applyUsernameColor(profileButton, item.uid, item.data);
            profileButton.addEventListener("click", () => openUserProfile(item.uid));
            const actions = document.createElement("div");
            actions.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
            const accept = styleFriendActionButton(document.createElement("button"), "primary");
            accept.textContent = "Accept";
            const decline = styleFriendActionButton(document.createElement("button"), "danger");
            decline.textContent = "Decline";
            accept.addEventListener("click", async () => {
              accept.disabled = decline.disabled = true;
              accept.textContent = "Accepting…";
              try { await acceptFriendRequest(item.uid, profileUid, requestedEdit); }
              catch (err) { console.error("Could not accept friend request:", err); accept.disabled = decline.disabled = false; accept.textContent = "Accept"; alert(err.message || "Couldn't accept the friend request. Check Firebase friend rules."); }
            });
            decline.addEventListener("click", async () => {
              accept.disabled = decline.disabled = true;
              decline.textContent = "Declining…";
              try { await declineFriendRequest(item.uid, profileUid, requestedEdit); }
              catch (err) { console.error("Could not decline friend request:", err); accept.disabled = decline.disabled = false; decline.textContent = "Decline"; alert(err.message || "Couldn't decline the friend request. Check Firebase friend rules."); }
            });
            actions.append(accept, decline);
            row.append(profileButton, actions);
            requestList.appendChild(row);
          });
        }
      } catch (err) {
        console.warn("Could not load friend requests:", err);
        requestList.replaceChildren();
        const error = document.createElement("p");
        error.className = "profile-description";
        error.style.cssText = "font-size:12px;color:#ff8d8d;";
        error.textContent = "Couldn't load requests. Check your Firebase friend rules.";
        requestList.appendChild(error);
      }
    }

    async function countUserMessages(uid) {
      try {
        const snapshots = await Promise.all(PUBLIC_CHANNELS.map(channel => db.ref("messages/" + channel).once("value")));
        let total = 0;
        snapshots.forEach(snapshot => snapshot.forEach(child => {
          const message = child.val();
          if (message && message.uid === uid) total += 1;
        }));
        return total;
      } catch (err) {
        console.warn("Could not count profile messages:", err);
        return "—";
      }
    }

    function makeProfileStat(label, value, accent = false) {
      const card = document.createElement("div");
      card.className = "profile-stat";
      const heading = document.createElement("div");
      heading.className = "profile-stat-label";
      heading.textContent = label;
      const number = document.createElement("div");
      number.className = "profile-stat-value" + (accent ? " accent" : "");
      number.textContent = String(value);
      card.append(heading, number);
      return card;
    }

    async function openUserProfile(uid, editMode = false) {
      if (!uid || !auth.currentUser) return;
      const profileRequest = ++profileRequestCounter;
      const isOwn = uid === auth.currentUser.uid;
      if (editMode && !isOwn) editMode = false;
      const requestedEdit = isOwn && editMode;

      messagesDiv.classList.add("hidden");
      messageForm.classList.add("hidden");
      moderationPanel.classList.remove("active");
      profilePanel.classList.add("active");
      profilePanel.classList.toggle("editing", requestedEdit);
      syncMessageComposerState();
      profilePanel.replaceChildren();
      document.getElementById("current-channel").textContent = "Profile";
      document.querySelectorAll(".channel").forEach(el => {
        el.classList.toggle("active", requestedEdit && el.dataset.channel === "profile");
      });

      const wrap = document.createElement("div");
      wrap.className = "profile-wrap";
      const back = document.createElement("button");
      back.type = "button";
      back.className = "profile-back";
      back.textContent = "← Back to chat";
      back.addEventListener("click", restorePreviousView);
      wrap.appendChild(back);
      const loadingCard = document.createElement("div");
      loadingCard.className = "profile-card";
      const loading = document.createElement("p");
      loading.className = "profile-description";
      loading.textContent = "Loading profile…";
      loadingCard.appendChild(loading);
      wrap.appendChild(loadingCard);
      profilePanel.appendChild(wrap);

      let data = {};
      try {
        const snap = await db.ref("users/" + uid).once("value");
        data = snap.val() || {};
      } catch (err) {
        console.error("Could not load profile", err);
        loading.textContent = "Couldn't load this profile. Check your Firebase Realtime Database read permissions.";
        return;
      }

      if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;
      const displayName = displayNameFromUser(data, uid);
      const username = data.username || (uid === auth.currentUser.uid ? (auth.currentUser.email || "").split("@")[0] : uid.slice(0, 8));
      const descriptionText = (data.profile && typeof data.profile.description === "string" && data.profile.description.trim()) || "This user hasn't added a description yet.";
      const [adminFlag, modFlag, juniorFlag, messageCount, eliteFlag] = await Promise.all([
        readRoleFlag("admins/" + uid),
        readRoleFlag("moderators/" + uid),
        readRoleFlag("userBadges/" + uid + "/Junior Moderator"),
        countUserMessages(uid),
        hasElite(uid)
      ]);
      if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;
      const roleLabel = adminFlag === true ? "ADMIN" : (juniorFlag === true ? "JUNIOR MODERATOR" : (modFlag === true ? "MODERATOR" : "MEMBER"));
      const availableProfileBadges = await getUserBadges(uid, adminFlag === true, modFlag === true);
      if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;
      let featuredBadgeName = availableProfileBadges.includes(String(data.profileBadgeSymbol || "")) ? String(data.profileBadgeSymbol) : "";

      wrap.replaceChildren(back);
      const hero = document.createElement("section");
      hero.className = "profile-hero";
      const banner = document.createElement("div");
      banner.className = "profile-banner";
      banner.setAttribute("aria-hidden", "true");
      const savedBannerColor = (data.bannerColor && /^#[0-9a-fA-F]{6}$/.test(data.bannerColor)) ? data.bannerColor : "#4c5fc0";
      banner.style.backgroundColor = savedBannerColor;
      banner.classList.toggle("chirp-rainbow-banner", eliteFlag === true && data.bannerRainbow === true);
      const savedUsernameColor = (data.usernameColor && /^#[0-9a-fA-F]{6}$/.test(data.usernameColor)) ? data.usernameColor : "#eeeeee";
      const avatar = document.createElement("div");
      avatar.className = "profile-avatar";
      avatar.dataset.editable = isOwn ? "true" : "false";
      avatar.style.position = "relative";
      avatar.style.overflow = "hidden";
      renderProfileAvatarContent(avatar, displayName, featuredBadgeName);
      let currentProfileDisplayName = displayName;
      let openSymbolPicker = null;
      if (isOwn) {
        avatar.setAttribute("role", "button");
        avatar.setAttribute("tabindex", "0");
        avatar.setAttribute("aria-haspopup", "dialog");
        avatar.setAttribute("title", "Click to choose a badge symbol for your profile");
        avatar.style.cursor = "pointer";
        avatar.style.pointerEvents = "auto";
        avatar.style.transition = "transform .12s ease,border-color .12s ease";
        openSymbolPicker = () => openProfileBadgePicker(uid, avatar, currentProfileDisplayName, featuredBadgeName, chosen => {
          featuredBadgeName = chosen || "";
          data.profileBadgeSymbol = featuredBadgeName || null;
          if (usersCache[uid]) {
            if (featuredBadgeName) usersCache[uid].profileBadgeSymbol = featuredBadgeName;
            else delete usersCache[uid].profileBadgeSymbol;
          }
          renderProfileAvatarContent(avatar, currentProfileDisplayName, featuredBadgeName);
          avatar.title = featuredBadgeName ? "Featured badge symbol: " + ((BADGES[featuredBadgeName] || DEFAULT_BADGES[featuredBadgeName] || {}).label || featuredBadgeName) : "Click to choose a badge symbol for your profile";
          avatar.style.cursor = "pointer";
          avatar.setAttribute("aria-haspopup", "dialog");
        });
        avatar.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          if (openSymbolPicker) openSymbolPicker();
        });
        avatar.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openSymbolPicker(); }
        });
        avatar.addEventListener("mouseenter", () => { avatar.style.transform = "scale(1.035)"; avatar.style.borderColor = "#8bd450"; });
        avatar.addEventListener("mouseleave", () => { avatar.style.transform = "scale(1)"; avatar.style.borderColor = "#343c48"; });
      } else {
        avatar.setAttribute("role", "img");
      }
      const identity = document.createElement("div");
      identity.className = "profile-identity";
      const titleRow = document.createElement("div");
      titleRow.className = "profile-title-row";
      const title = document.createElement("h2");
      title.className = "profile-title" + (juniorFlag === true && adminFlag !== true ? " junior-moderator" : "");
      title.textContent = displayName;
      if (!(juniorFlag === true && adminFlag !== true)) title.style.color = savedUsernameColor;
      applyUsernameColor(title, uid, data);
      titleRow.appendChild(title);
      const handle = document.createElement("div");
      handle.className = "profile-handle" + (juniorFlag === true && adminFlag !== true ? " junior-moderator" : "");
      handle.textContent = "@" + username;
      if (!(juniorFlag === true && adminFlag !== true)) handle.style.color = savedUsernameColor;
      applyUsernameColor(handle, uid, data);

      const pills = document.createElement("div");
      pills.className = "profile-pills";
      const rolePill = document.createElement("span");
      rolePill.className = "profile-pill";
      rolePill.textContent = roleLabel;
      const statusPill = document.createElement("span");
      statusPill.className = "profile-pill " + (data.online ? "online" : "offline");
      statusPill.textContent = data.online ? "● ONLINE" : "○ OFFLINE";
      pills.append(rolePill, statusPill);
      const badgeArea = document.createElement("div");
      badgeArea.className = "profile-badges";
      await appendBadges(badgeArea, uid, adminFlag === true, modFlag === true);
      if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;
      identity.append(titleRow, handle, badgeArea, pills);
      hero.append(banner, avatar, identity);
      wrap.appendChild(hero);

      const stats = document.createElement("div");
      stats.className = "profile-stats-grid";
      stats.append(
        makeProfileStat("MESSAGES SENT", messageCount, true),
        makeProfileStat("BADGES", badgeArea.querySelectorAll(".badge-icon").length),
        makeProfileStat("ACCOUNT ROLE", roleLabel)
      );
      wrap.appendChild(stats);

      const achBtn = document.createElement("button");
      achBtn.type = "button";
      achBtn.className = "profile-save";
      achBtn.style.marginTop = "12px";
      achBtn.textContent = "View Achievements";
      achBtn.addEventListener("click", async () => {
        let betaFlag = false;
        try {
          const betaSnap = await db.ref("userBadges/" + uid + "/Beta Tester").once("value");
          betaFlag = betaSnap.val() === true;
        } catch (err) {}
        const achievements = [
          { name: "Popular", desc: "Received 10 reactions", unlocked: false, icon: "star" },
          { name: "Elite", desc: "Earned the Elite badge", unlocked: eliteFlag, icon: "crown" },
          { name: "Moderator", desc: "Became a moderator", unlocked: modFlag === true, icon: "shield" },
          { name: "Admin", desc: "Became an admin", unlocked: adminFlag === true, icon: "crown" },
          { name: "Junior Mod", desc: "Received Junior Moderator badge", unlocked: juniorFlag === true, icon: "shield" },
          { name: "Beta Tester", desc: "Received the Beta Tester badge", unlocked: betaFlag, icon: "star" }
        ];

        document.getElementById("ach-modal")?.remove();

        const overlay = document.createElement("div");
        overlay.id = "ach-modal";
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10000;display:flex;align-items:center;justify-content:center;";
        const modal = document.createElement("div");
        modal.style.cssText = "background:#14171d;border:1px solid #272c34;border-radius:12px;padding:20px;max-width:480px;width:90%;max-height:80vh;overflow-y:auto;";
        const title = document.createElement("h3");
        title.textContent = "Achievements";
        title.style.margin = "0 0 12px";
        const grid = document.createElement("div");
        grid.className = "achievements-grid";
        achievements.forEach(a => {
          const item = document.createElement("div");
          item.className = "achievement" + (a.unlocked ? "" : " locked");
          const img = document.createElement("img");
          img.className = "achievement-icon";
          img.alt = "";
          img.src = badgeImageData(a.name === "Elite" || a.name === "Admin" ? "Elite" : (a.icon === "shield" ? "Moderator" : "OG"));
          img.style.cssText = "width:28px;height:28px;margin:0 auto 6px;display:block;";
          const nameEl = document.createElement("div");
          nameEl.className = "achievement-name";
          nameEl.textContent = a.name;
          const descEl = document.createElement("div");
          descEl.className = "achievement-desc";
          descEl.textContent = a.desc;
          item.append(img, nameEl, descEl);
          grid.appendChild(item);
        });
        const close = document.createElement("button");
        close.textContent = "Close";
        close.className = "profile-save";
        close.style.marginTop = "16px";
        close.onclick = () => overlay.remove();
        modal.append(title, grid, close);
        overlay.appendChild(modal);
        overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
      });
      const profileActions = document.createElement("div");
      profileActions.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:8px;grid-column:1 / -1;";
      profileActions.appendChild(achBtn);
      // A clearly labelled fallback makes profile-symbol selection discoverable even if
      // users do not realize the circle itself is clickable.
      if (isOwn && typeof openSymbolPicker === "function") {
        const changeSymbolBtn = document.createElement("button");
        changeSymbolBtn.type = "button";
        changeSymbolBtn.className = "profile-save";
        changeSymbolBtn.textContent = "Change profile symbol";
        changeSymbolBtn.title = "Choose a badge symbol to display inside your profile circle";
        changeSymbolBtn.addEventListener("click", () => openSymbolPicker && openSymbolPicker());
        profileActions.appendChild(changeSymbolBtn);
      }

      // Profiles let users report a player by username, independently of the profile currently open.
      if (!isOwn) {
        const reportBtn = document.createElement("button");
        reportBtn.type = "button";
        reportBtn.className = "profile-save";
        reportBtn.style.cssText = "background:#e74c3c;color:#fff;";
        reportBtn.textContent = "Report Player";
        reportBtn.addEventListener("click", () => openAdminReportForm());
        profileActions.appendChild(reportBtn);
        await appendFriendProfileActions(profileActions, uid, username, profileRequest, requestedEdit);
        if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;
      }

      // Report contents are private; only a verified admin can open the reports viewer.
      if (adminFlag === true && currentUserIsAdmin) {
        const viewReportsBtn = document.createElement("button");
        viewReportsBtn.type = "button";
        viewReportsBtn.className = "profile-save";
        viewReportsBtn.style.cssText = "background:#303743;color:#f5f6f8;border:1px solid #48515f;";
        viewReportsBtn.textContent = "View Reports";
        viewReportsBtn.addEventListener("click", openAdminReports);
        profileActions.appendChild(viewReportsBtn);
      }
      wrap.appendChild(profileActions);

      const aboutCard = document.createElement("section");
      aboutCard.className = "profile-card profile-about-card";
      const aboutTitle = document.createElement("h3");
      aboutTitle.className = "profile-section-title";
      aboutTitle.textContent = "About";
      const description = document.createElement("p");
      description.className = "profile-description";
      description.textContent = descriptionText;
      aboutCard.append(aboutTitle, description);
      wrap.appendChild(aboutCard);

      await appendFriendsSections(wrap, uid, profileRequest, requestedEdit);
      if (profileRequest !== profileRequestCounter || !profilePanel.classList.contains("active")) return;

      if (requestedEdit) {
        const editCard = document.createElement("section");
        editCard.className = "profile-card profile-edit-card";
        const form = document.createElement("form");
        form.className = "profile-form";
        const nameLabel = document.createElement("label");
        nameLabel.textContent = "Display name";
        const nameInput = document.createElement("input");
        nameInput.name = "displayName";
        nameInput.maxLength = 32;
        nameInput.required = true;
        nameInput.value = auth.currentUser.displayName || data.name || "";
        nameLabel.appendChild(nameInput);
        const descLabel = document.createElement("label");
        descLabel.textContent = "Description";
        const descInput = document.createElement("textarea");
        descInput.name = "description";
        descInput.maxLength = 180;
        descInput.placeholder = "A little about you…";
        descInput.value = (data.profile && typeof data.profile.description === "string") ? data.profile.description : "";
        descLabel.appendChild(descInput);

        const colorLabel = document.createElement("label");
        colorLabel.textContent = "Username color (chat and profile)";
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.name = "usernameColor";
        colorInput.value = (data.usernameColor && /^#[0-9a-fA-F]{6}$/.test(data.usernameColor)) ? data.usernameColor : "#eeeeee";
        colorLabel.appendChild(colorInput);

        const bannerLabel = document.createElement("label");
        bannerLabel.textContent = "Profile banner color";
        const bannerColorInput = document.createElement("input");
        bannerColorInput.type = "color";
        bannerColorInput.name = "bannerColor";
        bannerColorInput.value = savedBannerColor;
        bannerColorInput.setAttribute("aria-label", "Profile banner color");
        bannerLabel.appendChild(bannerColorInput);
        bannerColorInput.addEventListener("input", () => {
          banner.style.backgroundColor = bannerColorInput.value;
        });
        let usernameRainbowInput = null;
        let bannerRainbowInput = null;
        let usernameGlowInput = null;
        if (eliteFlag === true) {
          const usernameRainbowLabel = document.createElement("label");
          usernameRainbowLabel.className = "profile-rainbow-option";
          usernameRainbowInput = document.createElement("input");
          usernameRainbowInput.type = "checkbox";
          usernameRainbowInput.name = "usernameRainbow";
          usernameRainbowInput.checked = data.usernameRainbow === true;
          usernameRainbowLabel.append(usernameRainbowInput, document.createTextNode("Rainbow username (Elite)"));
          usernameRainbowInput.addEventListener("change", () => {
            title.classList.toggle("chirp-rainbow-username", usernameRainbowInput.checked);
            handle.classList.toggle("chirp-rainbow-username", usernameRainbowInput.checked);
            if (!usernameRainbowInput.checked) {
              title.style.color = colorInput.value;
              handle.style.color = colorInput.value;
              title.style.removeProperty("-webkit-text-fill-color");
              handle.style.removeProperty("-webkit-text-fill-color");
            }
          });
          const bannerRainbowLabel = document.createElement("label");
          bannerRainbowLabel.className = "profile-rainbow-option";
          bannerRainbowInput = document.createElement("input");
          bannerRainbowInput.type = "checkbox";
          bannerRainbowInput.name = "bannerRainbow";
          bannerRainbowInput.checked = data.bannerRainbow === true;
          bannerRainbowLabel.append(bannerRainbowInput, document.createTextNode("Rainbow banner (Elite)"));
          bannerRainbowInput.addEventListener("change", () => {
            banner.classList.toggle("chirp-rainbow-banner", bannerRainbowInput.checked);
            if (!bannerRainbowInput.checked) banner.style.backgroundColor = bannerColorInput.value;
          });
          const glowLabel = document.createElement("label");
          glowLabel.className = "profile-rainbow-option";
          usernameGlowInput = document.createElement("input");
          usernameGlowInput.type = "checkbox";
          usernameGlowInput.name = "usernameGlow";
          usernameGlowInput.checked = data.usernameGlow === true;
          glowLabel.append(usernameGlowInput, document.createTextNode("Soft animated username glow (Elite)"));
          usernameGlowInput.addEventListener("change", () => {
            title.classList.toggle("chirp-elite-glow", usernameGlowInput.checked);
            handle.classList.toggle("chirp-elite-glow", usernameGlowInput.checked);
          });
          form.append(usernameRainbowLabel, bannerRainbowLabel, glowLabel);
        }
        colorInput.addEventListener("input", () => {
          if (!(juniorFlag === true && adminFlag !== true)) {
            title.style.color = colorInput.value;
            handle.style.color = colorInput.value;
          }
        });

        const save = document.createElement("button");
        save.type = "submit";
        save.className = "profile-save";
        save.textContent = "Save profile";
        const status = document.createElement("div");
        status.className = "profile-status";
        status.setAttribute("aria-live", "polite");
        form.append(nameLabel, descLabel, colorLabel, bannerLabel, save, status);
        form.addEventListener("submit", async event => {
          event.preventDefault();
          if (!auth.currentUser || auth.currentUser.uid !== uid) return;
          const newName = nameInput.value.trim();
          const newDescription = descInput.value.trim().slice(0, 180);
          const newColor = colorInput.value;
          const newBannerColor = bannerColorInput.value;
          if (newName.length < 2) {
            status.className = "profile-status error";
            status.textContent = "Display name must be at least 2 characters.";
            return;
          }
          const restricted = ["#ffcc33", "#55b9ef", "#55e878", "#ffd700", "#67d7a4"];
          function colorDistance(c1, c2) {
            const r1 = parseInt(c1.slice(1,3),16), g1 = parseInt(c1.slice(3,5),16), b1 = parseInt(c1.slice(5,7),16);
            const r2 = parseInt(c2.slice(1,3),16), g2 = parseInt(c2.slice(3,5),16), b2 = parseInt(c2.slice(5,7),16);
            return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
          }
          const tooClose = restricted.some(rc => colorDistance(newColor, rc) < 60);
          if (tooClose) {
            status.className = "profile-status error";
            status.textContent = "That color is too close to a role or badge color. Please pick a different one.";
            return;
          }
          save.disabled = true;
          status.className = "profile-status";
          status.textContent = "Saving…";
          try {
            await auth.currentUser.updateProfile({ displayName: newName });
            await db.ref("users/" + uid).update({
              name: newName,
              username: (auth.currentUser.email || "").split("@")[0],
              usernameColor: newColor,
              bannerColor: newBannerColor,
              usernameRainbow: eliteFlag === true && usernameRainbowInput ? usernameRainbowInput.checked : data.usernameRainbow === true,
              bannerRainbow: eliteFlag === true && bannerRainbowInput ? bannerRainbowInput.checked : data.bannerRainbow === true,
              usernameGlow: eliteFlag === true && usernameGlowInput ? usernameGlowInput.checked : data.usernameGlow === true,
              profile: { description: newDescription }
            });
            if (usersCache[uid]) {
              usersCache[uid].name = newName;
              usersCache[uid].usernameColor = newColor;
              usersCache[uid].bannerColor = newBannerColor;
              usersCache[uid].usernameRainbow = eliteFlag === true && usernameRainbowInput ? usernameRainbowInput.checked : data.usernameRainbow === true;
              usersCache[uid].bannerRainbow = eliteFlag === true && bannerRainbowInput ? bannerRainbowInput.checked : data.bannerRainbow === true;
              usersCache[uid].usernameGlow = eliteFlag === true && usernameGlowInput ? usernameGlowInput.checked : data.usernameGlow === true;
              usersCache[uid].profile = { description: newDescription };
            }
            const rankText = currentUserIsAdmin ? " (Admin)" : (currentUserIsJuniorModerator ? " (J Moderator)" : (currentUserIsModerator ? " (Mod)" : ""));
            userInfo.textContent = newName + rankText;
            userInfo.classList.toggle("junior-moderator", currentUserIsJuniorModerator && !currentUserIsAdmin);
            await renderSidebarAccount(auth.currentUser);
            status.textContent = "Profile saved!";
            currentProfileDisplayName = newName;
            title.textContent = newName;
            title.style.color = newColor;
            handle.style.color = newColor;
            const usernameRainbowOn = eliteFlag === true && usernameRainbowInput && usernameRainbowInput.checked;
            const bannerRainbowOn = eliteFlag === true && bannerRainbowInput && bannerRainbowInput.checked;
            title.classList.toggle("chirp-rainbow-username", !!usernameRainbowOn);
            handle.classList.toggle("chirp-rainbow-username", !!usernameRainbowOn);
            title.classList.toggle("chirp-elite-glow", !!(eliteFlag === true && usernameGlowInput && usernameGlowInput.checked));
            handle.classList.toggle("chirp-elite-glow", !!(eliteFlag === true && usernameGlowInput && usernameGlowInput.checked));
            banner.classList.toggle("chirp-rainbow-banner", !!bannerRainbowOn);
            renderProfileAvatarContent(avatar, newName, featuredBadgeName);
            banner.style.backgroundColor = newBannerColor;
            description.textContent = newDescription || "This user hasn't added a description yet.";
          } catch (err) {
            console.error("Could not save profile", err);
            status.className = "profile-status error";
            status.textContent = "Couldn't save profile: " + (err.code || err.message || "unknown error");
          } finally {
            save.disabled = false;
          }
        });
        editCard.appendChild(form);
        wrap.appendChild(editCard);
      }
    }

    function showBadgePermissionError(err, action, uid, badgeName) {
      console.error("Badge " + action + " failed:", err);
      const code = err && err.code ? err.code : "unknown error";
      const detail = err && err.message ? err.message : String(err || "No details supplied");
      alert(
        "Couldn't " + action + " the '" + badgeName + "' badge.\n\n" +
        "Firebase error: " + code + "\n" + detail + "\n\n" +
        "If this says PERMISSION_DENIED, your Realtime Database Rules are blocking writes to /userBadges/" + uid + ". " +
        "The HTML cannot override database security. Share your current Firebase Realtime Database Rules so they can be updated safely."
      );
    }

    async function verifyFreshRole(role) {
      const user = auth.currentUser;
      if (!user) return false;
      try {
        const snap = await db.ref((role === "admin" ? "admins/" : "moderators/") + user.uid).once("value");
        const allowed = snap.val() === true;
        if (role === "admin") currentUserIsAdmin = allowed;
        else currentUserIsModerator = allowed;
        return allowed;
      } catch (err) {
        console.warn("Could not verify current role", err);
        return false;
      }
    }

    async function renderModerationList() {
      moderationPanel.innerHTML = "<h2>Moderation</h2><p>Loading users…</p>";
      let users, admins, mods, assignedBadges, allPrivateChannels = {};
      try {
        const [usersSnap, adminsSnap, modsSnap, badgeSnap] = await Promise.all([
          db.ref("users").once("value"),
          db.ref("admins").once("value"),
          db.ref("moderators").once("value"),
          db.ref("userBadges").once("value")
        ]);
        users = usersSnap.val() || {};
        admins = adminsSnap.val() || {};
        mods = modsSnap.val() || {};
        assignedBadges = badgeSnap.val() || {};
        if (currentUserIsAdmin) {
          const privateChannelsSnap = await db.ref("privateChannels").once("value");
          allPrivateChannels = privateChannelsSnap.val() || {};
        }
      } catch (err) {
        console.error("Could not load moderation list:", err);
        moderationPanel.innerHTML = "<h2>Moderation</h2>";
        const error = document.createElement("p");
        error.style.color = "#ff8a80";
        error.textContent = "Couldn't load the user list from Firebase (" + (err.code || err.message || "unknown error") + "). Check your Realtime Database Rules.";
        moderationPanel.appendChild(error);
        return;
      }

      moderationPanel.innerHTML = "<h2>Moderation</h2>";
      let privateChannelSection = null;

      if (currentUserIsAdmin) {
        const channelSection = privateChannelSection = document.createElement("section");
        channelSection.className = "mod-private-channel-tools";
        channelSection.style.cssText = "margin:4px 0 18px;padding:12px 0 14px;border-bottom:1px solid #30343b;";
        const channelHeading = document.createElement("h3");
        channelHeading.textContent = "Private channels";
        channelHeading.style.cssText = "margin:0 0 4px;font-size:16px;color:#eee;";
        const channelHint = document.createElement("p");
        channelHint.textContent = "See channel temporarily adds you as a member. Your temporary membership is removed when you leave the channel.";
        channelHint.style.cssText = "margin:0 0 10px;color:#9ba3ad;font-size:13px;line-height:1.4;";
        channelSection.append(channelHeading, channelHint);
        const channelList = document.createElement("div");
        channelList.className = "mod-private-channel-list";
        const channelEntries = Object.entries(allPrivateChannels).filter(([, channel]) => channel && typeof channel === "object");
        if (!channelEntries.length) {
          const empty = document.createElement("p");
          empty.textContent = "No private channels have been created yet.";
          empty.style.cssText = "margin:8px 0 0;color:#888;font-size:13px;";
          channelList.appendChild(empty);
        } else {
          channelEntries.forEach(([channelId, channel]) => {
            const row = document.createElement("div");
            row.className = "mod-private-channel-row";
            row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;margin-top:6px;background:#16191f;border:1px solid #292e36;border-radius:7px;";
            const details = document.createElement("div");
            details.style.cssText = "min-width:0;display:flex;flex-direction:column;gap:3px;";
            const name = document.createElement("strong");
            name.textContent = "# " + String(channel.name || "private");
            name.style.cssText = "font-size:14px;color:#eee;overflow-wrap:anywhere;";
            const ownerUser = channel.owner && users[channel.owner] ? users[channel.owner] : null;
            const owner = document.createElement("span");
            owner.textContent = "Owner: " + (ownerUser ? displayNameFromUser(ownerUser, channel.owner) : "unknown");
            owner.style.cssText = "font-size:12px;color:#929aa5;";
            details.append(name, owner);
            const seeButton = document.createElement("button");
            seeButton.type = "button";
            seeButton.className = "btn-see-channel";
            seeButton.textContent = "See channel";
            seeButton.style.cssText = "flex:0 0 auto;border:0;border-radius:5px;padding:7px 11px;background:#286b9e;color:#fff;font:inherit;font-size:12px;font-weight:600;cursor:pointer;";
            seeButton.addEventListener("mouseenter", () => { seeButton.style.backgroundColor = "#347fb5"; });
            seeButton.addEventListener("mouseleave", () => { seeButton.style.backgroundColor = "#286b9e"; });
            seeButton.addEventListener("click", async () => {
              seeButton.disabled = true;
              seeButton.textContent = "Opening…";
              await seePrivateChannelAsAdmin(channelId);
              if (seeButton.isConnected) {
                seeButton.disabled = false;
                seeButton.textContent = "See channel";
              }
            });
            row.append(details, seeButton);
            channelList.appendChild(row);
          });
        }
        channelSection.appendChild(channelList);
      }

      const toolbar = document.createElement("div");
      toolbar.className = "mod-toolbar";
      const searchInput = document.createElement("input");
      searchInput.type = "search"; searchInput.placeholder = "Search username or UID…"; searchInput.setAttribute("aria-label", "Search moderation users");
      toolbar.prepend(searchInput); moderationPanel.appendChild(toolbar);
      searchInput.addEventListener("input", () => {
        const q = searchInput.value.trim().toLowerCase();
        moderationPanel.querySelectorAll(".mod-user").forEach(item => {
          item.style.display = !q || (item.dataset.search || "").includes(q) ? "" : "none";
        });
      });

      Object.entries(users).forEach(([uid, u]) => {
        const div = document.createElement("div");
        div.className = "mod-user";
        div.dataset.search = (String(uid) + " " + displayNameFromUser(u, uid) + " " + String(u.username || "")).toLowerCase();
        const isAdmin = !!admins[uid];
        const isMod = !!mods[uid];
        const isJuniorModerator = !!(assignedBadges[uid] && assignedBadges[uid]["Junior Moderator"] === true);
        const isBanned = u.banned === true;
        let rankClass = isAdmin ? "admin" : (isJuniorModerator ? "junior-moderator" : (isMod ? "mod" : ""));
        let rankText = isAdmin ? "(Admin)" : (isJuniorModerator ? "(J Moderator)" : (isMod ? "(Mod)" : ""));
        const label = displayNameFromUser(u, uid);
        const nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.className = "name username-link " + rankClass;
        nameBtn.textContent = label + " " + rankText + (isBanned ? " (Banned)" : "") + (u && u.online ? " • online" : "");
        applyUsernameColor(nameBtn, uid, u);
        nameBtn.addEventListener("click", () => openUserProfile(uid));
        const actions = document.createElement("span");
        actions.className = "mod-actions";
        div.append(nameBtn, actions);

        if (currentUserIsAdmin) {
          const badgeTools = document.createElement("div");
          badgeTools.className = "badge-tools";
          const badgeSelect = document.createElement("select");
          badgeSelect.setAttribute("aria-label", "Choose badge");
          Object.keys(BADGES).forEach(name => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            badgeSelect.appendChild(option);
          });
          const giveBtn = document.createElement("button");
          giveBtn.className = "btn-badge";
          giveBtn.textContent = "Give badge";
          giveBtn.onclick = async () => {
            if (!(await verifyFreshRole("admin"))) {
              alert("Only verified admins can give badges.");
              return;
            }
            const badgeName = badgeSelect.value;
            giveBtn.disabled = true;
            removeBtn.disabled = true;
            try {
              await db.ref("userBadges/" + uid + "/" + badgeName).set(true);
              
              alert("Gave the '" + BADGES[badgeName].label + "' badge.");
              await renderModerationList();
            } catch (err) {
              showBadgePermissionError(err, "give", uid, BADGES[badgeName].label);
              giveBtn.disabled = false;
              removeBtn.disabled = false;
            }
          };
          const removeBtn = document.createElement("button");
          removeBtn.className = "btn-remove-badge";
          removeBtn.textContent = "Remove badge";
          removeBtn.onclick = async () => {
            if (!(await verifyFreshRole("admin"))) {
              alert("Only verified admins can remove badges.");
              return;
            }
            const badgeName = badgeSelect.value;
            if (badgeName === "Admin" && isAdmin) {
              alert("The Admin badge is automatic while this user is an admin.");
              return;
            }
            if (badgeName === "Moderator" && isMod) {
              alert("The Moderator badge is automatic while this user is a moderator.");
              return;
            }
            giveBtn.disabled = true;
            removeBtn.disabled = true;
            try {
              await db.ref("userBadges/" + uid + "/" + badgeName).remove();
              
              alert("Removed the '" + BADGES[badgeName].label + "' badge, if it was assigned.");
              await renderModerationList();
            } catch (err) {
              showBadgePermissionError(err, "remove", uid, BADGES[badgeName].label);
              giveBtn.disabled = false;
              removeBtn.disabled = false;
            }
          };
          badgeTools.append(badgeSelect, giveBtn, removeBtn);
          div.style.display = "block";
          div.appendChild(badgeTools);
        }

        const isMuted = Number(u.mutedUntil || 0) > Date.now();
        if (isAdmin) {
          if (currentUserIsAdmin && isMuted) {
            const unmuteBtn = document.createElement("button");
            unmuteBtn.className = "btn-unban";
            unmuteBtn.textContent = "Unmute";
            unmuteBtn.title = "Admins may unmute admin accounts, but cannot mute or ban them.";
            unmuteBtn.onclick = () => unmuteUser(uid);
            actions.appendChild(unmuteBtn);
          }
        } else if ((currentUserIsAdmin || currentUserIsModerator) && !isBanned) {
          const muteBtn = document.createElement("button");
          muteBtn.className = "btn-mute";
          muteBtn.textContent = isMuted ? "Unmute" : "Mute";
          muteBtn.title = isMuted ? "Remove this user's mute" : "Choose a mute duration in minutes";
          muteBtn.onclick = () => isMuted ? unmuteUser(uid) : promptMuteUser(uid);
          actions.appendChild(muteBtn);
        }

        if (!isAdmin && (currentUserIsAdmin || (currentUserIsModerator && !isMod))) {
          const banBtn = document.createElement("button");
          banBtn.className = isBanned ? "btn-unban" : "btn-ban";
          banBtn.textContent = isBanned ? "Unban" : "Ban";
          banBtn.onclick = () => toggleBan(uid, isBanned);
          actions.appendChild(banBtn);
        }

        if (currentUserIsAdmin && !isAdmin) {
          const juniorBtn = document.createElement("button");
          juniorBtn.className = isJuniorModerator ? "btn-demod" : "btn-mod";
          juniorBtn.textContent = isJuniorModerator ? "Remove Junior Moderator" : "Add Junior Moderator";
          juniorBtn.onclick = async () => {
            if (!(await verifyFreshRole("admin"))) { alert("Only verified admins can change Junior Moderator status."); return; }
            juniorBtn.disabled = true;
            try {
              const ref = db.ref("userBadges/" + uid + "/Junior Moderator");
              if (isJuniorModerator) {
                await ref.remove();
                
                alert("Junior Moderator removed.");
              } else {
                await ref.set(true);
                
                alert("Junior Moderator added.");
              }
              await renderModerationList();
              loadOnlineUsers();
            } catch (err) {
              showBadgePermissionError(err, isJuniorModerator ? "remove" : "give", uid, "J Moderator");
              juniorBtn.disabled = false;
            }
          };
          actions.appendChild(juniorBtn);
        }

        if (currentUserIsAdmin && !isAdmin) {
          const modBtn = document.createElement("button");
          modBtn.className = isMod ? "btn-demod" : "btn-mod";
          modBtn.textContent = isMod ? "Remove Mod" : "Make Moderator";
          modBtn.onclick = () => toggleModerator(uid, isMod);
          actions.appendChild(modBtn);
        }

        moderationPanel.appendChild(div);
      });

      // Keep the private-channel list at the bottom of the Moderation panel.
      if (privateChannelSection) moderationPanel.appendChild(privateChannelSection);
    }

    async function promptMuteUser(uid) {
      if (!currentUserIsAdmin && !currentUserIsModerator) return;
      const answer = prompt("Mute this user for how many minutes?", "5");
      if (answer === null) return;
      const minutes = Number(answer.trim());
      if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isInteger(minutes)) {
        alert("Enter a whole number of minutes greater than zero.");
        return;
      }
      if (minutes > 10080) {
        alert("The maximum mute duration is 10,080 minutes (7 days).");
        return;
      }
      await muteUser(uid, minutes);
    }

    async function muteUser(uid, minutes = 5) {
      const isAdminActor = await verifyFreshRole("admin");
      const isModActor = isAdminActor ? false : await verifyFreshRole("moderator");
      if (!isAdminActor && !isModActor) { alert("Your moderator permissions could not be verified."); return; }
      try {
        const adminSnap = await db.ref("admins/" + uid).once("value");
        if (adminSnap.val() === true) {
          alert("Admin accounts cannot be muted. Admins can only be unmuted by an admin.");
          return;
        }
        const durationMinutes = Number(minutes);
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 10080) {
          alert("Mute duration must be between 1 and 10,080 minutes.");
          return;
        }
        const until = Date.now() + durationMinutes * 60 * 1000;
        await db.ref("users/" + uid + "/mutedUntil").set(until);
        
        alert("User muted for " + durationMinutes + " minute(s).");
        renderModerationList();
      } catch (err) {
        console.error("Could not mute user:", err);
        alert("Couldn't mute this user: " + (err.code || err.message || "unknown error"));
      }
    }

    async function unmuteUser(uid) {
      const isAdminActor = await verifyFreshRole("admin");
      const isModActor = isAdminActor ? false : await verifyFreshRole("moderator");
      if (!isAdminActor && !isModActor) { alert("Your moderator permissions could not be verified."); return; }
      try {
        const adminSnap = await db.ref("admins/" + uid).once("value");
        const targetIsAdmin = adminSnap.val() === true;
        if (targetIsAdmin && !currentUserIsAdmin) {
          alert("Only an admin can unmute an admin account.");
          return;
        }
        await db.ref("users/" + uid + "/mutedUntil").set(0);
        
        alert("User unmuted.");
        renderModerationList();
      } catch (err) {
        console.error("Could not unmute user:", err);
        alert("Couldn't unmute this user: " + (err.code || err.message || "unknown error"));
      }
    }

    async function toggleBan(uid, currentlyBanned) {
      const isAdminActor = await verifyFreshRole("admin");
      const isModActor = isAdminActor ? false : await verifyFreshRole("moderator");
      if (!isAdminActor && !isModActor) { alert("Your moderation permissions could not be verified."); return; }
      try {
        const adminSnap = await db.ref("admins/" + uid).once("value");
        if (adminSnap.val() === true) {
          alert("Admin accounts cannot be banned through chat moderation.");
          return;
        }
        const modSnap = await db.ref("moderators/" + uid).once("value");
        if (!isAdminActor && modSnap.val() === true) {
          alert("Moderators cannot ban other moderators.");
          return;
        }
        if (currentlyBanned) {
          await db.ref().update({ ["users/" + uid + "/banned"]: false });
          const deviceSnap = await db.ref("users/" + uid + "/deviceId").once("value");
          if (deviceSnap.val()) await db.ref("bannedDevices/" + deviceSnap.val()).remove();
          await db.ref().update({
            ["users/" + uid + "/banReason"]: null,
            ["users/" + uid + "/bannedAt"]: null,
            ["users/" + uid + "/bannedBy"]: null
          });
          alert("User unbanned.");
        } else {
          const enteredReason = prompt("Enter the reason for this ban (required, 3–500 characters):");
          if (enteredReason === null) return;
          const banReason = enteredReason.trim();
          if (banReason.length < 3 || banReason.length > 500) {
            alert("Please enter a ban reason between 3 and 500 characters.");
            return;
          }
          if (!confirm("Ban this user? They will be signed out and cannot log back in.\n\nReason: " + banReason)) return;
          const actor = auth.currentUser;
          if (!actor || !(await verifyFreshRole(isAdminActor ? "admin" : "moderator"))) {
            alert("Your moderation permissions could not be verified. No ban was applied.");
            return;
          }
          await db.ref().update({
            ["users/" + uid + "/banned"]: true,
            ["users/" + uid + "/banReason"]: banReason,
            ["users/" + uid + "/bannedAt"]: Date.now(),
            ["users/" + uid + "/bannedBy"]: actor.uid
          });
          const deviceSnap = await db.ref("users/" + uid + "/deviceId").once("value");
          if (deviceSnap.val()) await db.ref("bannedDevices/" + deviceSnap.val()).set(true);
          alert("User banned. Reason: " + banReason);
        }
        renderModerationList();
      } catch (err) {
        console.error("Could not change ban status:", err);
        alert("Couldn't change ban status: " + (err.code || err.message || "unknown error"));
      }
    }

    async function toggleModerator(uid, currentlyMod) {
      if (!(await verifyFreshRole("admin"))) { alert("Only verified admins can change moderator status."); return; }
      if (currentlyMod) {
        if (confirm("Remove moderator status?")) {
          await db.ref("moderators/" + uid).remove();
          
          alert("Moderator removed.");
        }
      } else {
        if (confirm("Make this user a moderator?")) {
          await db.ref("moderators/" + uid).set(true);
          
          alert("User is now a moderator.");
        }
      }
      renderModerationList();
    }


    function setReplyTarget(target) {
      replyTarget = target || null;
      const preview = document.getElementById("reply-preview");
      if (!preview) return;
      if (!replyTarget) {
        preview.classList.add("hidden");
        document.getElementById("reply-preview-user").textContent = "";
        document.getElementById("reply-preview-text").textContent = "";
        return;
      }
      document.getElementById("reply-preview-user").textContent = replyTarget.user || "User";
      document.getElementById("reply-preview-text").textContent = String(replyTarget.text || "").replace(/\s+/g, " ").slice(0, 140);
      preview.classList.remove("hidden");
      document.getElementById("message-input").focus();
    }

    document.getElementById("cancel-reply").addEventListener("click", () => setReplyTarget(null));

    function appendMessageText(target, rawText) {
      const text = String(rawText || "");
      const regex = /@[A-Za-z0-9_]{3,16}\b/g;
      let last = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > last) target.appendChild(document.createTextNode(text.slice(last, match.index)));
        const mention = document.createElement("span");
        mention.className = "mention";
        mention.textContent = match[0];
        target.appendChild(mention);
        last = regex.lastIndex;
      }
      if (last < text.length) target.appendChild(document.createTextNode(text.slice(last)));
    }

    function findMentionTargets(text) {
      const targets = new Set();
      const regex = /@([A-Za-z0-9_]{3,16})\b/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const sought = match[1].toLowerCase();
        for (const [uid, record] of Object.entries(usersCache)) {
          if (uid !== (auth.currentUser && auth.currentUser.uid) && String(record.username || "").toLowerCase() === sought) {
            targets.add(uid);
          }
        }
      }
      return [...targets];
    }

    function jumpToChannel(channel) {
      const button = document.querySelector('.channel[data-channel="' + channel + '"]');
      if (button) button.click();
    }
// Browser notification permissions are intentionally never requested.
// Chirp's in-app notification center and ping toast still work without them.
function enablePingNotifications() {}
    function showPingToast(msg, channel) {
      const container = document.getElementById("ping-toast-container");
      if (!container) return;
      const toast = document.createElement("button");
      toast.type = "button";
      toast.className = "ping-toast";
      const title = document.createElement("strong");
      title.textContent = "YOU WERE PINGED · #" + channel;
      const body = document.createElement("span");
      body.textContent = (msg.user || msg.username || "Someone") + ": " + String(msg.text || "").slice(0, 150);
      toast.append(title, body);
      toast.addEventListener("click", () => {
        jumpToChannel(channel);
        toast.remove();
      });
      container.appendChild(toast);
      while (container.children.length > 4) container.firstElementChild.remove();
      window.setTimeout(() => toast.remove(), 10000);
      // No desktop/browser notifications: use the in-app ping toast only.
    }

    function stopPingListeners() {
      Object.values(pingListeners).forEach(ref => ref.off());
      pingListeners = {};
    }

    function startPingListeners(uid) {
      stopPingListeners();
      if (!uid) return;
      pingSessionStartedAt = Date.now();
      PUBLIC_CHANNELS.forEach(channel => {
        const ref = db.ref("messages/" + channel).limitToLast(50);
        pingListeners[channel] = ref;
        ref.on("child_added", snapshot => {
          const msg = snapshot.val();
          if (!msg || msg.uid === uid || !msg.mentions) return;
          if (msg.timestamp && msg.timestamp < pingSessionStartedAt) return;
          const mentionedUids = Array.isArray(msg.mentions)
            ? msg.mentions
            : (typeof msg.mentions === "object" ? Object.values(msg.mentions) : []);
          if (mentionedUids.includes(uid)) showPingToast(msg, channel);
        }, err => console.warn("Could not listen for pings in #" + channel, err));
      });
    }

    function addMessage(msg, isOwn, key) {
      // Firebase may emit child_added for an optimistic message we already rendered.
      // Avoid creating a duplicate chat row for the same key.
      if (key && Array.from(messagesDiv.querySelectorAll(".message")).some(el => el.dataset.key === String(key))) return;
      const div = document.createElement("div");
      div.className = "message " + (isOwn ? "own" : "other");
      div.dataset.key = key;
      div.dataset.channel = currentChannel;
      const meta = document.createElement("div");
      meta.className = "meta";
      const name = document.createElement("button");
      name.type = "button";
      name.className = "username-link";
      name.textContent = msg.user || msg.username || "User";
      if (msg.uid) name.addEventListener("click", () => openUserProfile(msg.uid));
      meta.appendChild(name);
      (async () => {
        let isAdmin = msg.admin === true;
        let isMod = msg.mod === true;
        if (auth.currentUser && msg.uid === auth.currentUser.uid) {
          isAdmin = currentUserIsAdmin;
          isMod = currentUserIsModerator;
        }
        if (msg.uid) {
          const [adminFlag, modFlag, juniorFlag] = await Promise.all([
            readRoleFlag("admins/" + msg.uid),
            readRoleFlag("moderators/" + msg.uid),
            readRoleFlag("userBadges/" + msg.uid + "/Junior Moderator")
          ]);
          if (adminFlag !== null) isAdmin = adminFlag;
          if (modFlag !== null) isMod = modFlag;
          name.classList.toggle("junior-moderator", juniorFlag === true && !isAdmin);
          applyUsernameColor(name, msg.uid, usersCache[msg.uid]);
        }
        await appendBadges(meta, msg.uid, isAdmin, isMod);
      })().catch(err => console.error("Could not render chat badges:", err));
      const time = document.createElement("span");
      time.className = "message-time";
      time.textContent = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      meta.appendChild(time);
      const text = document.createElement("div");
      text.className = "message-text";

      if (msg.replyTo && msg.replyTo.text) {
        const quote = document.createElement("button");
        quote.type = "button";
        quote.className = "reply-quote";
        const quotedUser = document.createElement("strong");
        quotedUser.textContent = msg.replyTo.user || "User";
        if (msg.replyTo.uid) applyUsernameColor(quotedUser, msg.replyTo.uid, usersCache[msg.replyTo.uid]);
        const quotedText = document.createElement("span");
        quotedText.textContent = String(msg.replyTo.text).replace(/\s+/g, " ").slice(0, 140);
        quote.append(quotedUser, quotedText);
        quote.title = "Jump to the replied-to message";
        quote.addEventListener("click", () => {
          const targetChannel = msg.replyTo.channel || currentChannel;
          if (targetChannel !== currentChannel) {
            jumpToChannel(targetChannel);
            window.setTimeout(() => highlightOriginalMessage(msg.replyTo.key), 300);
          } else {
            highlightOriginalMessage(msg.replyTo.key);
          }
        });
        div.appendChild(quote);
      }
      appendMessageText(text, msg.text);
      div.append(meta, text);

      const replyBtn = document.createElement("button");
      replyBtn.className = "reply-btn";
      replyBtn.type = "button";
      replyBtn.textContent = "↩ Reply";
      replyBtn.addEventListener("click", () => setReplyTarget({
        key,
        channel: currentChannel,
        user: msg.user || msg.username || "User",
        text: String(msg.text || "").slice(0, 140)
      }));
      const actions = document.createElement("div");
      actions.className = "message-actions";
      actions.append(replyBtn);
      if (isOwn || currentUserIsAdmin || currentUserIsModerator) {
        const del = document.createElement("button");
        del.className = "delete-btn";
        del.type = "button";
        del.textContent = "Delete";
        del.title = isOwn ? "Delete your message" : "Delete message (mod)";
        del.onclick = async () => {
          if (!confirm("Delete this message?")) return;
          try {
            await db.ref("messages/" + currentChannel + "/" + key).remove();
          } catch (err) {
            console.error("Delete failed:", err);
            alert("Couldn't delete message. " + (err.code === "PERMISSION_DENIED" ? "Firebase rules blocked the delete. Publish the rules again." : (err.message || "unknown error")));
          }
        };
        actions.appendChild(del);
      }
      div.appendChild(actions);

      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function highlightOriginalMessage(key) {
      if (!key) return;
      const original = [...messagesDiv.querySelectorAll(".message")].find(el => el.dataset.key === key);
      if (!original) return;
      original.scrollIntoView({ behavior: "smooth", block: "center" });
      original.classList.add("message-jump-highlight");
      window.setTimeout(() => original.classList.remove("message-jump-highlight"), 1600);
    }

    // Keep General and every private channel on a rolling 20-message history.
    // Firebase push keys sort chronologically, so the first keys are the oldest messages.
    const MAX_CHANNEL_MESSAGES = 20;
    const historyTrimTimers = Object.create(null);
    const historyTrimRunning = Object.create(null);
    const historyTrimPending = Object.create(null);

    function isHistoryLimitedChannel(channel) {
      return channel === "general" || !!privateChannels[channel];
    }

    async function trimChannelHistory(channel) {
      if (!isHistoryLimitedChannel(channel)) return;
      if (historyTrimRunning[channel]) {
        historyTrimPending[channel] = true;
        return;
      }

      historyTrimRunning[channel] = true;
      try {
        do {
          historyTrimPending[channel] = false;
          const channelRef = db.ref("messages/" + channel);
          const snapshot = await channelRef.once("value");
          const keys = [];
          snapshot.forEach(child => keys.push(child.key));
          const excess = keys.length - MAX_CHANNEL_MESSAGES;
          if (excess > 0) {
            await Promise.all(keys.slice(0, excess).map(key => channelRef.child(key).remove()));
          }
        } while (historyTrimPending[channel]);
      } catch (err) {
        console.warn("Could not trim message history for channel " + channel + ":", err);
      } finally {
        delete historyTrimRunning[channel];
        if (historyTrimPending[channel]) scheduleChannelHistoryTrim(channel);
      }
    }

    function scheduleChannelHistoryTrim(channel) {
      if (!isHistoryLimitedChannel(channel)) return;
      if (historyTrimTimers[channel]) window.clearTimeout(historyTrimTimers[channel]);
      historyTrimTimers[channel] = window.setTimeout(() => {
        delete historyTrimTimers[channel];
        trimChannelHistory(channel);
      }, 100);
    }

    // Save the new message and remove overflow in one Firebase transaction so
    // the history is capped atomically, including when multiple people send at once.
    function addMessageWithHistoryLimit(channel, payload, messageKey) {
      return new Promise((resolve, reject) => {
        const channelRef = db.ref("messages/" + channel);
        const newKey = messageKey || channelRef.push().key;
        channelRef.transaction((currentMessages) => {
          const nextMessages = Object.assign({}, currentMessages || {});
          nextMessages[newKey] = payload;
          const keys = Object.keys(nextMessages).sort();
          while (keys.length > MAX_CHANNEL_MESSAGES) {
            delete nextMessages[keys.shift()];
          }
          return nextMessages;
        }, (error, committed, snapshot) => {
          if (error) {
            reject(error);
          } else if (!committed) {
            reject(new Error("Message save was not committed."));
          } else {
            resolve({ key: newKey, snapshot });
          }
        }, false);
      });
    }

    let messagesRef = null;
    function loadMessages() {
      if (messagesRef) messagesRef.off();
      messagesDiv.innerHTML = "";
      const channel = currentChannel;
      messagesRef = db.ref(`messages/${channel}`).limitToLast(MAX_CHANNEL_MESSAGES);
      messagesRef.on("child_added", (snapshot) => {
        const msg = snapshot.val();
        if (msg && msg.text && msg.user) {
          const isOwn = auth.currentUser && msg.uid === auth.currentUser.uid;
          addMessage(msg, isOwn, snapshot.key);
        }
        scheduleChannelHistoryTrim(channel);
      });
      messagesRef.on("child_removed", (snapshot) => {
        const el = messagesDiv.querySelector(`[data-key="${snapshot.key}"]`);
        if (el) el.remove();
      });
      // Also clean up older messages already in Firebase when a channel is opened.
      scheduleChannelHistoryTrim(channel);
    }

    let onlineUsersRef = null;
    let onlineUsersHandler = null;
    function loadOnlineUsers() {
      if (onlineUsersRef && onlineUsersHandler) onlineUsersRef.off("value", onlineUsersHandler);
      onlineUsersRef = db.ref("users");
      onlineUsersHandler = async (snap) => {
        const users = snap.val() || {};
        usersCache = users;
        if (auth.currentUser) {
          applyUsernameColor(sidebarAccountName, auth.currentUser.uid, users[auth.currentUser.uid]);
          applyUsernameColor(userInfo, auth.currentUser.uid, users[auth.currentUser.uid]);
        }
        userList.innerHTML = "";
        const adminSnap = await db.ref("admins").once("value");
        const admins = adminSnap.val() || {};
        const [modSnap, badgeSnap] = await Promise.all([
          db.ref("moderators").once("value"),
          db.ref("userBadges").once("value")
        ]);
        const mods = modSnap.val() || {};
        const assignedBadges = badgeSnap.val() || {};
        Object.entries(users).forEach(([uid, u]) => {
          if (u.online) {
            const isAdmin = !!admins[uid];
            const isMod = !!mods[uid];
            const isJuniorModerator = !!(assignedBadges[uid] && assignedBadges[uid]["Junior Moderator"] === true);
            const item = document.createElement("div");
            item.className = "user-item" + (isAdmin ? " admin" : (isJuniorModerator ? " junior-moderator" : (isMod ? " mod" : "")));
            const dot = document.createElement("span");
            dot.textContent = "• ";
            const label = document.createElement("button");
            label.type = "button";
            label.className = "username-link user-name-link" + (isJuniorModerator && !isAdmin ? " junior-moderator" : "");
            label.textContent = displayNameFromUser(u, uid);
            applyUsernameColor(label, uid, u);
            label.addEventListener("click", () => openUserProfile(uid));
            if (u.username) item.title = "Ping with @" + u.username;
            item.append(dot, label);
            appendBadges(item, uid, isAdmin, isMod).catch(console.error);
            userList.appendChild(item);
          }
        });
      };
      onlineUsersRef.on("value", onlineUsersHandler);
    }

    // Client-side message rate limit: at least 1 second between message attempts.
    let lastMessageAttemptAt = 0;
    messageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!canSendMessages()) {
        syncMessageComposerState();
        return;
      }
      if (!auth.currentUser) return;
      const input = document.getElementById("message-input");
      const text = input.value.trim();
      if (!text) return;

      const attemptNow = Date.now();
      if (attemptNow - lastMessageAttemptAt < 1000) {
        return;
      }
      lastMessageAttemptAt = attemptNow;

      const muteSnap = await db.ref("users/" + auth.currentUser.uid + "/mutedUntil").once("value");
      const mutedUntil = muteSnap.val() || 0;
      if (Date.now() < mutedUntil) {
        const mins = Math.ceil((mutedUntil - Date.now()) / 60000);
        alert(`You are muted for about ${mins} more minute(s).`);
        return;
      }

      if (!profanityFilterLoaded || !SWEAR_FILTER_RULES.length) {
        alert("The profanity filter could not be loaded from Firebase config/filter, so your message was not sent. Check read permissions for config/filter and refresh the chat.");
        return;
      }

      const profanityHit = containsSwear(text);
      if (profanityHit) {
        const offenderUid = auth.currentUser.uid;
        if (currentUserIsAdmin) {
          // Preserve the existing admin protection: remove the message attempt, but never mute or ban admins.
          alert("Message blocked by the profanity filter. Admin accounts cannot be muted or banned by the automatic filter.");
        } else if (profanityHit.severity >= 4) {
          try {
            await db.ref("users/" + offenderUid + "/banned").set(true);
            input.value = "";
            // The existing users/{uid}/banned listener displays the ban notice and signs the user out.
          } catch (err) {
            console.error("Could not apply automatic profanity ban:", err);
            alert("Message blocked, but the automatic ban failed: " + (err.code || err.message || "unknown error"));
          }
        } else {
          try {
            await db.ref("users/" + offenderUid + "/mutedUntil").set(Date.now() + MUTE_DURATION);
            alert("Message blocked. You have been muted for 5 minutes for a severity " + profanityHit.severity + " filter match.");
          } catch (err) {
            console.error("Could not apply automatic profanity mute:", err);
            alert("Message blocked, but the automatic mute failed: " + (err.code || err.message || "unknown error"));
          }
        }
        input.value = "";
        return;
      }

      const user = auth.currentUser;
      const display = user.displayName || user.email.split("@")[0];
      const username = user.email.split("@")[0];
      const payload = {
        text,
        user: display,
        username,
        uid: user.uid,
        admin: currentUserIsAdmin,
        mod: currentUserIsModerator,
        mentions: findMentionTargets(text),
        timestamp: Date.now()
      };
      if (replyTarget) {
        payload.replyTo = {
          key: replyTarget.key,
          channel: replyTarget.channel,
          user: replyTarget.user,
          text: replyTarget.text
        };
      }
      // Render immediately for a responsive UI; Firebase persists the message in the background.
      // Reuse the same push key for the optimistic row and the database transaction.
      const sendChannel = currentChannel;
      const optimisticKey = db.ref("messages/" + sendChannel).push().key;
      addMessage(payload, true, optimisticKey);
      input.value = "";
      setReplyTarget(null);

      addMessageWithHistoryLimit(sendChannel, payload, optimisticKey).catch((err) => {
        // Remove the optimistic message if Firebase rejects the write.
        const optimisticRow = Array.from(messagesDiv.querySelectorAll(".message"))
          .find(el => el.dataset.key === optimisticKey);
        if (optimisticRow) optimisticRow.remove();
        // Restore the text only if the user has not started typing another message.
        if (currentChannel === sendChannel && !input.value.trim()) input.value = text;
        console.error("Message save failed:", err);
        alert("Failed to send message. " + (err.code === "PERMISSION_DENIED" ? "Firebase rules blocked the message." : (err.message || "Please try again.")));
      });
    });
