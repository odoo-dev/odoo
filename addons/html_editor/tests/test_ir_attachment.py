from psycopg2 import IntegrityError

from odoo.fields import Command
from odoo.tests.common import TransactionCase, tagged
from odoo.tools import mute_logger


@tagged('post_install', '-at_install')
class TestIrAttachmentWebEditor(TransactionCase):
    def test_compute_image_src_empty_checksum(self):
        attachment = self.env['ir.attachment'].create({
            'name': 'test.png',
            'type': 'binary',
            'mimetype': 'image/png',
            'raw': b'',
        })
        self.assertFalse(attachment.checksum, "Checksum should be False for empty datas")

        expected_url = f'/web/image/{attachment.id}-0/test.png'
        self.assertEqual(attachment.image_src, expected_url)

    def test_media_tags(self):
        tag_banner, tag_logo = self.env['html_editor.media.tag'].create([
            {'name': 'Banner'},
            {'name': 'Logo'},
        ])
        attachment = self.env['ir.attachment'].create({
            'name': 'banner.png',
            'type': 'binary',
            'mimetype': 'image/png',
            'raw': b'',
            'media_tag_ids': [Command.set(tag_banner.ids)],
        })
        self.assertEqual(tag_banner.attachment_ids, attachment, "The tag should be linked back to the attachment")
        self.assertFalse(tag_logo.attachment_ids)
        self.assertEqual(
            self.env['ir.attachment'].search([('media_tag_ids', 'in', tag_banner.ids)]),
            attachment,
        )
        self.assertTrue(1 <= tag_logo.color <= 11, "A color should be assigned by default")

    def test_media_tag_name_unique(self):
        self.env['html_editor.media.tag'].create({'name': 'Banner'})
        with self.assertRaises(IntegrityError), mute_logger('odoo.sql_db'):
            self.env['html_editor.media.tag'].create({'name': 'Banner'})
