import logging
from contextlib import suppress
from unittest.mock import patch

from odoo import models, api
from odoo.exceptions import UserError
from odoo.http import request


class _Runner:
    _logger = logging.getLogger(__name__)
    _testMethodName = 'record_tour'
    browser_size = '1920x1080'
    touch_enabled = False


class WebTourRecorder(models.AbstractModel):
    _name = 'web_tour.recorder'
    _description = 'Tour Recorder'

    @api.model
    def record_tour(self, tour_name):
        from odoo.tests.common import ChromeBrowser, Screencaster

        browser = None
        try:
            with patch('signal.signal', return_value=None):
                browser = ChromeBrowser(_Runner(), headless=True, success_signal="tour succeeded")

            browser.screencaster = Screencaster(browser, '/tmp')
            browser._handlers['Page.screencastFrame'] = browser.screencaster
            browser.screencaster.start()

            port = request.httprequest.environ.get('SERVER_PORT', 8069)
            browser.set_cookie('session_id', request.session.sid, '/', '127.0.0.1')
            browser.navigate_to(f"http://127.0.0.1:{port}/web", wait_stop=False)
            browser._wait_ready(f"odoo.isTourReady({tour_name!r})")
            browser._websocket_request('Runtime.evaluate', params={
                'expression': f"odoo.startTour({tour_name!r}, {{'mode': 'auto'}})",
                'awaitPromise': False,
            })
            browser._wait_code_ok("true", timeout=200)
            browser.screencaster.save()

            video = browser.screencaster.frames_dir.with_suffix('.mp4')
            if not video.exists():
                raise UserError("Video compilation failed.")

            attachment = self.env['ir.attachment'].create({
                'name': f'{tour_name}.mp4',
                'raw': video.read_bytes(),
                'mimetype': 'video/mp4',
            })
            with suppress(Exception):
                video.unlink()

            return {'success': True, 'attachment_id': attachment.id}
        except Exception as e:
            return {'success': False, 'message': str(e)}
        finally:
            if browser:
                with suppress(Exception), patch("signal.signal", return_value=None):
                    browser.cleanup.close()
