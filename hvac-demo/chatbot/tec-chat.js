/* ==========================================================================
   Tec Customs Chat Widget v2: rules/intent engine (no server, no API key)
   (c) Tec Customs · Apple Valley, CA · tec.customs1@gmail.com
   --------------------------------------------------------------------------
   Load AFTER bot-config.js (and, for demos, presets.js):
     <script src="bot-config.js"></script>
     <script src="tec-chat.js" defer></script>
   The CSS (tec-chat.css) is auto-loaded from the same folder as this script.
   Demo URL flags (only when business.isDemo is true):
     ?trade=hvac|plumbing|electrical|roofing|pest|solar|auto|autobody|garage|
            cleaning|locksmith|appliance|masonry
     ?booking=request|external|demo-calendar · ?mode=afterhours|open
   Any site: ?lang=es · ?fast=1 (instant replies, for testing)
   ========================================================================== */
(function () {
  "use strict";
  var RAW = window.TEC_BOT_CONFIG;
  if (!RAW) { console.error("[TecChat] TEC_BOT_CONFIG missing. Load bot-config.js first."); return; }
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || "";
  var params = new URLSearchParams(location.search);
  var FAST = params.has("fast");

  /* ---------------- config merge: defaults <- trade preset <- client config ---------------- */
  function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
  function isLangObj(o) { if (!isObj(o)) return false; var k = Object.keys(o); return k.length > 0 && k.every(function (x) { return x === "en" || x === "es"; }); }
  function merge(a, b) {
    if (b === undefined) return a;
    if (!isObj(a) || !isObj(b) || isLangObj(b)) return b;
    var out = {}; Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(b).forEach(function (k) { out[k] = merge(a[k], b[k]); });
    return out;
  }
  var DEFAULTS = {
    trade: "hvac",
    business: { name: "Your Business", shortName: "Your Business", phone: "", phoneHref: "", email: "", license: "", address: "", timezone: "America/Los_Angeles", isDemo: false },
    theme: {},
    hours: { "0": null, "1": [8, 17], "2": [8, 17], "3": [8, 17], "4": [8, 17], "5": [8, 17], "6": null },
    hoursText: { en: "Mon–Fri 8 AM–5 PM", es: "Lun–Vie 8 AM–5 PM" },
    emergency: { available24x7: false, responseText: "", afterHoursFee: "", patterns: [],
      callbackPromise: { en: "we'll call you back as soon as we open", es: "le llamaremos en cuanto abramos" } },
    safety: [],
    serviceArea: { summary: { en: "our local area", es: "nuestra área" }, cities: [], zips: {}, nearbyNotCovered: [] },
    services: [], pricing: { disclaimer: "", items: [] }, financing: null, maintenancePlan: null,
    issueChips: { en: [], es: [] }, faqs: [], shopBased: false,
    leadSteps: ["issue", "name", "phone", "email", "city", "slot"], customSteps: {},
    booking: {
      mode: "request",            // "request" (default) | "external" | "demo-calendar" (demo sites only)
      externalUrl: "", externalProvider: "auto", daysAhead: 5,
      windows: [
        { start: 8, end: 12, label: { en: "Morning (8–12)", es: "Por la mañana (8–12)" } },
        { start: 12, end: 16, label: { en: "Afternoon (12–4)", es: "Por la tarde (12–4)" } },
        { start: 16, end: 18, label: { en: "Late afternoon (4–6)", es: "Tarde (4–6)" } }
      ],
      windowWord: { en: "arrival", es: "llegada" },
      slots: ["8–10 AM", "10 AM–12 PM", "12–2 PM", "2–4 PM", "4–6 PM"], saturdaySlots: ["8–10 AM", "10 AM–12 PM", "12–2 PM"],
      arrivalNote: { en: "We'll call or text when we're on the way.", es: "Le llamaremos o enviaremos un mensaje cuando vayamos en camino." }
    },
    leads: { storageKey: "tecbot_leads", webhookUrl: "", provider: "auto", token: "", retries: 3, timeoutMs: 10000, maxPerHour: 5,
      ownerNotify: "owner's email (and phone alert, if set up)" },
    languages: ["en", "es"], defaultLanguage: "en", autoDetectSpanish: true,
    bot: { name: "Assistant", role: "Virtual assistant", avatar: "💬", typingDelayMs: 650,
      teaser: { en: "Hi! Questions? I can help 24/7.", es: "¡Hola! ¿Preguntas? Le ayudo 24/7." },
      disclaimer: { en: "Automated assistant. Answers are general info; our team confirms details.", es: "Asistente automático. Las respuestas son información general; nuestro equipo confirma los detalles." } },
    strings: {},
    llm: { enabled: false, endpoint: "", timeoutMs: 8000,
      systemPrompt: "You are the website assistant for {name}, serving {area}. Only answer using the business facts provided. If unsure, offer to have someone call. Never quote prices that are not in the facts. Keep answers under 80 words." }
  };
  var demoish = !!(RAW.business && RAW.business.isDemo);
  var PRESETS = window.TEC_PRESETS || {};
  var TRADE = (demoish && params.get("trade")) || RAW.trade || "hvac";
  if (demoish && !PRESETS[TRADE]) TRADE = RAW.trade || "hvac";
  var C = merge(merge(DEFAULTS, PRESETS[TRADE] || {}), RAW);
  if (window.TEC_CONFIG_OVERRIDES) C = merge(C, window.TEC_CONFIG_OVERRIDES);
  C.trade = TRADE;
  if (C.business.isDemo && params.get("booking")) C.booking.mode = params.get("booking");
  if (C.booking.mode === "demo-calendar" && !C.business.isDemo) { console.warn("[TecChat] demo-calendar is demo-only; using request mode."); C.booking.mode = "request"; }
  if (C.booking.mode === "external" && !C.booking.externalUrl) { console.warn("[TecChat] booking.externalUrl missing; using request mode."); C.booking.mode = "request"; }

  var LEADS_KEY = C.leads.storageKey || "tecbot_leads";
  var UNANSWERED_KEY = LEADS_KEY + "_unanswered";
  var MODE_KEY = "tecbot_demo_mode";

  /* ---------------- language ---------------- */
  var LANGS = (C.languages && C.languages.length) ? C.languages : ["en"];
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function okLang(l) { return l && LANGS.indexOf(l) !== -1 ? l : null; }
  var LANG = okLang(params.get("lang")) || okLang(sget("tecbot_lang")) || okLang(C.defaultLanguage) || "en";
  function L(v) {
    if (v == null) return "";
    if (isLangObj(v)) return v[LANG] != null ? v[LANG] : (v.en != null ? v.en : v.es);
    return v;
  }

  /* All bot wording lives here. Override per client with config.strings = { en: {...}, es: {...} } */
  var STR = {
    en: {
      online: "Online now · replies instantly", after: "After hours · still here 24/7", placeholder: "Type your question…",
      send: "Send", close: "Close chat", restart: "Restart chat", openChat: "Open chat with {biz}", langBtn: "ES", langTitle: "Español",
      demoBy: "Demo by Tec Customs.",
      greet1: "Hi there! 👋 I'm {bot}, the virtual assistant for <b>{biz}</b>.",
      greet2: "I can answer questions about our services, pricing, {areaOrLoc} and hours, or <b>get you scheduled</b> in about a minute. What can I help with?",
      areaWord: "service area", locWord: "location",
      greetAfter: "🌙 <b>We're closed right now</b>, but I can still answer questions and <b>take your request</b>. The office follows up first thing in the morning.",
      greetEmerg: "🚨 <b>Emergency?</b> {short} Call <a href='{phoneHref}'>{phone}</a>, or leave your info here and {callback}.",
      greetEmergShort: "Our on-call team is available 24/7.",
      greetNoEmerg: "For anything urgent, call <a href='{phoneHref}'>{phone}</a> during business hours, or leave your info here and {callback}.",
      cBook: "📅 Book a visit", cBookShop: "📅 Book an appointment", cPricing: "💲 Pricing", cArea: "📍 Service area", cLoc: "📍 Location",
      cHours: "🕒 Hours", cPlan: "🛠 {plan}", cEmerg: "🚨 Emergency help", cEmergIs: "🚨 It's an emergency", cFinancing: "💳 Financing options",
      cServices: "🔧 See services", cYesBook: "Yes, book it", cNoThanks: "No thanks, just looking", cContactMe: "Yes, have someone contact me",
      cUrgent: "⚡ Flag as urgent & take my info", cAskElse: "Ask something else", cThatsAll: "That's all, thanks", cSkip: "Skip", cOther: "Other",
      cShowArea: "📍 Show service area", cEstimate: "Free estimate", cSignUp: "Sign me up",
      hoursTitle: "🕒 <b>Hours:</b>", openNow: "We're <b>open right now</b>.",
      closedNow: "We're <b>closed right now</b>, but I can still take your request and the office will follow up when we open.",
      emerg247: " Emergencies are handled 24/7 by our on-call team.",
      areaYes: "✅ Yes! We serve <b>{city}</b>{zip}. It's in our regular service area.",
      areaNo: "📍 <b>{city}</b> is outside our usual area ({summary}), but we sometimes make exceptions. Leave your info and the office will confirm.",
      areaList: "📍 We serve {summary}: <b>{list}</b>.<br><br>Not sure if you're covered? Type your city or ZIP code.",
      shopLoc: "📍 We're located at <b>{address}</b>, and we serve customers from all over {summary}.",
      pricingIntro: "💲 Here's a general idea of pricing:", noPricing: "Every job is a little different, so we give <b>free estimates</b>. Want me to set one up?",
      finPlaceholder: "(Financing link placeholder. The client's real application link goes here.)", finApply: "Apply for financing →",
      noFinancing: "Ask our office about payment options. Want someone to call you?",
      servicesIntro: "🔧 Here's what we do:", serviceYes: "👍 Yes, we handle <b>{name}</b>: {desc}",
      offerVisit: "Would you like to schedule a visit or get a free estimate?", offerShop: "Would you like to book an appointment?",
      problemIntro: "Sorry you're dealing with that. 😟 That's something we fix every day.", tipsIntro: "Quick things to check while you wait:",
      offerAfterTips: "If that doesn't fix it, I can get you scheduled. <b>Want me to set that up?</b>",
      offerDefault: "Want me to get someone out to take a look?", offerDefaultShop: "Want me to book you in so we can take a look?",
      emergFastest: "📞 <b>Fastest:</b> call <a href='{phoneHref}'>{phone}</a>", emergNow: " now.", emergOnCall: ". Our on-call team answers 24/7.",
      emergOffer: "Or I can take your info right now and flag it as <b>urgent</b>, and {callback}.",
      contactInfo: "📞 Call or text <a href='{phoneHref}'>{phone}</a><br>✉️ {email}<br>🕒 {hours}<br><br>Or I can have someone reach out to you. Want to leave your info?",
      fallback: "Good question! I don't want to guess on that one. I can have a team member get back to you with the exact answer. <b>Want to leave your name and number?</b>",
      askElseReply: "Sure! Ask me anything about our services, pricing, hours, or {areaOrLoc}.",
      noProblem: "No problem! I'm here 24/7 if anything comes up. Anything else I can answer?",
      welcome: "You're welcome! 😊 Anything else I can help with?", bye: "Thanks for stopping by! If anything comes up, I'm here 24/7. 👋",
      hi: "Hi! 👋 How can I help today?", switched: "Sure, switching to English. 🙂",
      leadUrgent: "⚡ Got it, I'll flag this as <b>URGENT</b>. Just a few quick details so we can reach you.",
      leadContact: "Happy to have someone reach out. Just a few quick details:",
      leadIntro: "Great, let's get you on the schedule. It takes about a minute. 🙂",
      noted: "I've noted the {items}.", notedIssue: "issue: <i>“{issue}”</i>", notedCity: "location: <b>{city}</b>", notedAnd: " and ",
      askIssue: "What do you need help with? Tap an option or describe it in a few words.", askName: "What's your name?",
      askPhone: "Thanks{first}! What's the best <b>mobile number</b> to reach you? (We text appointment updates.)",
      askEmail: "And your <b>email</b> for the confirmation? (Optional)", askCity: "What <b>city or ZIP</b> is the property in?",
      askCityOther: "No problem. Type your city or ZIP code.", backTo: "Back to your request:",
      retryIssue: "Could you describe it in a few words?", retryName: "Sorry, I didn't catch your name.",
      retryPhone: "Hmm, that doesn't look like a 10-digit phone number.", retryEmail: "That email doesn't look quite right. Try again, or tap Skip.",
      retryCustom: "Could you give me a little more detail?",
      outOfArea: "Thanks. {city} may be outside our usual area, so I'll note it and the office will confirm coverage.",
      cancelled: "No problem, I've cancelled that. Anything else I can help with?",
      tooMany: "Thanks! We've already received several requests from this device. Please call <a href='{phoneHref}'>{phone}</a> so we can help right away.",
      reqAsk: "Almost done! 📅 Which <b>day</b> and <b>{word} window</b> work best? The office will confirm the exact time.",
      reqPickDay: "Pick a day", reqPickWin: "Pick a time window", reqAsap: "⚡ ASAP (urgent)", reqFirst: "First available", anyTime: "Any time",
      tomorrow: "Tomorrow",
      callInstead: "📞 Just call me instead", callbackAsk: "No problem. When's the best time for a call back?",
      cbMorning: "Morning", cbAfternoon: "Afternoon", cbEvening: "Evening", cbAsap: "ASAP", callbackPrefix: "Call back: ",
      extAsk: "Last step: pick a time that works on our online booking page. I've filled in your details where I can. 👇",
      extBtn: "Choose your time →", extCopy: "📋 Copy my details", extCopied: "Copied!",
      calAsk: "Almost done! 📅 Pick an arrival window that works for you:", booked: "Booked", noneWork: "📞 None of these work? Just call me instead",
      requested: "Requested: ",
      tBooked: "You're booked!", tRequest: "Request received!", tUrgent: "Urgent request sent!", tExternal: "Almost done!",
      ref: "Confirmation #{id}", lService: "Service", lWhen: "When", lWhere: "Where", lContact: "Contact",
      general: "General question / call back", weCall: "We'll call to schedule", urgentTag: "URGENT",
      nUrgentAfter: "Our on-call team has been alerted and will reach out shortly.",
      nAfterReq: "The office will text you first thing to confirm your time.",
      nBooked: "We'll text a reminder the day before. {arrival}",
      nRequest: "The office will call or text you shortly to confirm the exact time.",
      nExternal: "Finish picking your time on the booking page. We have your details either way.",
      nCallback: "Someone from our team will call you back.",
      demoNote: "Demo only: no real appointment was created. In a live install, the owner gets this lead instantly by email (and phone alert).",
      anythingElse: "Thanks, {first}! Is there anything else I can help with?", friend: "friend"
    },
    es: {
      online: "En línea · respuesta inmediata", after: "Fuera de horario · disponible 24/7", placeholder: "Escriba su pregunta…",
      send: "Enviar", close: "Cerrar chat", restart: "Reiniciar chat", openChat: "Abrir chat con {biz}", langBtn: "EN", langTitle: "English",
      demoBy: "Demo de Tec Customs.",
      greet1: "¡Hola! 👋 Soy {bot}, el asistente virtual de <b>{biz}</b>.",
      greet2: "Puedo contestar preguntas sobre nuestros servicios, precios, {areaOrLoc} y horario, o <b>agendarle una cita</b> en un minuto. ¿En qué le puedo ayudar?",
      areaWord: "área de servicio", locWord: "ubicación",
      greetAfter: "🌙 <b>Ahorita estamos cerrados</b>, pero puedo contestar sus preguntas y <b>tomar su solicitud</b>. La oficina le contactará a primera hora.",
      greetEmerg: "🚨 <b>¿Es una emergencia?</b> {short} Llame al <a href='{phoneHref}'>{phone}</a>, o deje sus datos aquí y {callback}.",
      greetEmergShort: "Nuestro equipo de guardia está disponible 24/7.",
      greetNoEmerg: "Para algo urgente, llame al <a href='{phoneHref}'>{phone}</a> en horario de oficina, o deje sus datos aquí y {callback}.",
      cBook: "📅 Agendar visita", cBookShop: "📅 Hacer cita", cPricing: "💲 Precios", cArea: "📍 Área de servicio", cLoc: "📍 Ubicación",
      cHours: "🕒 Horario", cPlan: "🛠 {plan}", cEmerg: "🚨 Ayuda de emergencia", cEmergIs: "🚨 Es una emergencia", cFinancing: "💳 Financiamiento",
      cServices: "🔧 Ver servicios", cYesBook: "Sí, agendar", cNoThanks: "No gracias, solo estoy viendo", cContactMe: "Sí, que alguien me contacte",
      cUrgent: "⚡ Marcar como urgente y dejar mis datos", cAskElse: "Preguntar otra cosa", cThatsAll: "Es todo, gracias", cSkip: "Omitir", cOther: "Otra",
      cShowArea: "📍 Ver área de servicio", cEstimate: "Presupuesto gratis", cSignUp: "Quiero inscribirme",
      hoursTitle: "🕒 <b>Horario:</b>", openNow: "Estamos <b>abiertos ahorita</b>.",
      closedNow: "Ahorita estamos <b>cerrados</b>, pero puedo tomar su solicitud y la oficina le contactará cuando abramos.",
      emerg247: " Las emergencias las atiende nuestro equipo de guardia 24/7.",
      areaYes: "✅ ¡Sí! Damos servicio en <b>{city}</b>{zip}. Está dentro de nuestra área normal.",
      areaNo: "📍 <b>{city}</b> está fuera de nuestra área normal ({summary}), pero a veces hacemos excepciones. Deje sus datos y la oficina le confirma.",
      areaList: "📍 Damos servicio en {summary}: <b>{list}</b>.<br><br>¿No sabe si le toca? Escriba su ciudad o código postal.",
      shopLoc: "📍 Estamos en <b>{address}</b> y atendemos a clientes de todo {summary}.",
      pricingIntro: "💲 Estos son precios aproximados:", noPricing: "Cada trabajo es diferente, por eso damos <b>presupuestos gratis</b>. ¿Le agendo uno?",
      finPlaceholder: "(Espacio para el enlace de financiamiento del cliente.)", finApply: "Solicitar financiamiento →",
      noFinancing: "Pregunte en la oficina por opciones de pago. ¿Quiere que le llamen?",
      servicesIntro: "🔧 Esto es lo que hacemos:", serviceYes: "👍 Sí, hacemos <b>{name}</b>: {desc}",
      offerVisit: "¿Quiere agendar una visita o un presupuesto gratis?", offerShop: "¿Quiere hacer una cita?",
      problemIntro: "Lamento que esté pasando por eso. 😟 Es algo que arreglamos todos los días.", tipsIntro: "Algunas cosas que puede revisar mientras tanto:",
      offerAfterTips: "Si eso no lo resuelve, le puedo agendar una cita. <b>¿Quiere que lo haga?</b>",
      offerDefault: "¿Quiere que mandemos a alguien a revisarlo?", offerDefaultShop: "¿Quiere hacer una cita para revisarlo?",
      emergFastest: "📞 <b>Lo más rápido:</b> llame al <a href='{phoneHref}'>{phone}</a>", emergNow: " ahora.", emergOnCall: ". Nuestro equipo de guardia contesta 24/7.",
      emergOffer: "O puedo tomar sus datos ahorita y marcarlo como <b>urgente</b>, y {callback}.",
      contactInfo: "📞 Llame o mande mensaje al <a href='{phoneHref}'>{phone}</a><br>✉️ {email}<br>🕒 {hours}<br><br>O puedo pedir que alguien le contacte. ¿Quiere dejar sus datos?",
      fallback: "¡Buena pregunta! No quiero adivinar. Puedo pedir que alguien del equipo le responda con la información exacta. <b>¿Me deja su nombre y número?</b>",
      askElseReply: "¡Claro! Pregúnteme lo que quiera sobre servicios, precios, horario o {areaOrLoc}.",
      noProblem: "¡No hay problema! Estoy aquí 24/7 si necesita algo. ¿Algo más en que le pueda ayudar?",
      welcome: "¡De nada! 😊 ¿Algo más en que le pueda ayudar?", bye: "¡Gracias por visitarnos! Si necesita algo, estoy aquí 24/7. 👋",
      hi: "¡Hola! 👋 ¿En qué le puedo ayudar hoy?", switched: "¡Claro! Con gusto le atiendo en español. 🙂",
      leadUrgent: "⚡ Entendido, lo marco como <b>URGENTE</b>. Solo necesito unos datos para contactarle.",
      leadContact: "Con gusto le contactamos. Solo necesito unos datos:",
      leadIntro: "¡Perfecto! Vamos a agendarle. Toma como un minuto. 🙂",
      noted: "Anoté {items}.", notedIssue: "el problema: <i>“{issue}”</i>", notedCity: "la ubicación: <b>{city}</b>", notedAnd: " y ",
      askIssue: "¿En qué le podemos ayudar? Toque una opción o descríbalo en pocas palabras.", askName: "¿Cuál es su nombre?",
      askPhone: "¡Gracias{first}! ¿Cuál es el mejor <b>número de celular</b> para contactarle? (Le mandamos mensajes sobre su cita.)",
      askEmail: "¿Y su <b>correo electrónico</b> para la confirmación? (Opcional)", askCity: "¿En qué <b>ciudad o código postal</b> está la propiedad?",
      askCityOther: "Está bien. Escriba su ciudad o código postal.", backTo: "Sigamos con su solicitud:",
      retryIssue: "¿Me lo puede describir en pocas palabras?", retryName: "Perdón, no entendí su nombre.",
      retryPhone: "Mmm, ese no parece un número de teléfono de 10 dígitos.", retryEmail: "Ese correo no parece correcto. Intente de nuevo o toque Omitir.",
      retryCustom: "¿Me da un poco más de detalle?",
      outOfArea: "Gracias. {city} podría estar fuera de nuestra área normal; lo anoto y la oficina le confirma.",
      cancelled: "Está bien, lo cancelé. ¿Algo más en que le pueda ayudar?",
      tooMany: "¡Gracias! Ya recibimos varias solicitudes desde este dispositivo. Por favor llame al <a href='{phoneHref}'>{phone}</a> para atenderle de inmediato.",
      reqAsk: "¡Ya casi! 📅 ¿Qué <b>día</b> y <b>horario de {word}</b> le acomodan? La oficina le confirma la hora exacta.",
      reqPickDay: "Elija un día", reqPickWin: "Elija un horario", reqAsap: "⚡ Lo antes posible (urgente)", reqFirst: "Lo más pronto disponible", anyTime: "Cualquier hora",
      tomorrow: "Mañana",
      callInstead: "📞 Mejor llámenme", callbackAsk: "Está bien. ¿A qué hora le conviene que le llamemos?",
      cbMorning: "En la mañana", cbAfternoon: "En la tarde", cbEvening: "En la noche", cbAsap: "Lo antes posible", callbackPrefix: "Llamar: ",
      extAsk: "Último paso: elija una hora en nuestra página de citas en línea. Ya llené sus datos donde se pudo. 👇",
      extBtn: "Elegir mi hora →", extCopy: "📋 Copiar mis datos", extCopied: "¡Copiado!",
      calAsk: "¡Ya casi! 📅 Elija el horario de llegada que le acomode:", booked: "Ocupado", noneWork: "📞 ¿Ninguno le sirve? Mejor llámenme",
      requested: "Solicitado: ",
      tBooked: "¡Cita confirmada!", tRequest: "¡Solicitud recibida!", tUrgent: "¡Solicitud urgente enviada!", tExternal: "¡Ya casi!",
      ref: "Confirmación #{id}", lService: "Servicio", lWhen: "Cuándo", lWhere: "Dónde", lContact: "Contacto",
      general: "Pregunta general / llamada", weCall: "Le llamaremos para agendar", urgentTag: "URGENTE",
      nUrgentAfter: "Ya avisamos a nuestro equipo de guardia y le contactarán en breve.",
      nAfterReq: "La oficina le mandará un mensaje a primera hora para confirmar su horario.",
      nBooked: "Le mandaremos un recordatorio un día antes. {arrival}",
      nRequest: "La oficina le llamará o mandará mensaje en breve para confirmar la hora exacta.",
      nExternal: "Termine de elegir su hora en la página de citas. De todos modos ya tenemos sus datos.",
      nCallback: "Alguien de nuestro equipo le llamará.",
      demoNote: "Solo demostración: no se creó una cita real. En una instalación real, el dueño recibe este contacto al instante por correo (y alerta en su teléfono).",
      anythingElse: "¡Gracias, {first}! ¿Hay algo más en que le pueda ayudar?", friend: "amigo/a"
    }
  };
  function t(key, vars) {
    var o = (C.strings && C.strings[LANG] && C.strings[LANG][key]);
    var s = o != null ? o : (STR[LANG] && STR[LANG][key] != null ? STR[LANG][key] : (STR.en[key] != null ? STR.en[key] : key));
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : (GLOBALS()[k] != null ? GLOBALS()[k] : m); });
  }
  function GLOBALS() {
    var b = C.business;
    return { biz: esc(b.name), bot: esc(L(C.bot.name)), phone: esc(b.phone), phoneHref: esc(b.phoneHref), email: esc(b.email),
      license: esc(b.license), address: esc(b.address), name: esc(b.name), area: esc(L(C.serviceArea.summary)),
      callback: esc(L(C.emergency.callbackPromise)), areaOrLoc: C.shopBased ? STR[LANG].locWord : STR[LANG].areaWord };
  }
  function fill(tpl) { return String(L(tpl)).replace(/\{(\w+)\}/g, function (m, k) { var g = GLOBALS(); return g[k] != null ? g[k] : m; }); }

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function deaccent(s) { return s.normalize ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : s; }
  function norm(s) { return deaccent(String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[¿¡]/g, " ").replace(/\s+/g, " ").trim()); }
  function rxEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  var RXC = {};
  function phraseRx(p) {
    if (RXC[p]) return RXC[p];
    var src = (p.charAt(0) === "/" && p.lastIndexOf("/") > 0) ? p.slice(1, p.lastIndexOf("/")) : p;
    var isRx = /[\\()[\]?*+|{}^$]/.test(src) && !/^[\w '\/.-]+$/.test(src);
    var body = isRx ? src : rxEsc(deaccent(src.toLowerCase()));
    return (RXC[p] = new RegExp("(^|[^a-z0-9])(?:" + body + ")(?=[^a-z0-9]|$)", "i"));
  }
  function anyRx(list, t) { for (var i = 0; i < (list || []).length; i++) { try { if (phraseRx(list[i]).test(t)) return list[i]; } catch (e) {} } return null; }
  function load(key, dflt) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? dflt : v; } catch (e) { return dflt; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function emit(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {} }

  /* ---------------- time / after-hours ---------------- */
  function bizNow(offsetDays) {
    var parts = new Intl.DateTimeFormat("en-US", { timeZone: C.business.timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(new Date());
    var o = {}; parts.forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, min: +o.minute, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday) };
  }
  function demoMode() { return (C.business.isDemo && params.get("mode")) || load(MODE_KEY, "auto"); }
  function isOpen() {
    var mode = C.business.isDemo ? demoMode() : "auto";
    if (mode === "afterhours") return false;
    if (mode === "open") return true;
    var n = bizNow(), hrs = C.hours[n.dow];
    if (!hrs) return false;
    var tt = n.h + n.min / 60;
    return tt >= hrs[0] && tt < hrs[1];
  }

  /* ---------------- service area ---------------- */
  var CITY_LIST = C.serviceArea.cities || [];
  function findCity(text) {
    var tx = norm(text);
    var zip = tx.match(/\b(9\d{4})\b/);
    if (zip) {
      if (C.serviceArea.zips[zip[1]]) return { covered: true, city: C.serviceArea.zips[zip[1]], zip: zip[1] };
      return { covered: false, city: zip[1], zip: zip[1], unknown: true };
    }
    for (var i = 0; i < CITY_LIST.length; i++) { if (phraseRx(CITY_LIST[i]).test(tx)) return { covered: true, city: CITY_LIST[i] }; }
    if (CITY_LIST.indexOf("Apple Valley") !== -1 && /\b(apple v)\b/.test(tx)) return { covered: true, city: "Apple Valley" };
    if (CITY_LIST.indexOf("Victorville") !== -1 && /\bvville\b|\bvictor\b/.test(tx)) return { covered: true, city: "Victorville" };
    if (CITY_LIST.indexOf("Spring Valley Lake") !== -1 && /\bsvl\b/.test(tx)) return { covered: true, city: "Spring Valley Lake" };
    var nc = C.serviceArea.nearbyNotCovered || [];
    for (var j = 0; j < nc.length; j++) { if (phraseRx(nc[j]).test(tx)) return { covered: false, city: nc[j] }; }
    return null;
  }

  /* ---------------- intents (English + Spanish, matched on lowercase, accent-free text) ---------------- */
  var INTENTS = {
    human:     /\b(human|real person|live person|agent|representative|talk to (someone|somebody|a person)|speak (to|with)|call me|operator|persona real|hablar con (alguien|una persona)|humano|agente|representante|llamenme|llamame)\b/,
    hours:     /\b(hours?|open|opening|close[sd]?|closing|what time|when are you|business days|saturdays?|sundays?|weekends?|holidays?|horario|horas|abren|abierto|cierran|cerrado|que hora|a que hora|sabados?|domingos?|fin de semana|dias festivos)\b/,
    area:      /\b(service area|areas?|serve|servic(e|ing) (my|in|near)|cover|come (to|out to)|cities|city|located|location|where are you|address|directions|zip|near me|my area|area de servicio|zona|cubren|dan servicio en|vienen a|ciudad|codigo postal|donde (estan|quedan|se ubican)|ubicacion|direccion)\b/,
    pricing:   /\b(prices?|priced|pricing|costs?|how much|charges?|fees?|rates?|quotes?|estimates?|expensive|cheap|ballpark|precios?|cuanto|costo|cuesta|cobran|tarifas?|presupuesto|cotizacion|caro|barato)\b/,
    financing: /\b(financ\w*|payment plans?|monthly payments?|credit(?! card)|0%|no interest|pay over time|afford|financiamiento|financiar|plan de pagos|pagos mensuales|a meses|credito)\b/,
    plan:      /\b(maintenance plans?|membership|member|club|service plan|service agreement|annual plan|quarterly plan|plan de mantenimiento|membresia|socio|plan anual|plan trimestral)\b/,
    booking:   /\b(book|booking|schedule|appointment|appt|come out|send (a |someone|somebody|a tech)|technician out|tech out|get (someone|a tech) out|availability|next opening|soonest|set up a visit|drop (it |my car |the car )?off|bring (it|my car|the car) in|agendar|agenda|cita|programar|reservar|que venga|manden a alguien|mandar a alguien|disponibilidad|llevar (mi|el) (carro|coche|auto))\b/,
    services:  /\b(services?|what do you (do|offer)|offer|help with|do you (do|fix|repair|work on)|servicios?|que hacen|que ofrecen|ofrecen|trabajan con|arreglan|reparan)\b/,
    contact:   /\b(phone|number|call you|email|contact|reach you|text you|telefono|numero|correo|contacto|llamarles|comunicarme)\b/,
    emergency: /\b(emergenc\w*|urgent\w*|asap|right now|tonight|24\/7|24-7|after ?hours|on[- ]call|emergencia|urgente|lo antes posible|ahorita mismo|ahora mismo|esta noche|de inmediato)\b/,
    greeting:  /^(hi|hello|hey|hiya|howdy|yo|good (morning|afternoon|evening)|hola|buenos dias|buenas( tardes| noches)?|buen dia)\b/,
    thanks:    /\b(thanks?|thank you|thx|ty|appreciate it|gracias)\b/,
    bye:       /\b(bye|goodbye|that'?s all|nothing else|i'?m good|all set|adios|es todo|nada mas|hasta luego)\b/,
    yes:       /^(y|yes|yeah|yep|yup|sure|ok|okay|please|definitely|absolutely|sounds good|let'?s do it|do it|si|claro|por favor|dale|esta bien|de acuerdo|perfecto|orale|va)\b/,
    no:        /^(n|no|nope|nah|not now|maybe later|no thanks|no thank you|no gracias|ahorita no|luego|despues)([ .!,]*|[ ,]+(thanks|thank you|gracias|i'?m (good|fine)|estoy bien)[ .!]*)$/
  };
  var PROBLEM_RX = /\b(not|won'?t|isn'?t|doesn'?t|aren'?t|stopped|broken|broke|leak\w*|nois\w*|loud|rattl\w*|squeal\w*|grind\w*|buzz\w*|smell\w*|frozen|trip\w*|keeps|weird|making a|clog\w*|backed up|stuck|dead|cracked|damaged|missing|flicker\w*|dripping|overheat\w*|shak\w*|blowing|warm air|hot air|cold air|no (heat|ac|a\/c|air|hot water|water|power|cooling)|out of|light is on|sin (agua|luz|calefaccion|aire|agua caliente)|no funciona|no sirve|no prende|no enciende|no enfria|no calienta|no arranca|se descompuso|descompuest\w*|roto|rota|fuga|gotea\w*|ruido\w*|tapad\w*|atascad\w*|no abre|no cierra|danad\w*|huele|se calienta)\b/;
  var OBJ_RX = /\b(unit|system|it|door|gate|roof|ceiling|toilet|sink|faucet|drain|pipes?|water heater|outlets?|breakers?|panel|lights?|car|truck|vehicle|engine|brakes?|furnace|heater|ac|opener|inverter|battery|carro|coche|camioneta|puerta|techo|inodoro|lavabo|tuberia|enchufe|luz|luces|motor|frenos|equipo|calentador)\b/;
  var GENERIC_EMERG_RX = /^(it'?s an |this is an |i have an |es una |tengo una )?(emergency|urgent|emergencia|urgente)( help)?$/;

  // "Hola, necesito una cita, mi aire no enfría" -> "Mi aire no enfría" (what the owner actually needs to read)
  function cleanIssue(x) {
    var s0 = String(x || "").trim(), s = s0;
    s = s.replace(/^(hi|hello|hey|hola|buen[oa]s?(\s+(d[ií]as|tardes|noches))?)[\s,!.¡]+/i, "");
    s = s.replace(/^(i('d| would)? (like|need|want) to (book|schedule|set up)|can i (book|schedule)|necesito|quiero|quisiera)\s+(an? |una |un )?(appointment|service call|visit|cita|visita)( para)?[\s,.;:-]*/i, "");
    s = s.replace(/^(and|because|y|porque)\s+/i, "");
    return s.length > 2 ? s.charAt(0).toUpperCase() + s.slice(1) : s0;
  }
  function matchService(tx) {
    var best = null, bestLen = 0;
    (C.services || []).forEach(function (s) {
      (s.keywords || []).forEach(function (k) {
        if (k.length > bestLen && phraseRx(k).test(tx)) { best = s; bestLen = k.length; }
      });
    });
    return best;
  }
  function detect(text) {
    var tx = norm(text), hits = {};
    Object.keys(INTENTS).forEach(function (k) { if (INTENTS[k].test(tx)) hits[k] = true; });
    if (/\b9\d{4}\b/.test(tx)) hits.area = true;
    if (findCity(text)) hits.city = true;
    if (C.maintenancePlan && C.maintenancePlan.name && phraseRx(C.maintenancePlan.name).test(tx)) hits.plan = true;
    if (!C.maintenancePlan) delete hits.plan;
    if (anyRx(C.emergency.patterns, tx)) hits.emergency = true;
    var safety = null;
    (C.safety || []).some(function (s) { if (anyRx(s.patterns, tx)) { safety = s; return true; } return false; });
    var faq = null;
    (C.faqs || []).some(function (f) { if (anyRx(f.patterns, tx)) { faq = f; return true; } return false; });
    var svc = matchService(tx);
    var words = tx.split(" ").length;
    if (hits.yes && words > 6) delete hits.yes;
    var problem = PROBLEM_RX.test(tx) && (!!svc || OBJ_RX.test(tx));
    return { t: tx, hits: hits, faq: faq, safety: safety, svc: svc, problem: !!problem };
  }

  /* ---------------- Spanish auto-detect ---------------- */
  var ES_STRONG = /\b(hola|gracias|necesito|cuanto|cuesta|quiero|tienen|puede[ns]?|por favor|buenos dias|buenas|precio|precios|cita|ayuda|no funciona|no sirve|no prende|mi casa|mi carro|estan|abren|donde|usted(es)?|hacen|tengo|se descompuso|presupuesto|aire acondicionado|calefaccion|plomero|fuga|techo|cucarachas|cochera|garaje|llanta|frenos|choque|ahorita|cuando|manana)\b/g;
  var ES_WEAK = /\b(el|la|los|las|de|del|que|y|en|mi|es|para|con|por|una?|muy|tambien|pero|como|esta|hay|se|le|me|su|lo)\b/g;
  function spanishScore(raw) {
    var tx = norm(raw), s = 0;
    if (/[¿¡ñ]/.test(raw)) s += 3;
    s += ((tx.match(ES_STRONG) || []).length) * 2;
    s += ((tx.match(ES_WEAK) || []).length) * 0.6;
    if (/\b(the|my|is|are|you|your|what|how|do|does|can|need|have|please|and)\b/.test(tx)) s -= 2;
    return s;
  }

  var EN_WORDS = /\b(the|my|is|are|you|your|what|how|do|does|can|need|have|please|and|serve|much|hours|open|i|it|we|don'?t|i'?m|when|much|book|price)\b/g;
  function englishScore(raw) { var m = norm(raw).match(EN_WORDS) || []; return m.filter(function (w, i) { return m.indexOf(w) === i; }).length; }

  /* ---------------- lead delivery: webhook POST with retry, fallback and offline outbox ---------------- */
  var OUTBOX_KEY = LEADS_KEY + "_outbox";
  var DELIVERY_RETRY_DELAYS = C.leads.retryDelays || [1500, 4000];
  function providerFor(url) {
    var p = C.leads.provider || "auto";
    if (p !== "auto") return p;
    if (/script\.google(usercontent)?\.com/i.test(url)) return "apps-script";
    if (/formspree\.io/i.test(url)) return "formspree";
    return "json";
  }
  function payloadFor(L) {
    var p = {
      lead_id: L.id, created_at: L.createdAt, business: C.business.name, trade: C.trade,
      name: L.name || "", phone: L.phone || "", email: L.email || "", city: L.city || "", issue: L.issue || "",
      when: L.slot || L.preferredTime || "", status: L.status || "", urgent: L.emergency ? "yes" : "no",
      after_hours: L.afterHours ? "yes" : "no", contact_only: L.contactOnly ? "yes" : "no", language: L.lang || "en",
      details: "", page_url: location.href.split("#")[0], source: "Website chat"
    };
    var det = [];
    Object.keys(L.custom || {}).forEach(function (k) { p[k] = L.custom[k]; det.push((L.customLabels && L.customLabels[k] || k) + ": " + L.custom[k]); });
    if (L.outOfArea) det.push("Outside usual service area (confirm coverage)");
    p.details = det.join(" · ");
    if (C.leads.token) p.token = C.leads.token;
    p._subject = (L.emergency ? "🚨 URGENT " : "") + "New website lead: " + (L.name || "") + " – " + (L.issue || "call back");
    if (L.email) p._replyto = L.email;
    return p;
  }
  function formBody(p) { var f = new URLSearchParams(); Object.keys(p).forEach(function (k) { f.append(k, p[k] == null ? "" : String(p[k])); }); return f; }
  function postOnce(url, prov, p) {
    var ctl = window.AbortController ? new AbortController() : null, timer = null;
    var opts;
    if (prov === "apps-script" || prov === "form") opts = { method: "POST", body: formBody(p), redirect: "follow" };
    else if (prov === "formspree") opts = { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(p) };
    else opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) };
    if (ctl) { opts.signal = ctl.signal; timer = setTimeout(function () { ctl.abort(); }, C.leads.timeoutMs || 10000); }
    return fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      if (res.ok) return res.text().then(function (txt) {
        var j = null; try { j = JSON.parse(txt); } catch (e) {}
        if (j && (j.ok === false || j.result === "error")) { var e2 = new Error(j.error || "Rejected by endpoint"); e2.fatal = true; throw e2; }
        return "delivered";
      });
      var e = new Error("HTTP " + res.status); e.status = res.status;
      e.fatal = res.status >= 400 && res.status < 500 && [408, 425, 429].indexOf(res.status) === -1;
      throw e;
    }, function (err) { clearTimeout(timer); err.network = true; throw err; });
  }
  function postNoCors(url, p) {
    // Opaque "simple" request: works even when the endpoint sends no CORS headers, but we can't read the reply.
    return fetch(url, { method: "POST", mode: "no-cors", body: formBody(p) }).then(function () { return "sent-unconfirmed"; });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function attemptDelivery(L) {
    var url = C.leads.webhookUrl, prov = providerFor(url), p = payloadFor(L), tries = 0, lastErr = "";
    var delays = [0].concat(DELIVERY_RETRY_DELAYS);
    function attempt(i) {
      if (i >= delays.length) return Promise.resolve({ status: "queued", attempts: tries, error: lastErr });
      return wait(delays[i]).then(function () {
        tries++;
        return postOnce(url, prov, p).then(function (st) { return { status: st, attempts: tries }; }, function (err) {
          lastErr = err.message || String(err);
          if (err.fatal) return { status: "failed", attempts: tries, error: lastErr };
          if (err.network && navigator.onLine !== false && !(err.name === "AbortError")) {
            // Probably CORS (endpoint didn't allow reading the reply). Fall back to an opaque form POST.
            return postNoCors(url, p).then(function (st) { return { status: st, attempts: tries, error: "CORS: reply not readable" }; },
              function (e2) { lastErr = e2.message || lastErr; return attempt(i + 1); });
          }
          return attempt(i + 1);
        });
      });
    }
    return attempt(0);
  }
  function updateLead(id, patch) {
    var leads = load(LEADS_KEY, []);
    leads.forEach(function (l) { if (l.id === id) Object.keys(patch).forEach(function (k) { l[k] = patch[k]; }); });
    save(LEADS_KEY, leads);
  }
  function setOutbox(id, add) {
    var ob = load(OUTBOX_KEY, []).filter(function (x) { return x !== id; });
    if (add) ob.push(id);
    save(OUTBOX_KEY, ob);
  }
  // Care plan: unanswered questions also go to an "Unanswered" tab in the client's Sheet (Apps Script only; never Formspree).
  var unansweredSent = 0;
  function logUnansweredRemote(q) {
    var url = C.leads.webhookUrl, on = C.leads.logUnanswered;
    if (!url || (on === undefined ? providerFor(url) !== "apps-script" : !on) || ++unansweredSent > 10) return;
    var p = { type: "unanswered", question: String(q).slice(0, 400), language: LANG, business: C.business.name, trade: C.trade,
      page_url: location.href.split("#")[0], created_at: new Date().toISOString() };
    if (C.leads.token) p.token = C.leads.token;
    try { fetch(url, { method: "POST", mode: "no-cors", body: formBody(p) }).catch(function () {}); } catch (e) {}
  }
  var inFlight = {};
  function deliver(L) {
    if (!C.leads.webhookUrl) {
      var r0 = { status: "local-only", attempts: 0, at: new Date().toISOString() };
      updateLead(L.id, { delivery: r0 }); emit("tecbot:delivery", { id: L.id, delivery: r0 });
      return Promise.resolve(r0);
    }
    if (inFlight[L.id]) return inFlight[L.id];
    setOutbox(L.id, true);
    updateLead(L.id, { delivery: { status: "sending", attempts: 0 } });
    var pr = attemptDelivery(L).then(function (r) {
      r.at = new Date().toISOString();
      if (r.status === "delivered" || r.status === "sent-unconfirmed" || r.status === "failed") setOutbox(L.id, false);
      updateLead(L.id, { delivery: r });
      emit("tecbot:delivery", { id: L.id, delivery: r });
      delete inFlight[L.id];
      return r;
    });
    inFlight[L.id] = pr;
    return pr;
  }
  function flushOutbox() {
    var ids = load(OUTBOX_KEY, []);
    if (!ids.length || !C.leads.webhookUrl) return Promise.resolve([]);
    var leads = load(LEADS_KEY, []);
    return Promise.all(ids.map(function (id) {
      var L = leads.filter(function (l) { return l.id === id; })[0];
      if (!L) { setOutbox(id, false); return null; }
      return deliver(L);
    }));
  }
  function beaconOutbox() {
    if (!navigator.sendBeacon || !C.leads.webhookUrl) return;
    var leads = load(LEADS_KEY, []);
    load(OUTBOX_KEY, []).forEach(function (id) {
      if (inFlight[id]) return;
      var L = leads.filter(function (l) { return l.id === id; })[0];
      if (L && navigator.sendBeacon(C.leads.webhookUrl, formBody(payloadFor(L)))) {
        setOutbox(id, false); updateLead(id, { delivery: { status: "sent-unconfirmed", attempts: ((L.delivery || {}).attempts || 0) + 1, via: "beacon", at: new Date().toISOString() } });
      }
    });
  }
  window.addEventListener("online", function () { flushOutbox(); });
  window.addEventListener("pagehide", beaconOutbox);

  /* ---------------- state ---------------- */
  var S = { open: false, flow: null, step: null, lead: null, offer: null, pendingIssue: "", pendingEmergency: false, started: false, history: [], selDay: 0, knownCity: "", lastQuick: null };

  /* ---------------- DOM ---------------- */
  var root, panel, msgs, quick, input, form, launcher, teaser, statusEl, langBtn, footEl;
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function injectCSS() {
    if (document.querySelector('link[data-tecchat]')) return;
    var href = SCRIPT_SRC ? SCRIPT_SRC.replace(/[^\/]*$/, "") + "tec-chat.css" : "chatbot/tec-chat.css";
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.setAttribute("data-tecchat", "1");
    document.head.appendChild(l);
  }
  function build() {
    injectCSS();
    root = el("div", "tc-root"); root.id = "tecchat";
    if (C.theme.brand) root.style.setProperty("--tc-brand", C.theme.brand);
    if (C.theme.accent) root.style.setProperty("--tc-accent", C.theme.accent);
    launcher = el("button", "tc-launcher", '<span class="tc-launch-ico" aria-hidden="true">💬</span><span class="tc-launch-x" aria-hidden="true">✕</span><span class="tc-badge" aria-hidden="true">1</span>');
    launcher.type = "button";
    teaser = el("div", "tc-teaser");
    panel = el("section", "tc-panel");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Chat with " + C.business.shortName);
    panel.innerHTML =
      '<header class="tc-head">' +
        '<div class="tc-av" aria-hidden="true">' + esc(C.bot.avatar) + '</div>' +
        '<div class="tc-head-txt"><div class="tc-title">' + esc(L(C.bot.name)) + ' · ' + esc(C.business.shortName) + '</div>' +
        '<div class="tc-status"><span class="tc-dot"></span><span class="tc-status-txt"></span></div></div>' +
        (LANGS.length > 1 ? '<button class="tc-hbtn tc-lang" type="button"></button>' : '') +
        '<button class="tc-hbtn tc-restart" type="button">↻</button>' +
        '<button class="tc-hbtn tc-close" type="button">✕</button>' +
      '</header>' +
      '<div class="tc-msgs" aria-live="polite"></div>' +
      '<div class="tc-quick"></div>' +
      '<form class="tc-form" autocomplete="off"><input class="tc-input" type="text" aria-label="Message" maxlength="400"/>' +
      '<button class="tc-send" type="submit">➤</button></form>' +
      '<div class="tc-foot"></div>';
    root.appendChild(panel); root.appendChild(teaser); root.appendChild(launcher);
    document.body.appendChild(root);
    msgs = panel.querySelector(".tc-msgs"); quick = panel.querySelector(".tc-quick");
    input = panel.querySelector(".tc-input"); form = panel.querySelector(".tc-form");
    statusEl = panel.querySelector(".tc-status"); langBtn = panel.querySelector(".tc-lang"); footEl = panel.querySelector(".tc-foot");
    applyLangUI();

    launcher.addEventListener("click", function () { S.open ? close() : open(); });
    panel.querySelector(".tc-close").addEventListener("click", close);
    panel.querySelector(".tc-restart").addEventListener("click", reset);
    if (langBtn) langBtn.addEventListener("click", function () { setLang(LANG === "es" ? "en" : "es", true); });
    teaser.addEventListener("click", function (e) { if (e.target.classList.contains("tc-teaser-x")) { teaser.classList.remove("show"); e.stopPropagation(); return; } open(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); var v = input.value.trim(); if (!v) return; input.value = ""; userSays(v); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.open) close(); });
    document.addEventListener("click", function (e) {
      var tg = e.target.closest && e.target.closest("[data-tecchat-open]");
      if (tg) { e.preventDefault(); open(); var q = tg.getAttribute("data-tecchat-open"); if (q) setTimeout(function () { userSays(q); }, FAST ? 10 : 350); }
    });
    if (!FAST) setTimeout(function () { if (!S.open && !S.started) teaser.classList.add("show"); }, 2500);
    setTimeout(flushOutbox, 1500);
  }
  function applyLangUI() {
    document.documentElement.setAttribute("data-tecchat-lang", LANG);
    root.setAttribute("lang", LANG);
    launcher.setAttribute("aria-label", S.open ? t("close") : t("openChat", { biz: esc(C.business.shortName) }));
    teaser.innerHTML = '<button class="tc-teaser-x" aria-label="Dismiss">✕</button><div class="tc-teaser-av">' + esc(C.bot.avatar) + '</div><div>' + esc(L(C.bot.teaser)) + '</div>';
    input.placeholder = t("placeholder");
    panel.querySelector(".tc-send").setAttribute("aria-label", t("send"));
    panel.querySelector(".tc-restart").setAttribute("aria-label", t("restart")); panel.querySelector(".tc-restart").title = t("restart");
    panel.querySelector(".tc-close").setAttribute("aria-label", t("close")); panel.querySelector(".tc-close").title = t("close");
    if (langBtn) { langBtn.textContent = t("langBtn"); langBtn.title = t("langTitle"); langBtn.setAttribute("aria-label", t("langTitle")); }
    footEl.innerHTML = esc(L(C.bot.disclaimer)) + (C.business.isDemo ? ' <b>' + t("demoBy") + '</b>' : '');
    if (statusEl) setStatus();
  }
  function setLang(l, announce) {
    if (!okLang(l) || (l === LANG && !announce)) return;
    LANG = l; sset("tecbot_lang", l); applyLangUI();
    emit("tecbot:lang", { lang: l });
    if (!announce || !msgs) return;
    if (!S.started) return;
    say(t("switched"));
    if (S.flow === "lead" && S.step) { quick.innerHTML = ""; return ask(S.step); }
    return say(t("hi"), { quick: mainChips() });
  }
  function setStatus() {
    var openNow = isOpen();
    root.classList.toggle("tc-after", !openNow);
    statusEl.querySelector(".tc-status-txt").textContent = openNow ? t("online") : t("after");
  }
  function open() {
    S.open = true; root.classList.add("tc-open"); teaser.classList.remove("show");
    launcher.setAttribute("aria-label", t("close"));
    document.documentElement.classList.add("tc-lock");
    setStatus();
    if (!S.started) greet();
    setTimeout(function () { if (window.matchMedia("(min-width: 521px)").matches) input.focus(); }, 50);
  }
  function close() {
    S.open = false; root.classList.remove("tc-open");
    launcher.setAttribute("aria-label", t("openChat", { biz: esc(C.business.shortName) }));
    document.documentElement.classList.remove("tc-lock");
  }
  function reset() {
    msgs.innerHTML = ""; quick.innerHTML = "";
    S.flow = null; S.step = null; S.lead = null; S.offer = null; S.pendingIssue = ""; S.pendingEmergency = false; S.started = false; S.history = []; S.knownCity = "";
    queue = Promise.resolve();
    setStatus(); greet();
  }

  /* ---------------- message rendering ---------------- */
  var queue = Promise.resolve();
  function scroll() { msgs.scrollTop = msgs.scrollHeight; }
  function addRow(who, node) {
    var row = el("div", "tc-row tc-" + who);
    if (who === "bot") row.appendChild(el("div", "tc-mini-av", esc(C.bot.avatar)));
    row.appendChild(node); msgs.appendChild(row); scroll(); return row;
  }
  function say(html, opts) {
    opts = opts || {};
    queue = queue.then(function () {
      return new Promise(function (resolve) {
        var typing = addRow("bot", el("div", "tc-bubble tc-typing", "<i></i><i></i><i></i>"));
        var plain = String(html).replace(/<[^>]+>/g, "");
        var delay = FAST ? 20 : Math.min(1500, (C.bot.typingDelayMs || 600) + plain.length * 4);
        setTimeout(function () {
          typing.remove();
          var b = el("div", "tc-bubble" + (opts.cls ? " " + opts.cls : ""), html);
          addRow("bot", b);
          S.history.push({ role: "assistant", content: plain });
          if (opts.node) b.appendChild(opts.node);
          if (opts.quick) setQuick(opts.quick);
          if (opts.after) opts.after(b);
          scroll(); resolve();
        }, delay);
      });
    });
    return queue;
  }
  function setQuick(items) {
    quick.innerHTML = "";
    (items || []).forEach(function (q) {
      if (!q) return;
      var label = typeof q === "string" ? q : q.label;
      var b = el("button", "tc-chip", esc(label)); b.type = "button";
      b.addEventListener("click", function () {
        if (q.action) { quick.innerHTML = ""; S.started = true; addRow("user", el("div", "tc-bubble", esc(label))); S.history.push({ role: "user", content: label }); q.action(); }
        else userSays(q.send || label);
      });
      quick.appendChild(b);
    });
    scroll();
  }
  function userSays(text) {
    quick.innerHTML = "";
    S.started = true;
    addRow("user", el("div", "tc-bubble", esc(text)));
    S.history.push({ role: "user", content: text });
    handle(text);
  }

  /* ---------------- chips (actions are language-proof) ---------------- */
  function chip(label, fn) { return { label: label, action: fn }; }
  var CH = {
    book: function () { return chip(t(C.shopBased ? "cBookShop" : "cBook"), function () { startLead({ emergency: S.pendingEmergency }); }); },
    yesBook: function () { return chip(t("cYesBook"), function () { startLead({ emergency: S.pendingEmergency }); }); },
    pricing: function () { return (C.pricing.items || []).length ? chip(t("cPricing"), function () { A.pricing(detect("")); }) : null; },
    area: function () { return chip(t(C.shopBased ? "cLoc" : "cArea"), function () { A.area(""); }); },
    showArea: function () { return chip(t("cShowArea"), function () { A.area(""); }); },
    hours: function () { return chip(t("cHours"), function () { A.hours(); }); },
    plan: function () { return C.maintenancePlan ? chip(t("cPlan", { plan: esc(L(C.maintenancePlan.name)) }), function () { A.plan(); }) : null; },
    emerg: function () { return chip(t("cEmerg"), function () { A.emergency(""); }); },
    emergIs: function () { return chip(t("cEmergIs"), function () { A.emergency(""); }); },
    financing: function () { return C.financing ? chip(t("cFinancing"), function () { A.financing(); }) : null; },
    services: function () { return chip(t("cServices"), function () { A.services(); }); },
    contactMe: function () { return chip(t("cContactMe"), function () { startLead({ contactOnly: true }); }); },
    urgent: function () { return chip(t("cUrgent"), function () { startLead({ emergency: true }); }); },
    askElse: function () { return chip(t("cAskElse"), function () { say(t("askElseReply"), { quick: mainChips() }); }); },
    thatsAll: function () { return chip(t("cThatsAll"), function () { say(t("bye")); }); },
    noThanks: function () { return chip(t("cNoThanks"), function () { S.offer = null; S.pendingEmergency = false; say(t("noProblem"), { quick: mainChips() }); }); },
    signUp: function () { return C.maintenancePlan ? chip(t("cSignUp"), function () { S.pendingIssue = S.pendingIssue || L(C.maintenancePlan.name); startLead({}); }) : null; }
  };
  function chips(keys) { return keys.map(function (k) { return CH[k] ? CH[k]() : null; }).filter(Boolean).slice(0, 6); }
  function mainChips() {
    var k = ["book", "pricing", "area", "hours", "plan"];
    if (C.emergency.available24x7) k.push("emerg"); else k.push("services");
    return chips(k);
  }

  function greet() {
    S.started = true;
    say(t("greet1"));
    if (isOpen()) return say(t("greet2"), { quick: mainChips() });
    say(t("greetAfter"), { cls: "tc-note-after" });
    if (C.emergency.available24x7) return say(t("greetEmerg", { short: t("greetEmergShort") }), { quick: chips(["emergIs", "book", "pricing", "area", "hours"]) });
    return say(t("greetNoEmerg"), { quick: chips(["book", "pricing", "area", "hours", "services"]) });
  }

  /* ---------------- answers ---------------- */
  function offerBook(prefix) {
    S.offer = "book";
    return say(prefix || t(C.shopBased ? "offerDefaultShop" : "offerDefault"), { quick: chips(["yesBook", "noThanks", "pricing"]) });
  }
  function svcName(s) { return esc(L(s.name)); }
  var A = {
    hours: function () {
      return say(t("hoursTitle") + "<br>" + esc(L(C.hoursText)).replace(/ · /g, "<br>") + "<br><br>" +
        (isOpen() ? t("openNow") : t("closedNow")) + (C.emergency.available24x7 ? t("emerg247") : ""), { quick: chips(["book", C.emergency.available24x7 ? "emerg" : "services", "area"]) });
    },
    area: function (text) {
      var f = text ? findCity(text) : null, sum = esc(L(C.serviceArea.summary));
      if (f && f.covered) {
        S.knownCity = f.city;
        return say(t("areaYes", { city: esc(f.city), zip: f.zip ? " (" + f.zip + ")" : "" }), { quick: chips(["book", "pricing", "hours"]) });
      }
      if (f && !f.covered) { S.offer = "contact"; return say(t("areaNo", { city: esc(f.city), summary: sum }), { quick: chips(["contactMe", "showArea"]) }); }
      if (C.shopBased && C.business.address) {
        var map = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(C.business.address);
        return say(t("shopLoc", { address: esc(C.business.address), summary: sum }) + "<br><a href='" + map + "' target='_blank' rel='noopener'>🗺 Google Maps →</a><br><br>" + esc(L(C.hoursText)), { quick: chips(["book", "hours", "pricing"]) });
      }
      return say(t("areaList", { summary: sum, list: esc(CITY_LIST.join(", ")) }), { quick: chips(["book", "hours"]) });
    },
    pricing: function (d) {
      var items = C.pricing.items || [];
      if (!items.length) return offerBook(t("noPricing"));
      var rows = items.map(function (i) {
        var hl = d && d.t && anyRx(i.keywords, d.t);
        return "<tr" + (hl ? " class='tc-hl'" : "") + "><td>" + esc(L(i.label)) + "</td><td><b>" + esc(L(i.price)) + "</b></td></tr>";
      }).join("");
      return say(t("pricingIntro") + "<table class='tc-table'>" + rows + "</table><div class='tc-disclaim'>⚠️ " + esc(L(C.pricing.disclaimer)) + "</div>",
        { cls: "tc-wide", quick: chips(["book", "financing", "plan", "hours"]) });
    },
    financing: function () {
      var f = C.financing;
      if (!f) return say(t("noFinancing"), { quick: chips(["contactMe", "book"]) });
      return say("💳 " + esc(L(f.text)) + (f.partner ? "<br><small>" + esc(L(f.partner)) + "</small>" : "") +
        (f.link ? "<br><a href='" + esc(f.link) + "' target='_blank' rel='noopener'>" + t("finApply") + "</a>" : (C.business.isDemo ? "<br><small>" + t("finPlaceholder") + "</small>" : "")),
        { quick: chips(["book", "pricing", "contactMe"]) });
    },
    plan: function () {
      var m = C.maintenancePlan;
      if (!m) return A.services();
      var perks = L(m.perks) || [];
      return say("🛠 <b>" + esc(L(m.name)) + ":</b> " + esc(L(m.price)) + "<ul class='tc-ul'>" + perks.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>" + esc(L(m.pitch || "")),
        { quick: chips(["signUp", "pricing", "hours"]) });
    },
    services: function () {
      return say(t("servicesIntro") + "<ul class='tc-ul'>" + C.services.map(function (s) {
        return "<li>" + esc(s.icon || "") + " <b>" + svcName(s) + "</b>: " + esc(L(s.desc)) + "</li>"; }).join("") + "</ul>", { quick: chips(["book", "pricing", "area"]) });
    },
    service: function (s) {
      return say(t("serviceYes", { name: svcName(s).toLowerCase(), desc: esc(L(s.desc)) })).then(function () { return offerBook(t(C.shopBased ? "offerShop" : "offerVisit")); });
    },
    problem: function (d, text) {
      S.pendingIssue = cleanIssue(text);
      var tips = d.svc && d.svc.tips ? L(d.svc.tips) : null, html = t("problemIntro");
      if (tips && tips.length) html += " " + t("tipsIntro") + "<ul class='tc-ul'>" + tips.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
      return say(html).then(function () { return offerBook(tips && tips.length ? t("offerAfterTips") : null); });
    },
    emergency: function (text) {
      var tx = norm(text || "");
      if (tx && !GENERIC_EMERG_RX.test(tx.replace(/^[^a-z]+|[^a-z]+$/g, ""))) S.pendingIssue = S.pendingIssue || cleanIssue(text);
      S.pendingEmergency = true;
      var e = C.emergency, resp = L(e.responseText);
      return say((resp ? "🚨 " + fill(resp) + "<br><br>" : "") + t("emergFastest") + (isOpen() ? t("emergNow") : (e.available24x7 ? t("emergOnCall") : ".")) +
        (L(e.afterHoursFee) ? "<br><small>" + fill(e.afterHoursFee) + "</small>" : ""))
        .then(function () { S.offer = "book"; return say(t("emergOffer"), { quick: chips(["urgent", "noThanks"]) }); });
    },
    safety: function (s) { return say(fill(s.answer), { cls: "tc-warn", quick: chips(["urgent", "hours"]) }); },
    contact: function () {
      S.offer = "contact";
      return say(t("contactInfo", { hours: esc(L(C.hoursText)) }), { quick: chips(["contactMe", "book"]) });
    },
    faq: function (f) { return say(fill(f.answer), { quick: chips(["book", "pricing", "askElse"]) }); },
    fallback: function (text) {
      var log = load(UNANSWERED_KEY, []); log.unshift({ q: text, at: new Date().toISOString(), lang: LANG }); save(UNANSWERED_KEY, log.slice(0, 50));
      emit("tecbot:unanswered", { q: text });
      logUnansweredRemote(text);
      S.offer = "contact";
      return say(t("fallback"), { quick: chips(["contactMe", "services", "area", "hours"]) });
    }
  };

  /* ---------------- router ---------------- */
  function route(text, d) {
    var h = d.hits;
    if (d.safety) return A.safety(d.safety);
    if (S.offer && h.no && !h.booking) { S.offer = null; S.pendingEmergency = false; return say(t("noProblem"), { quick: mainChips() }); }
    if (S.offer && h.yes && !h.no) { var o = S.offer; S.offer = null; return startLead({ contactOnly: o === "contact", emergency: S.pendingEmergency }); }
    if (h.emergency && !h.hours && !h.pricing && !h.booking) return A.emergency(text);
    if (h.booking) {
      if ((d.problem || d.svc) && !S.pendingIssue) S.pendingIssue = cleanIssue(text);
      return startLead({ emergency: h.emergency || S.pendingEmergency });
    }
    if (h.pricing) return A.pricing(d);
    if (h.financing) return A.financing();
    if (d.faq && !d.problem) return A.faq(d.faq);
    if (h.plan && !d.problem) return A.plan();
    // "my garage door won't open" is a problem, not an hours question
    var askHours = h.hours && (!d.problem || /\b(hours?|horario|what time|que hora|a que hora)\b/.test(d.t));
    var askArea = (h.area || (h.city && !d.svc)) && (!d.problem || /\b(serve|service area|cover|zip|area de servicio|cubren|dan servicio)\b/.test(d.t));
    if (askHours && (h.area || h.city)) return A.hours().then(function () { return A.area(text); });
    if (askArea) return A.area(text);
    if (askHours) return A.hours();
    if (d.problem) return A.problem(d, text);
    if (d.svc) return A.service(d.svc);
    if (d.faq) return A.faq(d.faq);
    if (h.services) return A.services();
    if (h.human || h.contact) return A.contact();
    if (h.bye) return say(t("bye"));
    if (h.thanks) return say(t("welcome"), { quick: mainChips() });
    if (h.greeting) return say(t("hi"), { quick: mainChips() });
    return llmOrFallback(text);
  }
  function llmOrFallback(text) {
    var cfg = C.llm || {};
    if (cfg.enabled && cfg.endpoint && window.TecChatLLM) {
      var typing = addRow("bot", el("div", "tc-bubble tc-typing", "<i></i><i></i><i></i>"));
      return window.TecChatLLM.ask(text, S.history.slice(-10), C).then(function (reply) {
        typing.remove();
        if (reply) return say(esc(reply).replace(/\n/g, "<br>"), { quick: chips(["book", "askElse"]) });
        return A.fallback(text);
      }, function () { typing.remove(); return A.fallback(text); });
    }
    return A.fallback(text);
  }
  var TEXT_STEPS = { issue: 1 };
  function handle(text) {
    var canDetect = !S.flow || TEXT_STEPS[S.step] || (C.customSteps && C.customSteps[S.step]);
    if (C.autoDetectSpanish && canDetect && okLang("es")) {
      if (LANG !== "es" && spanishScore(text) >= 3) { setLang("es", false); say(t("switched")); }
      else if (LANG === "es" && okLang("en") && englishScore(text) >= 3 && spanishScore(text) <= 0) { setLang("en", false); say(t("switched")); }
    }
    var d = detect(text);
    if (S.flow === "lead") return leadInput(text, d);
    return route(text, d);
  }

  /* ---------------- lead capture flow ---------------- */
  function leadPrefix() {
    var w = String(C.business.shortName || C.business.name).replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/);
    return (w.map(function (x) { return x.charAt(0); }).join("").slice(0, 3).toUpperCase() || "WEB");
  }
  function steps() {
    var st = (C.leadSteps && C.leadSteps.length ? C.leadSteps : DEFAULTS.leadSteps).slice();
    if (C.shopBased) st = st.filter(function (k) { return k !== "city"; });
    if (S.lead && S.lead.contactOnly) st = st.filter(function (k) { return !(C.customSteps && C.customSteps[k]); });
    if (st.indexOf("slot") === -1) st.push("slot");
    return st;
  }
  function startLead(opts) {
    opts = opts || {};
    S.flow = "lead"; S.offer = null;
    S.lead = {
      id: leadPrefix() + "-" + String(Math.floor(1000 + Math.random() * 9000)),
      issue: S.pendingIssue || "", emergency: !!opts.emergency, contactOnly: !!opts.contactOnly,
      afterHours: !isOpen(), city: C.shopBased ? "" : (S.knownCity || ""), source: "Website chat", createdAt: null,
      custom: {}, customLabels: {}, bookingMode: C.booking.mode
    };
    say(opts.emergency ? t("leadUrgent") : opts.contactOnly ? t("leadContact") : t("leadIntro"));
    var noted = [];
    if (S.lead.issue) noted.push(t("notedIssue", { issue: esc(S.lead.issue) }));
    if (S.lead.city) noted.push(t("notedCity", { city: esc(S.lead.city) }));
    if (noted.length) say(t("noted", { items: noted.join(t("notedAnd")) }));
    return nextStep();
  }
  function firstName() { return ((S.lead && S.lead.name) || "").split(" ")[0]; }
  function nextStep() {
    var st = steps();
    for (var i = 0; i < st.length; i++) {
      var k = st[i];
      if (k === "email") { if (S.lead.email !== undefined) continue; }
      else if (k === "slot") { if (S.lead.slot || S.lead.preferredTime) continue; }
      else if (C.customSteps && C.customSteps[k]) { if (S.lead.custom[k] !== undefined) continue; }
      else if (S.lead[k]) continue;
      S.step = k; return ask(k);
    }
    return finishLead();
  }
  function ask(k, prefix) {
    var p = prefix ? prefix + " " : "";
    var cs = C.customSteps && C.customSteps[k];
    if (cs) {
      var q = (L(cs.chips) || []).slice();
      q.push(chip(t("cSkip"), function () { S.lead.custom[k] = ""; nextStep(); }));
      return say(p + L(cs.prompt), { quick: q });
    }
    switch (k) {
      case "issue": return say(p + t("askIssue"), { quick: L(C.issueChips) || [] });
      case "name": return say(p + t("askName"));
      case "phone": return say(p + t("askPhone", { first: firstName() ? ", " + esc(firstName()) : "" }));
      case "email": return say(p + t("askEmail"), { quick: [chip(t("cSkip"), function () { S.lead.email = ""; nextStep(); })] });
      case "city": return say(p + t("askCity"), { quick: CITY_LIST.slice(0, 4).concat([t("cOther")]) });
      case "slot":
        if (S.lead.contactOnly) return callbackOptions(p);
        if (C.booking.mode === "external") return externalStep(p);
        if (C.booking.mode === "demo-calendar") return showCalendar(p);
        return showRequest(p);
    }
  }
  function leadInput(text, d) {
    var tx = d.t;
    if (/^(cancel|stop|never ?mind|quit|start over|exit|cancelar|olvidalo|ya no|salir)[.!]*$/.test(tx)) {
      S.flow = null; S.step = null; S.lead = null;
      return say(t("cancelled"), { quick: mainChips() });
    }
    if (d.safety) return A.safety(d.safety);
    var isQ = /\?\s*$/.test(text) || /^\s*¿/.test(text);
    if (S.step !== "issue" && isQ && (d.hits.pricing || d.hits.hours || d.hits.area || d.hits.financing || d.hits.plan || d.faq)) {
      var prev = S.flow; S.flow = null;
      var pr = route(text, d);
      S.flow = prev;
      return Promise.resolve(pr).then(function () { return ask(S.step, t("backTo")); });
    }
    var cs = C.customSteps && C.customSteps[S.step];
    if (cs) {
      if (tx.length < 2) return ask(S.step, t("retryCustom"));
      S.lead.custom[S.step] = text.trim(); S.lead.customLabels[S.step] = L(cs.label) || S.step;
      return nextStep();
    }
    switch (S.step) {
      case "issue":
        if (tx.length < 2) return ask("issue", t("retryIssue"));
        S.lead.issue = text.trim();
        if (INTENTS.emergency.test(tx) || anyRx(C.emergency.patterns, tx)) S.lead.emergency = true;
        return nextStep();
      case "name":
        var n = text.replace(/^(hi[, ]+|hola[, ]+)?(my name is|my name's|i am|i'm|im|this is|it's|its|name:?|me llamo|mi nombre es|soy)\s+/i, "").replace(/[^A-Za-zÀ-ÿ' .-]/g, "").trim();
        if (n.length < 2 || /\d/.test(text) || n.split(" ").length > 4) return ask("name", t("retryName"));
        S.lead.name = n.split(" ").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
        return nextStep();
      case "phone":
        var digits = text.replace(/\D/g, "");
        if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.slice(1);
        if (digits.length !== 10) return ask("phone", t("retryPhone"));
        S.lead.phone = "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
        return nextStep();
      case "email":
        if (/^(skip|no|none|n\/a|na|no thanks|nope|omitir|ninguno|no tengo|no gracias)[.!]*$/.test(tx)) { S.lead.email = ""; return nextStep(); }
        var m = text.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i);
        if (!m) return ask("email", t("retryEmail"));
        S.lead.email = m[0].toLowerCase();
        return nextStep();
      case "city":
        if (/^(other|otra|otro)$/.test(tx)) return say(t("askCityOther"));
        var f = findCity(text);
        if (f && f.covered) { S.lead.city = f.city + (f.zip ? " " + f.zip : ""); return nextStep(); }
        S.lead.city = text.trim(); S.lead.outOfArea = true;
        return say(t("outOfArea", { city: esc(text.trim()) })).then(nextStep);
      case "slot":
        if (/\b(call|phone|not sure|flexible|whenever|llam\w*|telefono)\b/.test(tx)) return callbackOptions();
        if (/\b(asap|urgent|emergenc\w*|now|urgente|ahora|ahorita)\b/.test(tx) && S.lead.emergency) return pickWhen({ kind: "asap", label: t("reqAsap") }, true);
        lockWidgets();
        S.lead.preferredTime = t("requested") + text.trim(); S.lead.kind = C.booking.mode === "demo-calendar" ? "callback" : "request";
        return finishLead();
    }
  }

  /* ---------------- booking: shared helpers ---------------- */
  function locale() { return LANG === "es" ? "es-US" : "en-US"; }
  function openDays(n) {
    var now = bizNow(), out = [], i = 1;
    while (out.length < n && i < 21) {
      var dt = new Date(Date.UTC(now.y, now.m - 1, now.d + i)), dow = dt.getUTCDay();
      if (C.hours[dow]) out.push({ key: dt.toISOString().slice(0, 10), dow: dow, hrs: C.hours[dow], i: i,
        label: dt.toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) });
      i++;
    }
    return out;
  }
  function lockWidgets() {
    Array.prototype.forEach.call(msgs.querySelectorAll(".tc-cal button, .tc-req button"), function (b) { b.disabled = true; });
    Array.prototype.forEach.call(msgs.querySelectorAll(".tc-cal, .tc-req"), function (c) { c.classList.add("tc-done"); });
  }
  function pickWhen(w, typed) {
    lockWidgets();
    if (!typed) addRow("user", el("div", "tc-bubble", esc(w.label)));
    if (w.kind === "slot") { S.lead.slot = w.label; S.lead.slotId = w.id || null; S.lead.kind = "booked"; }
    else if (w.kind === "asap") { S.lead.preferredTime = w.label; S.lead.kind = "asap"; S.lead.emergency = true; }
    else { S.lead.preferredTime = w.label; S.lead.requestDay = w.day || ""; S.lead.requestWindow = w.win || ""; S.lead.kind = "request"; }
    return finishLead();
  }
  function callbackOptions(prefix) {
    lockWidgets();
    return say((prefix || "") + t("callbackAsk"), { quick: ["cbMorning", "cbAfternoon", "cbEvening", "cbAsap"].map(function (k) {
      return chip(t(k), function () { S.lead.preferredTime = t("callbackPrefix") + t(k); S.lead.kind = "callback"; finishLead(); });
    }) });
  }
  function callInsteadLink(wrap) {
    var cb = el("button", "tc-link", t("callInstead")); cb.type = "button";
    cb.addEventListener("click", function () { addRow("user", el("div", "tc-bubble", esc(t("callInstead").replace(/^\S+\s/, "")))); callbackOptions(); });
    wrap.appendChild(cb);
  }

  /* ---------------- booking mode "request" (default for real clients) ---------------- */
  function showRequest(prefix) {
    var days = openDays(C.booking.daysAhead || 5), sel = null;
    var wrap = el("div", "tc-req");
    function windowsFor(day) {
      var ws = C.booking.windows || [];
      if (day && day.hrs) ws = ws.filter(function (w) { return w.start < day.hrs[1] && w.end > day.hrs[0]; });
      return ws;
    }
    function render() {
      wrap.innerHTML = "";
      if (S.lead.emergency) {
        var asap = el("button", "tc-slot tc-asap", esc(t("reqAsap"))); asap.type = "button";
        asap.addEventListener("click", function () { pickWhen({ kind: "asap", label: t("reqAsap") }); });
        wrap.appendChild(asap);
      }
      wrap.appendChild(el("div", "tc-req-h", "1 · " + esc(t("reqPickDay"))));
      var dg = el("div", "tc-req-days");
      var opts = [{ key: "first", label: t("reqFirst"), first: true }].concat(days);
      opts.forEach(function (dy) {
        var lab = dy.first ? esc(dy.label) : (dy.i === 1 ? "<span>" + esc(t("tomorrow")) + "</span>" : "") + "<b>" + esc(dy.label) + "</b>";
        var b = el("button", "tc-rday" + (sel && sel.key === dy.key ? " on" : "") + (dy.first ? " tc-first" : ""), lab); b.type = "button";
        b.setAttribute("data-day", dy.key);
        b.addEventListener("click", function () { sel = dy; render(); });
        dg.appendChild(b);
      });
      wrap.appendChild(dg);
      if (sel) {
        wrap.appendChild(el("div", "tc-req-h", "2 · " + esc(t("reqPickWin"))));
        var wg = el("div", "tc-slots");
        windowsFor(sel.first ? null : sel).concat([{ any: true, label: { en: STR.en.anyTime, es: STR.es.anyTime } }]).forEach(function (w) {
          var b = el("button", "tc-slot", esc(w.any ? t("anyTime") : L(w.label))); b.type = "button";
          b.setAttribute("data-window", w.any ? "any" : String(w.start));
          b.addEventListener("click", function () {
            var wl = w.any ? t("anyTime") : L(w.label);
            pickWhen({ kind: "request", label: (sel.first ? t("reqFirst") : sel.label) + " · " + wl, day: sel.first ? "first-available" : sel.key, win: wl });
          });
          wg.appendChild(b);
        });
        wrap.appendChild(wg);
      }
      callInsteadLink(wrap);
      scroll();
    }
    render();
    return say((prefix || "") + t("reqAsk", { word: esc(L(C.booking.windowWord)) }), { node: wrap, cls: "tc-wide" });
  }

  /* ---------------- booking mode "external" (Calendly / Housecall Pro / ServiceTitan link) ---------------- */
  function detailsText(Ld) {
    var parts = [Ld.name, Ld.phone, Ld.email, Ld.city, Ld.issue].filter(Boolean);
    Object.keys(Ld.custom || {}).forEach(function (k) { if (Ld.custom[k]) parts.push(Ld.custom[k]); });
    return parts.join(" · ");
  }
  function externalUrl(Ld) {
    var u = C.booking.externalUrl;
    var map = { name: Ld.name, phone: Ld.phone, email: Ld.email, issue: Ld.issue, city: Ld.city };
    if (/\{(name|phone|email|issue|city)\}/.test(u)) return u.replace(/\{(name|phone|email|issue|city)\}/g, function (m, k) { return encodeURIComponent(map[k] || ""); });
    var prov = C.booking.externalProvider && C.booking.externalProvider !== "auto" ? C.booking.externalProvider : (/calendly\.com/i.test(u) ? "calendly" : "other");
    if (prov === "calendly") {
      try {
        var x = new URL(u, location.href);
        if (Ld.name) x.searchParams.set("name", Ld.name);
        if (Ld.email) x.searchParams.set("email", Ld.email);
        x.searchParams.set("a1", [Ld.issue, Ld.phone, Ld.city].filter(Boolean).join(" · "));
        return x.toString();
      } catch (e) { return u; }
    }
    return u;
  }
  function externalStep(prefix) {
    var host = ""; try { host = new URL(C.booking.externalUrl, location.href).hostname.replace(/^www\./, ""); } catch (e) {}
    S.lead.preferredTime = "Online booking page" + (host ? " (" + host + ")" : "");
    S.lead.kind = "external";
    return finishLead({ prefix: prefix });
  }
  function copyText(txt) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt).catch(function () { legacyCopy(txt); });
    legacyCopy(txt); return Promise.resolve();
  }
  function legacyCopy(txt) {
    var ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove();
  }
  function externalNode(Ld) {
    var box = el("div", "tc-ext");
    var a = el("a", "tc-cta", esc(t("extBtn"))); a.href = externalUrl(Ld); a.target = "_blank"; a.rel = "noopener";
    var cp = el("button", "tc-copy", esc(t("extCopy"))); cp.type = "button";
    cp.addEventListener("click", function () { copyText(detailsText(Ld)).then(function () { cp.textContent = t("extCopied"); }); });
    box.appendChild(a); box.appendChild(cp);
    return box;
  }

  /* ---------------- booking mode "demo-calendar" (demo sites only: fake availability) ---------------- */
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h); }
  function takenSlots() { return load(LEADS_KEY, []).map(function (l) { return l.slotId; }).filter(Boolean); }
  function calendarDays() {
    var taken = takenSlots();
    return openDays(C.booking.daysAhead || 5).map(function (dy) {
      var slots = (dy.dow === 6 ? C.booking.saturdaySlots : C.booking.slots) || C.booking.slots;
      return { key: dy.key, label: dy.label, slots: slots.map(function (s) {
        var id = dy.key + "|" + s;
        return { label: s, id: id, taken: (hash(id) % 3 === 0) || taken.indexOf(id) !== -1 };
      }) };
    });
  }
  function showCalendar(prefix) {
    var days = calendarDays(); S.selDay = 0;
    var wrap = el("div", "tc-cal");
    function render() {
      wrap.innerHTML = "";
      if (S.lead.emergency) {
        var asap = el("button", "tc-slot tc-asap", esc(t("reqAsap"))); asap.type = "button";
        asap.addEventListener("click", function () { pickWhen({ kind: "asap", label: t("reqAsap") }); });
        wrap.appendChild(asap);
      }
      var tabs = el("div", "tc-days");
      days.forEach(function (dy, idx) {
        var parts = dy.label.split(/,\s*/);
        var b = el("button", "tc-day" + (idx === S.selDay ? " on" : ""), "<span>" + esc(parts[0]) + "</span><b>" + esc(parts.slice(1).join(" ")) + "</b>"); b.type = "button";
        b.addEventListener("click", function () { S.selDay = idx; render(); });
        tabs.appendChild(b);
      });
      wrap.appendChild(tabs);
      var grid = el("div", "tc-slots");
      days[S.selDay].slots.forEach(function (s) {
        var b = el("button", "tc-slot" + (s.taken ? " taken" : ""), esc(s.label) + (s.taken ? "<small>" + esc(t("booked")) + "</small>" : "")); b.type = "button";
        b.disabled = s.taken; b.setAttribute("data-slot", s.id);
        if (!s.taken) b.addEventListener("click", function () { pickWhen({ kind: "slot", label: days[S.selDay].label + " · " + s.label, id: s.id }); });
        grid.appendChild(b);
      });
      wrap.appendChild(grid);
      callInsteadLink(wrap);
    }
    render();
    return say((prefix || "") + t("calAsk"), { node: wrap, cls: "tc-wide" });
  }

  /* ---------------- finish: save locally, deliver to webhook, confirm ---------------- */
  var STATUS_LABEL = { booked: "Booked", asap: "Urgent: ASAP", request: "Requested", callback: "Call back", external: "Booking link sent" };
  function finishLead(opts) {
    opts = opts || {};
    var Ld = S.lead; S.flow = null; S.step = null;
    var all = load(LEADS_KEY, []);
    if (!C.business.isDemo && C.leads.maxPerHour) {
      var hourAgo = Date.now() - 3600e3;
      if (all.filter(function (l) { return Date.parse(l.createdAt) > hourAgo; }).length >= C.leads.maxPerHour) {
        S.lead = null; return say(t("tooMany"), { quick: mainChips() });
      }
    }
    Ld.createdAt = new Date().toISOString(); Ld.lang = LANG; Ld.trade = C.trade;
    Ld.kind = Ld.kind || (Ld.slot ? "booked" : "callback");
    if (Ld.emergency && Ld.kind === "request" && /ASAP/i.test(Ld.preferredTime || "")) Ld.kind = "asap";
    Ld.status = STATUS_LABEL[Ld.kind] || "Call back";
    Ld.delivery = { status: C.leads.webhookUrl ? "sending" : "local-only", attempts: 0 };
    all.unshift(Ld); save(LEADS_KEY, all);
    emit("tecbot:lead", Ld);
    deliver(Ld);
    var when = Ld.slot || Ld.preferredTime || t("weCall");
    var title = Ld.kind === "booked" ? t("tBooked") : Ld.kind === "external" ? t("tExternal") : (Ld.emergency ? t("tUrgent") : t("tRequest"));
    var note = Ld.emergency && Ld.afterHours && C.emergency.available24x7 ? t("nUrgentAfter")
      : Ld.kind === "external" ? t("nExternal")
      : Ld.kind === "booked" ? t("nBooked", { arrival: esc(L(C.booking.arrivalNote)) })
      : Ld.kind === "callback" ? t("nCallback")
      : (Ld.afterHours ? t("nAfterReq") : t("nRequest"));
    var extra = Object.keys(Ld.custom || {}).filter(function (k) { return Ld.custom[k]; }).map(function (k) {
      return "<dt>" + esc(Ld.customLabels[k] || k) + "</dt><dd>" + esc(Ld.custom[k]) + "</dd>"; }).join("");
    var card =
      (opts.prefix ? "<div class='tc-pre'>" + opts.prefix + "</div>" : "") +
      "<div class='tc-confirm tc-k-" + Ld.kind + "'>" +
        "<div class='tc-check'>✓</div><div class='tc-ctitle'>" + title + "</div>" +
        "<div class='tc-ref'>" + t("ref", { id: esc(Ld.id) }) + "</div>" +
        "<dl>" +
          "<dt>" + t("lService") + "</dt><dd>" + esc(Ld.issue || t("general")) + (Ld.emergency ? " <span class='tc-tag'>" + t("urgentTag") + "</span>" : "") + "</dd>" +
          extra +
          "<dt>" + t("lWhen") + "</dt><dd>" + esc(when) + "</dd>" +
          (C.shopBased ? "" : "<dt>" + t("lWhere") + "</dt><dd>" + esc(Ld.city || "—") + "</dd>") +
          "<dt>" + t("lContact") + "</dt><dd>" + esc(Ld.name) + " · " + esc(Ld.phone) + (Ld.email ? "<br>" + esc(Ld.email) : "") + "</dd>" +
        "</dl>" +
        "<div class='tc-cnote'>" + note + "</div>" +
        (C.business.isDemo ? "<div class='tc-demo-note'>" + t("demoNote") + "</div>" : "") +
      "</div>";
    var p = Ld.kind === "external" ? say(t("extAsk"), { node: externalNode(Ld), cls: "tc-wide" }) : Promise.resolve();
    return p.then(function () { return say(card, { cls: "tc-wide tc-plain" }); }).then(function () {
      S.pendingIssue = ""; S.pendingEmergency = false;
      return say(t("anythingElse", { first: esc(firstName() || t("friend")) }), { quick: chips(["plan", "financing", "thatsAll"]) });
    });
  }

  /* ---------------- public API ---------------- */
  window.TecChat = {
    version: "2.0", config: C, trade: TRADE,
    open: open, close: close, reset: reset,
    send: function (x) { if (!S.open) open(); userSays(x); },
    getLeads: function () { return load(LEADS_KEY, []); },
    clearLeads: function () { save(LEADS_KEY, []); save(UNANSWERED_KEY, []); save(OUTBOX_KEY, []); },
    getUnanswered: function () { return load(UNANSWERED_KEY, []); },
    getOutbox: function () { return load(OUTBOX_KEY, []); },
    deliver: function (idOrLead) {
      var Ld = typeof idOrLead === "string" ? load(LEADS_KEY, []).filter(function (l) { return l.id === idOrLead; })[0] : idOrLead;
      return Ld ? deliver(Ld) : Promise.resolve(null);
    },
    flushOutbox: flushOutbox,
    isOpenNow: isOpen, setMode: function (m) { save(MODE_KEY, m); if (statusEl) setStatus(); }, getMode: demoMode,
    setLang: function (l) { setLang(l, true); }, getLang: function () { return LANG; },
    t: t, L: L, _strings: STR, _detect: detect, _cleanIssue: cleanIssue, _spanishScore: spanishScore, _payload: payloadFor, _externalUrl: externalUrl,
    idle: function () { return queue; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
