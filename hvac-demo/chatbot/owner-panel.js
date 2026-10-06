/* ==========================================================================
   DEMO-ONLY "Owner view" panel: shows the leads the chatbot captured.
   Not part of a client install (clients get leads by text/email/CRM instead).
   ========================================================================== */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ready(fn) { if (window.TecChat) fn(); else setTimeout(function () { ready(fn); }, 50); }

  ready(function () {
    var C = window.TecChat.config;
    var btn = document.createElement("button");
    btn.className = "op-btn"; btn.type = "button";
    btn.innerHTML = '👁 Owner view <span class="op-count">0</span>';
    btn.setAttribute("aria-label", "Open owner view: leads captured");
    var panel = document.createElement("aside");
    panel.className = "op-panel"; panel.setAttribute("aria-label", "Owner view: leads captured");
    var toast = document.createElement("div"); toast.className = "op-toast";
    document.body.appendChild(btn); document.body.appendChild(panel); document.body.appendChild(toast);

    function stats(leads) {
      return {
        total: leads.length,
        booked: leads.filter(function (l) { return l.slot || /^(booked|request|asap|external)$/.test(l.kind || ""); }).length,
        after: leads.filter(function (l) { return l.afterHours; }).length,
        urgent: leads.filter(function (l) { return l.emergency; }).length
      };
    }
    function fmtTime(iso) {
      try { return new Date(iso).toLocaleString("en-US", { timeZone: C.business.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return iso; }
    }
    var DELIV = {
      "delivered": ["ok", "✅ Delivered to Sheet + email"], "sent-unconfirmed": ["ok", "📨 Sent (no-cors, unconfirmed)"],
      "sending": ["cb", "… Sending"], "queued": ["urg", "⏳ Queued: will retry automatically"], "failed": ["urg", "⚠️ Delivery failed"],
      "local-only": ["cb", "💾 Saved in this browser (demo: no webhook)"]
    };
    function delivChip(l) {
      var d = l.delivery || { status: "local-only" }, m = DELIV[d.status] || ["cb", d.status];
      var resend = C.leads.webhookUrl && /queued|failed|sent-unconfirmed/.test(d.status) ? ' <button type="button" class="op-resend" data-id="' + esc(l.id) + '">↻ Resend</button>' : "";
      return '<div class="op-deliv op-d-' + esc(d.status) + '"><span class="op-tag ' + m[0] + '">' + esc(m[1]) + '</span>' + (d.attempts > 1 ? ' <small>' + d.attempts + ' tries</small>' : '') + (d.error && d.status !== "delivered" ? ' <small title="' + esc(d.error) + '">(' + esc(String(d.error).slice(0, 40)) + ')</small>' : '') + resend + '</div>';
    }
    function render() {
      var leads = window.TecChat.getLeads(), un = window.TecChat.getUnanswered(), s = stats(leads);
      btn.querySelector(".op-count").textContent = s.total;
      var mode = window.TecChat.getMode();
      panel.innerHTML =
        '<div class="op-head"><div><div class="op-kicker">Demo · Owner dashboard</div><h2>Leads captured by the chatbot</h2></div>' +
        '<button class="op-x" type="button" aria-label="Close owner view">✕</button></div>' +
        '<p class="op-sub">This is what <b>' + esc(C.business.name) + '</b> would get. In a live install, every lead is also sent instantly to the owner\'s <b>Google Sheet + email</b> (optional phone alert). Booking mode: <b>' + esc(C.booking.mode) + '</b>. (Demo data is stored only in this browser.)</p>' +
        '<div class="op-stats">' +
          '<div><b>' + s.total + '</b><span>Leads</span></div>' +
          '<div><b>' + s.booked + '</b><span>Booked</span></div>' +
          '<div><b>' + s.after + '</b><span>After-hours</span></div>' +
          '<div><b>' + s.urgent + '</b><span>Urgent</span></div>' +
        '</div>' +
        '<div class="op-list">' + (leads.length ? leads.map(function (l) {
          var tagCls = l.status === "Booked" ? "ok" : (/Urgent/.test(l.status) || l.emergency ? "urg" : "cb");
          var cust = Object.keys(l.custom || {}).filter(function (k) { return l.custom[k]; }).map(function (k) { return '<div class="op-meta">🚗 ' + esc((l.customLabels || {})[k] || k) + ': ' + esc(l.custom[k]) + '</div>'; }).join("");
          return '<div class="op-lead">' +
            '<div class="op-row1"><b>' + esc(l.name) + (l.lang === "es" ? ' <span class="op-lang">ES</span>' : '') + '</b><span class="op-tag ' + tagCls + '">' + esc(l.status) + '</span></div>' +
            '<div class="op-issue">🔧 ' + esc(l.issue || "General question") + '</div>' +
            cust + '<div class="op-meta">📅 ' + esc(l.slot || l.preferredTime || "—") + '</div>' +
            '<div class="op-meta">📞 <a href="tel:' + esc((l.phone || "").replace(/\D/g, "")) + '">' + esc(l.phone) + '</a>' + (l.email ? ' · ✉️ ' + esc(l.email) : '') + '</div>' +
            '<div class="op-meta">📍 ' + esc(l.city || "—") + (l.outOfArea ? ' <i>(confirm coverage)</i>' : '') + '</div>' +
            delivChip(l) + '<div class="op-foot">' + esc(l.id) + ' · ' + esc(fmtTime(l.createdAt)) + (l.afterHours ? ' · <span class="op-night">🌙 after hours</span>' : '') + '</div>' +
          '</div>';
        }).join("") : '<div class="op-empty">No leads yet. Chat with ' + esc(window.TecChat.L(C.bot.name)) + ' and book a visit, then watch it land here.</div>') + '</div>' +
        (un.length ? '<h3>Questions the bot couldn\'t answer (' + un.length + ')</h3><ul class="op-un">' + un.slice(0, 6).map(function (u) { return '<li>“' + esc(u.q) + '”</li>'; }).join("") + '</ul><p class="op-hint">Tec Customs reviews these monthly and teaches the bot new answers (care plan).</p>' : '') +
        '<div class="op-tools">' +
          '<label>Demo clock: <select class="op-mode">' +
            '<option value="auto"' + (mode === "auto" ? " selected" : "") + '>Real time (auto)</option>' +
            '<option value="open"' + (mode === "open" ? " selected" : "") + '>Simulate business hours</option>' +
            '<option value="afterhours"' + (mode === "afterhours" ? " selected" : "") + '>Simulate after hours</option>' +
          '</select></label>' +
          '<div class="op-btns"><button type="button" class="op-csv">⬇ Export CSV</button><button type="button" class="op-sample">+ Sample leads</button><button type="button" class="op-clear">Clear demo data</button></div>' +
        '</div>';
      panel.querySelector(".op-x").onclick = function () { panel.classList.remove("show"); };
      panel.querySelector(".op-mode").onchange = function (e) { window.TecChat.setMode(e.target.value); window.TecChat.reset(); render(); };
      panel.querySelector(".op-clear").onclick = function () { if (confirm("Clear all demo leads from this browser?")) { window.TecChat.clearLeads(); render(); } };
      panel.querySelector(".op-sample").onclick = addSamples;
      panel.querySelector(".op-csv").onclick = exportCSV;
      Array.prototype.forEach.call(panel.querySelectorAll(".op-resend"), function (b) { b.onclick = function () { b.disabled = true; b.textContent = "Sending…"; window.TecChat.deliver(b.getAttribute("data-id")).then(render); }; });
    }
    function addSamples() {
      var key = C.leads.storageKey, now = Date.now();
      var cur = window.TecChat.getLeads();
      var samples = [
        { id: "SMP-3107", name: "Dale Whitfield", phone: "(760) 555-0118", email: "", issue: "No heat, unit clicking", city: "Hesperia 92345", preferredTime: "⚡ ASAP (urgent)", kind: "asap", emergency: true, afterHours: true, status: "Urgent: ASAP", lang: "en", createdAt: new Date(now - 9 * 3600e3).toISOString(), source: "Website chat (sample)", delivery: { status: "delivered", attempts: 1 } },
        { id: "SMP-2290", name: "María López", phone: "(760) 555-0163", email: "maria@example.com", issue: "Presupuesto gratis", city: "Apple Valley", preferredTime: "mar 13 oct · Por la mañana (8–12)", kind: "request", afterHours: false, status: "Requested", lang: "es", createdAt: new Date(now - 26 * 3600e3).toISOString(), source: "Website chat (sample)", delivery: { status: "delivered", attempts: 2 } }
      ];
      localStorage.setItem(key, JSON.stringify(cur.concat(samples)));
      render();
    }
    function exportCSV() {
      var leads = window.TecChat.getLeads();
      var cols = ["id", "createdAt", "name", "phone", "email", "city", "issue", "details", "slot", "preferredTime", "status", "emergency", "afterHours", "lang", "trade", "delivery", "source"];
      leads = leads.map(function (l) { var o = {}; Object.keys(l).forEach(function (k) { o[k] = l[k]; }); o.delivery = (l.delivery || {}).status || ""; o.details = Object.keys(l.custom || {}).map(function (k) { return k + ": " + l.custom[k]; }).join("; "); return o; });
      var csv = [cols.join(",")].concat(leads.map(function (l) { return cols.map(function (c) { return '"' + String(l[c] == null ? "" : l[c]).replace(/"/g, '""') + '"'; }).join(","); })).join("\n");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "chatbot-leads-demo.csv"; a.click();
    }
    btn.onclick = function () { render(); toast.classList.remove("show"); panel.classList.toggle("show"); };
    window.addEventListener("tecbot:lead", function (e) {
      render();
      var l = e.detail;
      toast.innerHTML = '<div class="op-t-app">📱 New lead · ' + esc(C.business.shortName) + ' <span>now</span></div><b>' + esc(l.name) + ' · ' + esc(l.phone) + '</b><br>' + esc(l.issue || "Call back request") + '<br>' + esc(l.slot || l.preferredTime || "") + (l.emergency ? ' <b style="color:#e11d48">URGENT</b>' : '');
      toast.classList.add("show");
      clearTimeout(toast._t); toast._t = setTimeout(function () { toast.classList.remove("show"); }, 6500);
    });
    window.addEventListener("tecbot:unanswered", render);
    window.addEventListener("tecbot:delivery", render);
    window.addEventListener("storage", render);
    window.TecOwnerPanel = { open: function () { render(); panel.classList.add("show"); }, close: function () { panel.classList.remove("show"); }, render: render };
    render();
  });
})();
