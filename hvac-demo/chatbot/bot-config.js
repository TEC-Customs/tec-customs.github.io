/* ==========================================================================
   DEMO configuration (Tec Customs sales demo)
   --------------------------------------------------------------------------
   👉 To show a different trade, change ONE line:  trade: "hvac"
      Options: hvac · plumbing · electrical · roofing · pest · solar · auto · autobody · garage
      (Or just add ?trade=plumbing to the page URL; the ribbon menu does this.)

   Everything else (business name, services, prices, FAQs, Spanish text) comes
   from chatbot/presets/<trade>.json, bundled into chatbot/presets.js by
   tools/build-presets.py. Anything you put here overrides the preset.

   For a REAL client, don't edit this file. Run tools/new-client.py, which writes
   a complete, self-contained bot-config.js for that business.
   ========================================================================== */
window.TEC_BOT_CONFIG = {
  trade: "hvac",

  business: { isDemo: true },        // demo ribbon, demo notes, ?trade= / ?mode= URL switches
  booking: { mode: "demo-calendar" }, // demo only: fake availability. Real clients use "request" or "external".
  leads: {
    storageKey: "tecbot_demo_leads",
    webhookUrl: ""                    // demo stores leads in the visitor's browser only
  }
};
