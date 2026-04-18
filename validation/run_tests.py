"""
Simple test runner using Selenium to execute validation tests
"""
import os
import sys
import time
import json
import threading
import http.server
import socketserver
from pathlib import Path

# Start local server
PORT = 8888
SUPERAPP_DIR = Path(__file__).parent.parent

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress logging

def start_server():
    os.chdir(SUPERAPP_DIR)
    with socketserver.TCPServer(("", PORT), QuietHandler) as httpd:
        httpd.serve_forever()

# Start server in background
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()
time.sleep(1)

print("=" * 70)
print("META-ANALYSIS SUPERAPP - VALIDATION TESTS")
print("=" * 70)
print(f"\nServer running at http://localhost:{PORT}")

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    # Setup Chrome
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.page_load_strategy = 'normal'

    print("Starting Chrome browser...")
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(60)
    driver.set_script_timeout(60)

    # Navigate to test page
    test_url = f"http://localhost:{PORT}/validation/test_runner.html"
    print(f"Loading {test_url}")
    driver.get(test_url)

    # Wait for tests to complete
    print("Running tests...\n")
    wait = WebDriverWait(driver, 120)
    wait.until(lambda d: "Tests completed" in d.find_element(By.ID, "status").text or
               "Error" in d.find_element(By.ID, "status").text)

    # Get results
    summary = driver.find_element(By.ID, "summary").text
    results_div = driver.find_element(By.ID, "results").text

    # Print results
    print(results_div)
    print("\n" + "=" * 70)
    print("SUMMARY:", summary)
    print("=" * 70)

    # Get JSON results from console
    logs = driver.get_log('browser')
    for log in logs:
        if 'TEST_RESULTS:' in log.get('message', ''):
            json_str = log['message'].split('TEST_RESULTS:')[1].strip().strip('"')
            try:
                test_results = json.loads(json_str)
                print(f"\nJSON: {json.dumps(test_results, indent=2)}")
            except:
                pass

    driver.quit()
    print("\nTests completed successfully!")

except ImportError:
    print("\nSelenium not installed. Running manual test instructions:")
    print(f"\n1. Open this URL in your browser:")
    print(f"   http://localhost:{PORT}/validation/test_runner.html")
    print(f"\n2. Check the results in the browser")
    print("\nPress Ctrl+C to stop the server when done.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nServer stopped.")

except Exception as e:
    print(f"\nError: {e}")
    print(f"\nAlternatively, open manually:")
    print(f"   http://localhost:{PORT}/validation/test_runner.html")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nServer stopped.")
