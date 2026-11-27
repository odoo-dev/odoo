# Part of Odoo. See LICENSE file for full copyright and licensing details.

from ast import literal_eval

from lxml import etree

from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestWebsiteMediaManager(TransactionCase):

    def test_suggested_background_videos(self):
        """The background video option suggests videos of Vimeo, listed by a
        filter of the media manager."""
        Attachment = self.env['ir.attachment']
        search_view = self.env.ref('html_editor.mediamanager_media_search')
        arch = Attachment.get_views([(search_view.id, 'search')])['views']['search']['arch']
        domain = etree.fromstring(arch).xpath("//filter[@name='background_videos']")[0].get('domain')
        videos = Attachment.search(literal_eval(domain))
        self.assertEqual(len(videos), 11)
        for video in videos:
            # listed by the website media manager (see WEBSITE_DOMAIN)
            self.assertRecordValues(video, [{
                'public': True,
                'type': 'url',
                'mimetype': 'video/x-vimeo',
                'key': False,
            }])
            self.assertRegex(video.url, r'^https://vimeo\.com/\d+$')
            self.assertEqual(video.name, f"Vimeo - {video.url.rsplit('/', 1)[1]}")
