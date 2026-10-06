#!/usr/bin/env python3
"""Render hvac-demo/og-image.png (1200x630 social preview) from the real demo.
Serves the site locally, books a demo request in headless Chromium, screenshots the
chat panel, then composes the preview card. Exits non-zero (and writes nothing) on any failure.
Usage: python3 .github/og/make_og.py hvac-demo     (optional env CHROME=/path/to/chrome)"""
import base64, functools, http.server, os, sys, threading
from playwright.sync_api import sync_playwright

SITE = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "hvac-demo")
OUT = os.path.join(SITE, "og-image.png")
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=SITE)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_address[1]}/"

def settle(pg):
    for _ in range(3):
        pg.evaluate("() => TecChat.idle()"); pg.wait_for_timeout(100)
    pg.wait_for_function("() => !document.querySelector('.tc-typing')", timeout=10000)
def send(pg, text):
    pg.fill(".tc-input", text); pg.press(".tc-input", "Enter"); settle(pg)

with sync_playwright() as p:
    kw = {"args": ["--no-sandbox"]}
    if os.environ.get("CHROME"): kw["executable_path"] = os.environ["CHROME"]
    b = p.chromium.launch(**kw)
    errors = []
    pg = b.new_page(viewport={"width": 1366, "height": 900})
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(BASE + "?mode=open&fast=1&booking=request"); pg.wait_for_function("() => window.TecChat")
    pg.evaluate("() => TecChat.open()"); settle(pg)
    send(pg, "Do you service Victorville?")
    send(pg, "My furnace is making a weird noise")
    send(pg, "yes"); send(pg, "Ana Torres"); send(pg, "760 555 0144")
    pg.locator(".tc-quick .tc-chip", has_text="Skip").first.click(); settle(pg)
    pg.locator(".tc-req:not(.tc-done) .tc-rday").nth(1).click(); pg.wait_for_timeout(150)
    pg.locator(".tc-req:not(.tc-done) .tc-slot", has_text="Morning").first.click(); settle(pg)
    conf = pg.locator(".tc-confirm").last
    text = conf.inner_text()
    if "Request received" not in text or "Ana Torres" not in text or errors:
        sys.exit(f"og render failed: confirmation={text!r} errors={errors}")
    conf.scroll_into_view_if_needed(); pg.wait_for_timeout(250)
    shot = base64.b64encode(pg.locator(".tc-panel").screenshot()).decode()
    html = f"""<html><body style="margin:0;width:1200px;height:630px;overflow:hidden;font-family:'Noto Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
background:linear-gradient(135deg,#0f2a44,#1b4a73);color:#fff;display:flex;align-items:center">
<div style="flex:1;padding:0 0 0 64px">
 <div style="font-size:20px;letter-spacing:5px;color:#ffb347;font-weight:800">TEC CUSTOMS · DEMO</div>
 <div style="font-size:58px;font-weight:800;line-height:1.08;margin:14px 0 18px">A 24/7 chat assistant<br>for local businesses</div>
 <div style="font-size:25px;line-height:1.45;opacity:.92">Answers questions, captures leads and<br>gets customers scheduled, even at night.<br>English &amp; Spanish · 9 trades</div>
 <div style="display:inline-block;margin-top:26px;background:#f26b1d;font-weight:800;font-size:24px;padding:12px 24px;border-radius:999px">Try the live demo →</div>
</div>
<div style="width:430px;height:630px;display:flex;align-items:center;justify-content:center;padding-right:48px">
 <img src="data:image/png;base64,{shot}" style="max-height:560px;max-width:400px;border-radius:18px;box-shadow:0 20px 50px rgba(0,0,0,.45)">
</div></body></html>"""
    og = b.new_page(viewport={"width": 1200, "height": 630}); og.set_content(html); og.wait_for_timeout(400)
    og.screenshot(path=OUT); b.close()
srv.shutdown()
print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")
