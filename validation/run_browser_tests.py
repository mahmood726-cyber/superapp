"""Run browser-based validation tests for Meta-Analysis Superapp"""
import time
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.edge.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Configure Edge
options = Options()
options.add_argument('--headless')
options.add_argument('--disable-gpu')
options.add_argument('--no-sandbox')

print("Starting Edge browser...")
driver = webdriver.Edge(options=options)

try:
    print("Opening test runner...")
    driver.get("http://localhost:9999/validation/test_runner.html")

    # Wait for tests to complete (look for summary element)
    print("Waiting for tests to complete...")
    WebDriverWait(driver, 120).until(
        EC.text_to_be_present_in_element((By.ID, "status"), "Tests completed!")
    )

    # Get results
    summary = driver.find_element(By.ID, "summary").text
    print(f"\n{'='*60}")
    print("TEST RESULTS")
    print('='*60)
    print(summary)

    # Get individual test results
    results = driver.find_elements(By.CLASS_NAME, "test")
    passed = 0
    failed = 0

    print("\nDetailed Results:")
    print("-"*60)
    for result in results:
        text = result.text
        if text.startswith("✓"):
            passed += 1
            print(f"  {text}")
        elif text.startswith("✗"):
            failed += 1
            print(f"  {text}")

    print(f"\n{'='*60}")
    print(f"SUMMARY: PASSED: {passed} | FAILED: {failed} | TOTAL: {passed + failed}")
    print('='*60)

    # Check console for any errors
    logs = driver.get_log('browser')
    errors = [log for log in logs if log['level'] == 'SEVERE']
    if errors:
        print("\nBrowser Errors:")
        for err in errors:
            print(f"  - {err['message']}")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    driver.quit()
    print("\nBrowser closed.")
