# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.exceptions import AccessError
from odoo.fields import Command
from odoo.tests.common import TransactionCase, new_test_user, tagged


@tagged('post_install', '-at_install')
class TestMediaManager(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_a = new_test_user(cls.env, login='media_user_a', groups='base.group_user')
        cls.user_b = new_test_user(cls.env, login='media_user_b', groups='base.group_user')
        cls.company_image = cls._create_company_image()

    @classmethod
    def _create_company_image(cls, name='company.png'):
        """An image every internal user can read, but cannot write: only the
        users allowed to edit the company can."""
        return cls.env['ir.attachment'].create({
            'name': name,
            'mimetype': 'image/png',
            'raw': b'',
            'res_model': 'res.company',
            'res_id': cls.env.company.id,
        })

    # -------------------------------------------------------------------------
    # Tags: shared by all users, they are part of the attachment
    # -------------------------------------------------------------------------

    def test_tag_an_image(self):
        tag = self.env['html_editor.media.tag'].create({'name': 'Banner'})
        self.company_image.media_tag_ids = [Command.link(tag.id)]
        self.assertEqual(tag.attachment_ids, self.company_image, "The tag lists the images it is set on")

    def test_internal_users_manage_tags_but_cannot_delete_them(self):
        tag = self.env['html_editor.media.tag'].with_user(self.user_a).create({'name': 'Banner'})
        tag.name = 'Hero'
        with self.assertRaises(AccessError):
            tag.unlink()

    def test_tagging_requires_write_access(self):
        tag = self.env['html_editor.media.tag'].create({'name': 'Banner'})
        with self.assertRaises(AccessError):
            self.company_image.with_user(self.user_a).media_tag_ids = [Command.link(tag.id)]

    # -------------------------------------------------------------------------
    # Favorites: personal, any user who can see an image can star it
    # -------------------------------------------------------------------------

    def test_favorite_only_requires_read_access(self):
        image = self.company_image.with_user(self.user_a)
        image.is_favorite = True
        self.assertTrue(image.is_favorite)
        image.is_favorite = False
        self.assertFalse(image.is_favorite)

    def test_favorite_requires_read_access(self):
        # Favorites are written as superuser: the read access must be checked.
        # An attachment not linked to any record is only readable by its creator.
        private_image = self.env['ir.attachment'].with_user(self.user_b).create({'name': 'private.png', 'raw': b''})
        with self.assertRaises(AccessError):
            private_image.with_user(self.user_a).is_favorite = True

    def test_favorites_are_per_user(self):
        self.company_image.with_user(self.user_a).is_favorite = True
        self.assertTrue(self.company_image.with_user(self.user_a).is_favorite)
        self.assertFalse(self.company_image.with_user(self.user_b).is_favorite)

    def test_search_favorites(self):
        other_image = self._create_company_image('other.png')
        self.company_image.with_user(self.user_a).is_favorite = True
        Attachment = self.env['ir.attachment'].with_user(self.user_a)
        images_domain = [('id', 'in', (self.company_image + other_image).ids)]
        self.assertEqual(Attachment.search(images_domain + [('is_favorite', '=', True)]), self.company_image)
        self.assertEqual(Attachment.search(images_domain + [('is_favorite', '=', False)]), other_image)

    def test_write_favorite_with_other_values(self):
        """Only `is_favorite` bypasses the write access, not the other values."""
        own_image = self.env['ir.attachment'].with_user(self.user_a).create({'name': 'mine.png', 'raw': b''})
        own_image.write({'name': 'renamed.png', 'is_favorite': True})
        self.assertEqual(own_image.name, 'renamed.png')
        self.assertTrue(own_image.is_favorite)

        with self.assertRaises(AccessError):
            self.company_image.with_user(self.user_a).write({'name': 'renamed.png', 'is_favorite': True})
