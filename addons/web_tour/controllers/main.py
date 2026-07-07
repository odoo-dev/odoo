import base64
import logging
import os
import threading
from contextlib import suppress
from urllib.parse import urljoin, urlsplit
from unittest.mock import patch

from odoo import http, tools
from odoo.http import request

_logger = logging.getLogger(__name__)


class MockTestCase:
    def __init__(self):
        self._logger = _logger
        self.browser_size = "1366x768"
        self.touch_enabled = False

    def fetch_proxy(self, url):
        return None


RECORDING_LOCK = threading.Lock()


class TourRecorderController(http.Controller):

    @http.route('/web_tour/record_tour', type='jsonrpc', auth='user')
    def record_tour(self, tour_name):
        from odoo.tests.common import ChromeBrowser, Screencaster  # noqa: PLC0415
        if not RECORDING_LOCK.acquire(blocking=False):
            return {
                'success': False,
                'message': 'Another tour is currently being recorded. Please wait.'
            }

        browser = None
        try:
            # 1. Setup local bin environment PATH for ffmpeg
            local_bin = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bin'))  # nosemgrep: PY004
            if local_bin not in os.environ.get('PATH', '').split(os.pathsep):  # nosemgrep: PY004
                os.environ['PATH'] = local_bin + os.pathsep + os.environ.get('PATH', '')  # nosemgrep: PY004

            # 2. Extract request variables and build local URL
            session_id = request.session.sid
            parsed_url = urlsplit(request.httprequest.url_root)
            local_base_url = parsed_url._replace(netloc=parsed_url.netloc.replace(parsed_url.hostname or 'localhost', '127.0.0.1')).geturl()

            # 3. Patch ChromeBrowser to run headed with maximized resolution
            original_spawn = ChromeBrowser._spawn_chrome

            def patched_spawn(self_browser, cmd):
                new_cmd = [arg for arg in cmd if not arg.startswith('--headless') and not arg.startswith('--disable-gpu')]
                for switch in ('--start-maximized', '--window-size=1920,1080', '--no-sandbox'):
                    if switch not in new_cmd:
                        new_cmd.append(switch)
                return original_spawn(self_browser, new_cmd)

            # 4. Spawns browser and clear Odoo's default emulated limits
            with patch('signal.signal', return_value=None), patch.object(ChromeBrowser, '_spawn_chrome', patched_spawn):
                browser = ChromeBrowser(MockTestCase(), headless=True, success_signal="tour succeeded")
            browser._websocket_send('Emulation.clearDeviceMetricsOverride')

            # 5. Initialize Screencaster and map event handlers
            screenshots_dir = tools.config.get('screenshots') or '/tmp'
            screencaster = Screencaster(browser, screenshots_dir)
            browser.screencaster = screencaster
            browser._handlers['Page.screencastFrame'] = screencaster

            # 6. Inject login session cookie, start capturing, and navigate
            browser.set_cookie('session_id', session_id, '/', '127.0.0.1')
            screencaster.start()
            tour_url = urljoin(local_base_url, f"web#tour={tour_name}&auto=true")  # nosemgrep: PY030
            _logger.info("Screencast worker browser navigating to: %s", tour_url)
            browser.navigate_to(tour_url, wait_stop=False)

            # 7. Wait for tour success signal (logged by tour_automatic.js on success)
            browser._wait_ready(f"odoo.isTourReady({tour_name!r})")
            browser._wait_code_ok(f"odoo.startTour({tour_name!r}, {{'mode': 'auto'}})", timeout=120)

            # 8. Compile the video from captured frames
            screencaster.save()
            video_file = screencaster.frames_dir.with_suffix('.mp4')
            if not video_file.exists():
                return {
                    'success': False,
                    'message': f'Failed to compile video. Frame count: {len(screencaster.frames)}'
                }

            # 9. Return base64 encoded video binary to frontend
            with open(video_file, 'rb') as f:  # nosemgrep: PY002
                video_data = f.read()

            with suppress(Exception):
                video_file.unlink()

            return {
                'success': True,
                'video_data': base64.b64encode(video_data).decode('utf-8')
            }
        except Exception as e:
            _logger.exception("Error during background tour recording:")
            return {
                'success': False,
                'message': str(e)
            }
        finally:
            if browser:
                with suppress(Exception):
                    with patch('signal.signal', return_value=None):
                        browser.stop()
            RECORDING_LOCK.release()
