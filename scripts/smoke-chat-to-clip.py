#!/usr/bin/env python3
"""Headless smoke test for the chat -> clip -> playback loop.

Assumptions:
- Agent orchestrator backend is running on http://127.0.0.1:9876
- Vite dev server for apps/desktop is running on http://localhost:1420
"""
from __future__ import annotations

import sys
import time
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE_URL = "http://localhost:1420"
BACKEND_HEALTH = "http://127.0.0.1:9876/health"

console_logs: list[str] = []


def log(msg: str) -> None:
    print(f"[smoke] {msg}", flush=True)


def first_enabled_button(page, text: str):
    """Return the first visible, enabled button matching text."""
    for btn in page.locator("button").filter(has_text=text).all():
        try:
            if btn.is_visible() and not btn.is_disabled():
                return btn
        except Exception:
            continue
    return None


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_logs.append(f"[pageerror] {err}"))

        log("Opening app...")
        page.goto(BASE_URL, wait_until="networkidle")
        page.screenshot(path="build/reports/smoke-01-app-open.png")

        # Wait for backend health indicator to turn connected
        log("Waiting for backend connection...")
        try:
            page.get_by_text("Backend: connected", exact=False).wait_for(timeout=15000)
        except PWTimeout:
            log("Backend did not show connected; aborting.")
            page.screenshot(path="build/reports/smoke-fail-backend.png")
            browser.close()
            return 1
        log("Backend connected.")

        # Open the Agents side panel (the left-rail "Agents" button, not a top tab)
        log("Opening Agents panel...")
        agents_btn = first_enabled_button(page, "Agents")
        if not agents_btn:
            log("Agents button not found.")
            browser.close()
            return 1
        agents_btn.click()
        time.sleep(0.8)
        page.screenshot(path="build/reports/smoke-02-agents-panel.png")

        # Verify Agent Director is visible and demo brief is pre-seeded
        page.get_by_text("Agent Director", exact=False).wait_for(timeout=5000)
        brief_area = page.locator("textarea").first
        brief = brief_area.input_value()
        if "acid techno" not in brief.lower():
            log(f"Demo brief not pre-seeded; found: {brief[:80]!r}")
            browser.close()
            return 1
        log(f"Demo brief present: {brief[:60]}...")

        # Make sure Rhythm & Groove is selected
        rg_btn = first_enabled_button(page, "Rhythm")
        if rg_btn and not rg_btn.locator("..").get_attribute("data-active"):
            rg_btn.click()
            time.sleep(0.2)

        # Click the Agent Director Generate button (enabled one)
        log("Clicking Generate...")
        generate_btn = first_enabled_button(page, "Generate")
        if not generate_btn:
            log("No enabled Generate button found.")
            browser.close()
            return 1
        generate_btn.click()

        # Wait for generation to complete and clip card to appear
        log("Waiting for clip generation...")
        try:
            page.get_by_text("Rolling Acid Bass", exact=False).wait_for(timeout=120000)
            page.get_by_text("Task complete", exact=False).wait_for(timeout=10000)
        except PWTimeout:
            log("Clip did not appear within timeout.")
            page.screenshot(path="build/reports/smoke-fail-clip.png")
            browser.close()
            return 1

        log("Clip generated.")
        page.screenshot(path="build/reports/smoke-03-clip-generated.png")

        # Click play on the clip card or global transport
        log("Clicking Play...")
        play_btn = first_enabled_button(page, "Play")
        if play_btn:
            play_btn.click()
        else:
            log("No Play button found; skipping playback click.")

        time.sleep(2)
        page.screenshot(path="build/reports/smoke-04-playing.png")

        # Inspect Tone.js transport state if reachable from page
        transport_state = None
        try:
            transport_state = page.evaluate(
                "() => { try { return window.Tone?.Transport?.state ?? 'unexposed'; } catch { return 'error'; } }"
            )
        except Exception as e:
            transport_state = f"evaluate error: {e}"
        log(f"Tone Transport state (if exposed): {transport_state}")

        errors = [line for line in console_logs if line.startswith("[error]") or line.startswith("[pageerror]")]
        if errors:
            log(f"Captured {len(errors)} console/page errors:")
            for line in errors[:20]:
                print("  ", line, file=sys.stderr)
        else:
            log("No console/page errors captured.")

        browser.close()

        if errors:
            return 1
        log("Smoke test passed.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
