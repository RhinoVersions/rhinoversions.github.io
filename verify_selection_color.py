from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto("http://localhost:8001/index.html")

    # Wait for content to load
    page.wait_for_selector("h1")

    # Select the title text
    page.evaluate("window.getSelection().selectAllChildren(document.querySelector('h1'))")

    # Take a screenshot
    page.screenshot(path="verification_selection.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
