from playwright.sync_api import sync_playwright

def verify_versions(page):
    page.goto("http://localhost:8000")

    # Wait for the versions to load
    page.wait_for_selector(".version-card", timeout=10000)

    # Take a screenshot
    page.screenshot(path="verification_fix_xss.png", full_page=True)
    print("Screenshot saved to verification_fix_xss.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_versions(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
