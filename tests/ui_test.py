import threading
import http.server
import socketserver
import unittest
import os
import time
from functools import partial
from playwright.sync_api import sync_playwright

PORT = 8001  # Changed port to avoid conflict

class FrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Determine the repository root directory
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        # Configure the handler to serve from the repository root
        # We use partial to pass the directory argument to the handler constructor
        handler_class = partial(http.server.SimpleHTTPRequestHandler, directory=repo_root)

        # Allow reuse address
        socketserver.TCPServer.allow_reuse_address = True

        cls.httpd = socketserver.TCPServer(("", PORT), handler_class)
        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever)
        cls.server_thread.daemon = True
        cls.server_thread.start()
        print(f"Server started at port {PORT}")

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def test_homepage_loads_and_renders_versions(self):
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            try:
                page.goto(f"http://localhost:{PORT}")

                # check title
                self.assertIn("Rhino Versions", page.title())

                # wait for latest version to be populated
                page.wait_for_selector("#latest-version:not(:text('-'))", timeout=10000)

                latest_version = page.inner_text("#latest-version")
                self.assertNotEqual(latest_version, "-")
                print(f"Latest version found: {latest_version}")

                # Check if version list is populated
                page.wait_for_selector(".version-card", timeout=10000)
                cards = page.query_selector_all(".version-card")
                self.assertGreater(len(cards), 0)
                print(f"Number of version cards: {len(cards)}")

            except Exception as e:
                print(f"Test failed: {e}")
                raise e
            finally:
                browser.close()

if __name__ == "__main__":
    unittest.main()
