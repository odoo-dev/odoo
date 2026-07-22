import base64
import logging
import os
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


class TourRecorderController(http.Controller):

    @http.route('/web_tour/record_tour', type='jsonrpc', auth='user')
    def record_tour(self, tour_name):
        from odoo.tests.common import ChromeBrowser, Screencaster
        browser = None
        try:
            # 2. Extract request variables and build local URL
            session_id = request.session.sid
            parsed_url = urlsplit(request.httprequest.url_root)
            local_base_url = parsed_url._replace(netloc=parsed_url.netloc.replace(parsed_url.hostname or 'localhost', '127.0.0.1')).geturl()

            # 3. Patch ChromeBrowser to run headless with full HD resolution
            original_spawn = ChromeBrowser._spawn_chrome

            def patched_spawn(self_browser, cmd):
                new_cmd = list(cmd)
                if '--headless=new' not in new_cmd and '--headless' not in new_cmd:
                    new_cmd.append('--headless=new')
                # Enable GPU acceleration matching headed mode
                new_cmd = [arg for arg in new_cmd if not arg.startswith('--disable-gpu')]
                new_cmd = [arg for arg in new_cmd if not arg.startswith('--window-size=')]
                for switch in ('--start-maximized', '--window-size=1920,1080', '--no-sandbox'):
                    if switch not in new_cmd:
                        new_cmd.append(switch)
                return original_spawn(self_browser, new_cmd)

            # 4. Spawns browser and set viewport to full HD 1920x1080
            with patch('signal.signal', return_value=None), patch.object(ChromeBrowser, '_spawn_chrome', patched_spawn):
                browser = ChromeBrowser(MockTestCase(), headless=True, success_signal="tour succeeded")
            browser._websocket_request('Emulation.setDeviceMetricsOverride', params={
                'mobile': False,
                'width': 1920,
                'height': 1080,
                'deviceScaleFactor': 1,
            })

            # 5. Initialize Screencaster and map event handlers
            screenshots_dir = tools.config.get('screenshots') or '/tmp'
            screencaster = Screencaster(browser, screenshots_dir)
            browser.screencaster = screencaster
            browser._handlers['Page.screencastFrame'] = screencaster

            # Patch start to use maximum lossless quality PNG at full HD resolution
            def patched_screencaster_start():
                screencaster._logger.info('Starting full HD screencast')
                screencaster.browser._websocket_request('Page.startScreencast', params={
                    'format': 'png',
                    'maxWidth': 1920,
                    'maxHeight': 1080
                })
            screencaster.start = patched_screencaster_start

            # 6. Inject login session cookie and navigate
            browser.set_cookie('session_id', session_id, '/', '127.0.0.1')
            tour_url = urljoin(local_base_url, f"web#tour={tour_name}&auto=true")
            # autotype and run
            browser.navigate_to(tour_url, wait_stop=False)

            # 7. Wait for tour success signal (logged by tour_automatic.js on success)
            browser._wait_ready(f"odoo.isTourReady({tour_name!r})")
            
            # Start the tour asynchronously (returns immediately without waiting for it to finish)
            browser._websocket_request('Runtime.evaluate', params={
                'expression': f"odoo.startTour({tour_name!r}, {{'mode': 'auto'}})",
                'awaitPromise': False
            })
            
            # Wait 0.85 seconds to bypass the initial client-side redirect / loading glitch
            import time
            time.sleep(0.85)
            
            # Start recording now that the browser has settled on the first page of the tour
            screencaster.start()
            
            # Block until the console prints "tour succeeded"
            browser._wait_code_ok("true", timeout=200)

            # 8. Compile the video from captured frames
            screencaster.save()
            video_file = screencaster.frames_dir.with_suffix('.mp4')
            if not video_file.exists():
                return {
                    'success': False,
                    'message': f'Failed to compile video. Frame count: {len(screencaster.frames)}'
                }

            # 9. Return base64 encoded video binary to frontend
            with open(video_file, 'rb') as f:
                video_data = f.read()

            with suppress(Exception):
                video_file.unlink()

            return {
                'success': True,
                'video_data': base64.b64encode(video_data).decode('utf-8')
            }
        except Exception as e:
            return {
                'success': False,
                'message': str(e)
            }
        finally:
            if browser:
                with suppress(Exception):
                    with patch('signal.signal', return_value=None):
                        browser.cleanup.close()
