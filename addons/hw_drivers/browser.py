# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
import subprocess
from enum import Enum
from odoo.addons.hw_drivers.tools import helpers


_logger = logging.getLogger(__name__)

BROWSER = 'chromium'
BROWSER_ARGS = [
    '--incognito',
    '--disable-infobars',
    '--noerrdialogs',
    '--no-first-run',
    '--bwsi',                       # Use chromium without signing in
    '--disable-extensions',         # Disable extensions as they fill up /tmp
    '--disk-cache-dir=/dev/null',   # Disable disk cache
    '--disk-cache-size=1',          # Set disk cache size to 1 byte
    '--log-level=3',                # Reduce amount of logs
]


class BrowserState(Enum):
    """Enum to represent the state of the browser"""
    NORMAL = 'normal'
    KIOSK = 'kiosk'
    FULLSCREEN = 'fullscreen'


class Browser:
    """Methods to interact with a browser"""

    def __init__(self, url, _x_screen, env):
        """
        :param url: URL to open in the browser
        :param _x_screen: X screen number
        :param env: Environment variables (e.g. os.environ.copy())
        """
        self.url = url
        self.state = BrowserState.NORMAL
        self.instance = None
        self._x_screen = _x_screen
        self._set_environment(env)

    def _set_environment(self, env):
        """
        Set the environment variables for the browser
        :param env: Environment variables (os.environ.copy())
        """
        self.env = env
        self.env['DISPLAY'] = f':0.{self._x_screen}'
        for key in ['HOME', 'XDG_RUNTIME_DIR', 'XDG_CACHE_HOME']:
            self.env[key] = '/tmp/' + self._x_screen

    def open_browser(self, url=None, state=BrowserState.NORMAL):
        """
        open the browser with the given URL, or reopen it if it is already open
        :param url: URL to open in the browser
        :param state: State of the browser (normal, kiosk, fullscreen)
        """
        self.url = url or self.url
        self.state = state

        # Reopen to take new url or additional args into account
        self.close_browser()

        browser_args = list(BROWSER_ARGS)

        if state == BrowserState.KIOSK:
            browser_args.append("--kiosk")
        elif state == BrowserState.FULLSCREEN:
            browser_args.append("--start-fullscreen")

        self.instance = subprocess.Popen(
            [
                BROWSER,
                self.url,
                *browser_args,
            ],
            env=self.env,
        )

        helpers.save_browser_state(url=self.url)

    def close_browser(self):
        if self.instance:
            self.instance.terminate()
            self.instance = None

    def xdotool_keystroke(self, keystroke):
        """
        Execute a keystroke using xdotool
        :param keystroke: Keystroke to execute
        """
        subprocess.run([
            'xdotool', 'search',
            '--sync', '--onlyvisible',
            '--screen', self._x_screen,
            '--class', BROWSER,
            'key', keystroke,
        ], check=False)

    def refresh(self):
        """Refresh the current tab"""
        self.xdotool_keystroke('ctrl+r')

    def disable_kiosk_mode(self):
        if self.state == BrowserState.KIOSK:
            self.open_browser(state=BrowserState.FULLSCREEN)
