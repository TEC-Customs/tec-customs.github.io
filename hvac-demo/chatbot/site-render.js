/* Demo page renderer (Tec Customs sales demo only; real clients don't need this file).
   Fills the sample business page from the active trade preset so one HTML page can
   demo HVAC, plumbing, electrical, roofing, pest, solar, auto repair, collision and garage doors. */
(function () {
  "use strict";
  var TC = window.TecChat; if (!TC) return;
  var C = TC.config, B = C.business, site = C.site || {};
  function en(v) { return v && typeof v === "object" && !Array.isArray(v) ? (v.en != null ? v.en : v.es) : (v == null ? "" : v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fill(s) {
    return String(en(s)).replace(/\{(\w+)\}/g, function (m, k) {
      var v = { phone: B.phone, phoneHref: B.phoneHref, license: B.license, address: B.address, name: B.name, bot: en(C.bot.name), area: en(C.serviceArea.summary) }[k];
      return v != null ? esc(v) : m;
    });
  }
  function all(k) { return Array.prototype.slice.call(document.querySelectorAll('[data-r="' + k + '"]')); }
  function set(k, html) { all(k).forEach(function (e) { e.innerHTML = html; }); }
  var brand = (C.theme && C.theme.brand) || "#0f2a44", accent = (C.theme && C.theme.accent) || "#f26b1d";
  var rootStyle = document.documentElement.style;
  rootStyle.setProperty("--navy", brand); rootStyle.setProperty("--orange", accent);
  var bot = esc(en(C.bot.name)), label = en(C.label) || "Home services";

  document.title = B.name + " (Demo) · " + label + " · Apple Valley, Victorville, Hesperia";
  set("logo-svg", '<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="' + brand + '"/><text x="24" y="31" text-anchor="middle" font-size="22">' + esc(C.bot.avatar) + '</text></svg>');
  set("short-name", esc(B.shortName)); set("trade-label", esc(label)); set("biz-name", esc(B.name));
  set("phone", esc(B.phone)); all("call-href").forEach(function (a) { a.href = B.phoneHref; });
  set("license", esc(B.license || ""));
  set("eyebrow", C.shopBased && B.address ? "📍 " + esc(B.address) : esc((C.serviceArea.cities || []).slice(0, 4).join(" · ")));
  if (site.headline) set("headline", site.headline);
  if (site.lead) set("lead", site.lead);
  all("book-btn").forEach(function (b) {
    b.innerHTML = C.shopBased ? "📅 Book an appointment online" : "📅 Book online in 60 seconds";
    b.setAttribute("data-tecchat-open", C.shopBased ? "I'd like to book an appointment" : "I'd like to book a service call");
  });
  set("trust", (site.trust || []).map(function (t) { return "<li>" + t + "</li>"; }).join(""));
  set("hero-art", heroSVG());
  set("promo", site.promo ? site.promo.text + ' · <button class="linkbtn" data-tecchat-open="' + esc(site.promo.ask) + '">Ask ' + bot + ' →</button>' : "");
  set("services-h", esc(label) + " services");
  set("cards", C.services.map(function (s) {
    return '<article class="card"><div class="ico">' + esc(s.icon || "🔧") + '</div><h3>' + esc(en(s.name)) + '</h3><p>' + esc(en(s.desc)) + '</p>' +
      '<button class="linkbtn" data-tecchat-open="' + esc(s.ask || ("Do you do " + en(s.name).toLowerCase() + "?")) + '">Ask ' + bot + ' →</button></article>';
  }).join(""));
  set("why", (site.why || []).map(function (w) { return "<div><b>" + w[0] + "</b><span>" + w[1] + "</span></div>"; }).join(""));
  var mp = C.maintenancePlan;
  all("plan-section").concat(all("nav-plan")).forEach(function (e) { e.hidden = !mp; });
  if (mp) {
    set("plan-h", "Join the " + esc(en(mp.name)));
    set("plan-pitch", esc(en(mp.pitch || "")));
    set("plan-price", esc(en(mp.price)));
    set("plan-perks", (en(mp.perks) || []).map(function (p) { return "<li>✔ " + esc(p) + "</li>"; }).join(""));
    all("plan-btn").forEach(function (b) { b.setAttribute("data-tecchat-open", "Tell me about the " + en(mp.name)); b.textContent = "Ask " + en(C.bot.name) + " about the plan"; });
  }
  set("nav-area", C.shopBased ? "Location" : "Service Area");
  set("area-h", "Proudly serving " + esc(en(C.serviceArea.summary)));
  all("address").forEach(function (e) { e.hidden = !(C.shopBased && B.address); e.innerHTML = "📍 Shop: " + esc(B.address || ""); });
  set("area-chips", (C.serviceArea.cities || []).map(function (c) { return "<li>" + esc(c) + "</li>"; }).join(""));
  set("reviews", (site.reviews || []).map(function (r) { return '<blockquote><div class="stars">★★★★★</div>“' + esc(r[0]) + '”<cite>' + esc(r[1]) + ' (sample)</cite></blockquote>'; }).join(""));
  set("faq", (C.faqs || []).filter(function (f) { return f.q; }).slice(0, 6).map(function (f) {
    return "<details><summary>" + esc(en(f.q)) + "</summary><p>" + fill(f.answer) + "</p></details>"; }).join(""));
  if (site.ctaBand) { set("cta-h", esc(site.ctaBand.h)); set("cta-p", fill(site.ctaBand.p)); }
  set("foot-area", "Serving " + esc(en(C.serviceArea.summary)));
  set("foot-hours", esc(en(C.hoursText)).replace(/ · /g, "<br>") + (C.emergency.available24x7 ? "<br>Emergency service 24/7" : ""));

  // trade switcher in the demo ribbon
  var sel = document.getElementById("trade-switch"), P = window.TEC_PRESETS || {};
  if (sel) {
    Object.keys(P).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = en(P[k].label) || k; if (k === C.trade) o.selected = true; sel.appendChild(o); });
    if (!sel.options.length) sel.parentNode.hidden = true;
    sel.addEventListener("change", function () { var u = new URL(location.href); u.searchParams.set("trade", sel.value); location.href = u.toString(); });
  }

  function heroSVG() {
    var badge = esc(site.badge || "✔ Local pros");
    var bw = Math.max(96, Math.min(190, 18 + badge.length * 8.5));
    var unit = site.heroUnit === "ac" ? '<g transform="translate(300 222)"><rect width="56" height="46" rx="6" fill="#dfe6ee" stroke="#9fb0c2" stroke-width="2"/><circle cx="28" cy="23" r="15" fill="#c5d1dd" stroke="#8ea1b5" stroke-width="2"/><path d="M28 10v26M15 23h26M19 14l18 18M37 14L19 32" stroke="#8ea1b5" stroke-width="2"/></g>' : "";
    var building = C.shopBased
      ? '<g transform="translate(110 130)"><rect x="0" y="20" width="200" height="120" fill="#f8f1e7"/><rect x="-6" y="8" width="212" height="18" rx="4" fill="' + brand + '"/>' +
        '<rect x="16" y="50" width="70" height="90" fill="#cfd8e3"/><rect x="112" y="50" width="70" height="90" fill="#cfd8e3"/>' +
        '<path d="M16 62h70M16 74h70M16 86h70M16 98h70M112 62h70M112 74h70M112 86h70M112 98h70" stroke="#aab7c6" stroke-width="2"/>' +
        '<rect x="70" y="-14" width="60" height="22" rx="4" fill="' + accent + '"/></g>'
      : '<g transform="translate(130 120)"><path d="M0 60 L80 10 L160 60 Z" fill="' + brand + '"/><rect x="14" y="58" width="132" height="92" fill="#f8f1e7"/>' +
        '<rect x="34" y="78" width="30" height="28" rx="3" fill="#7cc3e8"/><rect x="96" y="78" width="30" height="28" rx="3" fill="#7cc3e8"/><rect x="66" y="104" width="28" height="46" rx="3" fill="' + accent + '"/></g>';
    return '<svg viewBox="0 0 400 300" role="img"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf8a"/><stop offset="1" stop-color="#ffe9cc"/></linearGradient>' +
      '<linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8a26b"/><stop offset="1" stop-color="#d9824a"/></linearGradient></defs>' +
      '<rect width="400" height="300" rx="24" fill="url(#sky)"/><circle cx="330" cy="70" r="34" fill="#fff3d6"/><circle cx="330" cy="70" r="24" fill="#ffb347"/>' +
      '<path d="M0 200 Q80 150 160 190 T320 170 T400 180 V300 H0Z" fill="url(#hill)"/><path d="M0 230 Q120 200 220 228 T400 220 V300 H0Z" fill="#c96f39"/>' +
      '<g transform="translate(40 168)"><rect x="8" y="0" width="6" height="44" rx="3" fill="#5d7b4a"/><rect x="0" y="12" width="5" height="16" rx="2.5" fill="#5d7b4a"/><rect x="0" y="22" width="10" height="5" rx="2.5" fill="#5d7b4a"/><rect x="17" y="8" width="5" height="16" rx="2.5" fill="#5d7b4a"/><rect x="12" y="18" width="10" height="5" rx="2.5" fill="#5d7b4a"/></g>' +
      building + unit +
      '<g class="hero-badge" font-weight="700"><rect x="' + (300 - bw) + '" y="26" width="' + bw + '" height="34" rx="17" fill="#fff"/><text x="' + (300 - bw / 2) + '" y="48" text-anchor="middle" font-size="15" fill="' + brand + '">' + badge + '</text></g></svg>';
  }
})();
