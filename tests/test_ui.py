import contextlib
import http.server
import os
import socket
import socketserver
import threading
from pathlib import Path

import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


REPO_ROOT = Path(__file__).resolve().parents[1]
PREFERRED_HOST = "127.0.0.1"
PREFERRED_PORT = 8000


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def log_message(self, format, *args):  # noqa: A003
        pass


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def _find_port():
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind((PREFERRED_HOST, 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="session")
def live_server():
    port = PREFERRED_PORT
    try:
        server = ReusableTCPServer(
            (PREFERRED_HOST, port),
            lambda *args, **kwargs: QuietHandler(*args, **kwargs),
        )
    except OSError:
        port = _find_port()
        server = ReusableTCPServer(
            (PREFERRED_HOST, port),
            lambda *args, **kwargs: QuietHandler(*args, **kwargs),
        )

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://{PREFERRED_HOST}:{port}/index.html"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.fixture()
def driver(tmp_path, monkeypatch):
    monkeypatch.setenv("SE_CACHE_PATH", str(tmp_path / "selenium-cache"))

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1440,1000")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-software-rasterizer")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-background-networking")
    options.add_argument("--disable-sync")
    options.add_argument("--metrics-recording-only")
    options.add_argument("--disable-default-apps")
    options.add_argument("--mute-audio")
    options.add_argument("--no-first-run")
    options.add_argument(f"--remote-debugging-port={_find_port()}")
    options.add_argument(f"--user-data-dir={tmp_path / 'chrome-profile'}")
    options.add_argument(f"--data-path={tmp_path / 'chrome-data'}")
    options.add_argument(f"--disk-cache-dir={tmp_path / 'chrome-cache'}")
    browser = webdriver.Chrome(options=options)
    try:
        yield browser
    finally:
        browser.quit()


def _wait_for_app(driver):
    WebDriverWait(driver, 20).until(
        lambda d: d.find_element(By.ID, "app")
    )
    WebDriverWait(driver, 20).until(
        lambda d: d.execute_script("return document.querySelectorAll('.nav-item').length") >= 4
    )


def _reset_state(driver):
    driver.execute_async_script(
        """
        const done = arguments[arguments.length - 1];
        const request = indexedDB.deleteDatabase('living-meta');
        request.onsuccess = () => done(true);
        request.onerror = () => done(false);
        request.onblocked = () => done(false);
        """
    )


def _goto(driver, base_url, hash_path=""):
    driver.get(f"{base_url}{hash_path}")
    _wait_for_app(driver)


def _shadow_text(driver, host_selector, inner_selector):
    return driver.execute_script(
        """
        const host = document.querySelector(arguments[0]);
        if (!host || !host.shadowRoot) return null;
        const el = host.shadowRoot.querySelector(arguments[1]);
        return el ? el.textContent : null;
        """,
        host_selector,
        inner_selector,
    )


def _create_project(driver, name):
    driver.execute_script(
        """
        const page = document.querySelector('projects-page');
        const root = page && page.shadowRoot;
        const button = root && (root.querySelector('#create-btn') || root.querySelector('#create-btn-empty'));
        if (button) button.click();
        """
    )

    WebDriverWait(driver, 20).until(
        lambda d: d.execute_script(
            """
            const page = document.querySelector('projects-page');
            return !!page?.shadowRoot?.querySelector('#project-form');
            """
        )
    )

    driver.execute_script(
        """
        const page = document.querySelector('projects-page');
        const formHost = page.shadowRoot.querySelector('#project-form');
        const formRoot = formHost.shadowRoot;
        const setValue = (selector, value) => {
          const input = formRoot.querySelector(selector);
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        };
        setValue('#name', arguments[0]);
        setValue('#pico-population', 'Adults with type 2 diabetes');
        setValue('#pico-intervention', 'Metformin');
        setValue('#pico-comparator', 'Placebo');
        setValue('#pico-outcome', 'HbA1c');
        formRoot.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true, composed: true }));
        """,
        name,
    )


def test_dashboard_shell_loads(live_server, driver):
    _goto(driver, live_server)

    assert "Living Meta" in driver.title
    labels = driver.execute_script(
        "return Array.from(document.querySelectorAll('.nav-item-label')).map((el) => el.textContent.trim())"
    )
    assert "Projects" in labels
    assert "Search CT.gov" in labels
    assert "Meta-Analysis" in labels
    assert "Welcome to Living Meta-Analysis Platform" in driver.page_source


def test_projects_page_can_create_project(live_server, driver):
    _goto(driver, live_server)
    _reset_state(driver)
    _goto(driver, live_server, "#/projects")

    assert driver.title == "Projects - Living Meta"
    assert _shadow_text(driver, "projects-page", ".empty-title") == "No projects yet"

    _create_project(driver, "Smoke Test Project")

    WebDriverWait(driver, 20).until(lambda d: "#/project/" in d.current_url)
    header = driver.execute_script(
        """
        const page = document.querySelector('project-detail-page');
        const title = page?.shadowRoot?.querySelector('.project-name');
        return title ? title.textContent.trim() : null;
        """
    )
    assert header == "Smoke Test Project"


def test_search_route_renders_page_component(live_server, driver):
    _goto(driver, live_server, "#/search")

    WebDriverWait(driver, 20).until(
        lambda d: d.execute_script("return !!document.querySelector('search-page')")
    )
    assert driver.title == "Search CT.gov - Living Meta"
