from psycopg2 import IntegrityError

from odoo.exceptions import AccessError
from odoo.fields import Command
from odoo.tests.common import TransactionCase, new_test_user, tagged
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

    def test_media_favorites(self):
        user_a = new_test_user(self.env, login='media_user_a', groups='base.group_user')
        user_b = new_test_user(self.env, login='media_user_b', groups='base.group_user')
        # A public attachment created by someone else: readable but not writable.
        attachment = self.env['ir.attachment'].create({
            'name': 'logo.png',
            'type': 'binary',
            'mimetype': 'image/png',
            'raw': b'',
            'public': True,
        })
        attachment_a = attachment.with_user(user_a)
        with self.assertRaises(AccessError):
            attachment_a.name = 'renamed.png'

        attachment_a.is_favorite = True
        self.assertTrue(attachment_a.is_favorite)
        self.assertFalse(attachment.with_user(user_b).is_favorite, "Favorites should be per user")
        self.assertEqual(
            self.env['ir.attachment'].with_user(user_a).search([('is_favorite', '=', True)]),
            attachment,
        )
        self.assertFalse(self.env['ir.attachment'].with_user(user_b).search([('is_favorite', '=', True)]))

        attachment_a.is_favorite = False
        self.assertFalse(attachment_a.is_favorite)
