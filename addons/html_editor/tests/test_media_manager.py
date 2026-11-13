# Part of Odoo. See LICENSE file for full copyright and licensing details.

from psycopg2 import IntegrityError

from odoo.exceptions import AccessError
from odoo.fields import Command
from odoo.tests.common import TransactionCase, new_test_user, tagged
from odoo.tools import mute_logger


class MediaManagerCommon(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_a = new_test_user(cls.env, login='media_user_a', groups='base.group_user')
        cls.user_b = new_test_user(cls.env, login='media_user_b', groups='base.group_user')
        cls.user_admin = new_test_user(cls.env, login='media_admin', groups='base.group_user,base.group_system')
        cls.user_portal = new_test_user(cls.env, login='media_portal', groups='base.group_portal')
        cls.Tag = cls.env['html_editor.media.tag']
        cls.Attachment = cls.env['ir.attachment']

    @classmethod
    def _create_image(cls, name='image.png', user=None, **vals):
        Attachment = cls.Attachment.with_user(user) if user else cls.Attachment
        return Attachment.create({
            'name': name,
            'type': 'binary',
            'mimetype': 'image/png',
            'raw': b'',
            **vals,
        })

    @classmethod
    def _create_company_image(cls, name='company.png'):
        """An image readable by every internal user but only writable by the
        users allowed to write on the company."""
        return cls._create_image(name, res_model='res.company', res_id=cls.env.company.id)


@tagged('post_install', '-at_install')
class TestMediaTag(MediaManagerCommon):

    def test_default_color(self):
        tags = self.Tag.create([{'name': f'Tag {i}'} for i in range(20)])
        for tag in tags:
            self.assertTrue(1 <= tag.color <= 11, "A color index should be assigned by default")

    def test_explicit_color(self):
        tag = self.Tag.create({'name': 'Banner', 'color': 3})
        self.assertEqual(tag.color, 3)

    def test_name_unique(self):
        self.Tag.create({'name': 'Banner'})
        with self.assertRaises(IntegrityError), mute_logger('odoo.sql_db'):
            self.Tag.create({'name': 'Banner'})

    def test_name_required(self):
        with self.assertRaises(IntegrityError), mute_logger('odoo.sql_db'):
            self.Tag.create({'name': False})

    def test_link_from_attachment(self):
        tag_banner, tag_logo = self.Tag.create([{'name': 'Banner'}, {'name': 'Logo'}])
        attachment = self._create_image('banner.png', media_tag_ids=[Command.set(tag_banner.ids)])
        self.assertEqual(attachment.media_tag_ids, tag_banner)
        self.assertEqual(tag_banner.attachment_ids, attachment, "The tag should be linked back to the attachment")
        self.assertFalse(tag_logo.attachment_ids)

    def test_link_from_tag(self):
        attachment_1 = self._create_image('one.png')
        attachment_2 = self._create_image('two.png')
        tag = self.Tag.create({
            'name': 'Banner',
            'attachment_ids': [Command.set((attachment_1 + attachment_2).ids)],
        })
        self.assertEqual(attachment_1.media_tag_ids, tag)
        self.assertEqual(attachment_2.media_tag_ids, tag)

    def test_multiple_tags_per_attachment(self):
        tags = self.Tag.create([{'name': 'Banner'}, {'name': 'Logo'}, {'name': 'Hero'}])
        attachment = self._create_image(media_tag_ids=[Command.set(tags[:2].ids)])
        self.assertEqual(attachment.media_tag_ids, tags[:2])

        attachment.media_tag_ids = [Command.link(tags[2].id)]
        self.assertEqual(attachment.media_tag_ids, tags)

        attachment.media_tag_ids = [Command.unlink(tags[0].id)]
        self.assertEqual(attachment.media_tag_ids, tags[1:])

    def test_search_attachments_by_tag(self):
        tag_banner, tag_logo = self.Tag.create([{'name': 'Banner'}, {'name': 'Logo'}])
        banner = self._create_image('banner.png', media_tag_ids=[Command.set(tag_banner.ids)])
        logo = self._create_image('logo.png', media_tag_ids=[Command.set(tag_logo.ids)])
        both = self._create_image('both.png', media_tag_ids=[Command.set((tag_banner + tag_logo).ids)])
        untagged = self._create_image('untagged.png')
        candidates = banner + logo + both + untagged

        def search(domain):
            return self.Attachment.search([('id', 'in', candidates.ids), *domain])

        self.assertEqual(search([('media_tag_ids', 'in', tag_banner.ids)]), banner + both)
        self.assertEqual(search([('media_tag_ids', 'in', tag_logo.ids)]), logo + both)
        self.assertEqual(search([('media_tag_ids.name', '=', 'Logo')]), logo + both)
        self.assertEqual(search([('media_tag_ids', '=', False)]), untagged)

    def test_read_group_by_tag(self):
        """The media manager search view allows to group by tag."""
        tag_banner, tag_logo = self.Tag.create([{'name': 'Banner'}, {'name': 'Logo'}])
        attachments = (
            self._create_image('banner.png', media_tag_ids=[Command.set(tag_banner.ids)])
            + self._create_image('both.png', media_tag_ids=[Command.set((tag_banner + tag_logo).ids)])
            + self._create_image('untagged.png')
        )
        groups = self.Attachment._read_group(
            [('id', 'in', attachments.ids)], ['media_tag_ids'], ['__count'],
        )
        self.assertEqual(
            {tag: count for tag, count in groups},
            {tag_banner: 2, tag_logo: 1, self.Tag: 1},
        )

    def test_unlink_tag_keeps_attachment(self):
        tag = self.Tag.create({'name': 'Banner'})
        attachment = self._create_image(media_tag_ids=[Command.set(tag.ids)])
        tag.unlink()
        self.assertTrue(attachment.exists())
        self.assertFalse(attachment.media_tag_ids)

    def test_unlink_attachment_keeps_tag(self):
        tag = self.Tag.create({'name': 'Banner'})
        attachment = self._create_image(media_tag_ids=[Command.set(tag.ids)])
        attachment.unlink()
        self.assertTrue(tag.exists())
        self.assertFalse(tag.attachment_ids)

    def test_copy_attachment_keeps_tags(self):
        tag = self.Tag.create({'name': 'Banner'})
        attachment = self._create_image(media_tag_ids=[Command.set(tag.ids)])
        self.assertEqual(attachment.copy().media_tag_ids, tag)

    # -------------------------------------------------------------------------
    # Access rights
    # -------------------------------------------------------------------------

    def test_internal_user_can_create_and_edit_tags(self):
        tag = self.Tag.with_user(self.user_a).create({'name': 'Banner'})
        tag.name = 'Hero'
        self.assertEqual(tag.name, 'Hero')
        self.assertEqual(self.Tag.with_user(self.user_b).search([('id', '=', tag.id)]), tag)

    def test_internal_user_cannot_delete_tags(self):
        tag = self.Tag.create({'name': 'Banner'})
        with self.assertRaises(AccessError):
            tag.with_user(self.user_a).unlink()

    def test_admin_can_delete_tags(self):
        tag = self.Tag.create({'name': 'Banner'})
        tag.with_user(self.user_admin).unlink()
        self.assertFalse(tag.exists())

    def test_portal_user_has_no_access_to_tags(self):
        tag = self.Tag.create({'name': 'Banner'})
        with self.assertRaises(AccessError):
            self.Tag.with_user(self.user_portal).search([])
        with self.assertRaises(AccessError):
            tag.with_user(self.user_portal).read(['name'])
        with self.assertRaises(AccessError):
            self.Tag.with_user(self.user_portal).create({'name': 'Logo'})

    def test_tag_own_attachment(self):
        tag = self.Tag.create({'name': 'Banner'})
        attachment = self._create_image(user=self.user_a)
        attachment.media_tag_ids = [Command.link(tag.id)]
        self.assertEqual(attachment.media_tag_ids, tag)

    def test_tagging_requires_write_access_on_attachment(self):
        """Tags are part of the attachment: unlike favorites, setting them
        requires the write access on the attachment."""
        tag = self.Tag.create({'name': 'Banner'})
        attachment = self._create_company_image()
        attachment_a = attachment.with_user(self.user_a)
        self.assertEqual(attachment_a.name, 'company.png', "The attachment should be readable")
        with self.assertRaises(AccessError):
            attachment_a.media_tag_ids = [Command.link(tag.id)]


@tagged('post_install', '-at_install')
class TestMediaFavorites(MediaManagerCommon):

    def test_favorite_readable_but_not_writable_attachment(self):
        """Favorites are personal: setting one only requires the read access."""
        attachment = self._create_company_image()
        attachment_a = attachment.with_user(self.user_a)
        with self.assertRaises(AccessError):
            attachment_a.name = 'renamed.png'

        attachment_a.is_favorite = True
        self.assertTrue(attachment_a.is_favorite)
        self.assertEqual(attachment.favorite_user_ids, self.user_a)

        attachment_a.is_favorite = False
        self.assertFalse(attachment_a.is_favorite)
        self.assertFalse(attachment.favorite_user_ids)

    def test_favorite_requires_read_access(self):
        # an attachment not linked to a record is only readable by its creator
        attachment = self._create_image('private.png', user=self.user_b)
        with self.assertRaises(AccessError):
            attachment.with_user(self.user_a).is_favorite = True
        self.assertFalse(attachment.sudo().favorite_user_ids)

    def test_favorites_are_per_user(self):
        attachment = self._create_company_image()
        attachment_a = attachment.with_user(self.user_a)
        attachment_b = attachment.with_user(self.user_b)

        attachment_a.is_favorite = True
        self.assertTrue(attachment_a.is_favorite)
        self.assertFalse(attachment_b.is_favorite, "Favorites should be per user")

        attachment_b.is_favorite = True
        self.assertEqual(attachment.favorite_user_ids, self.user_a + self.user_b)

        attachment_a.is_favorite = False
        self.assertFalse(attachment_a.is_favorite)
        self.assertTrue(attachment_b.is_favorite, "Removing a favorite should not affect the other users")
        self.assertEqual(attachment.favorite_user_ids, self.user_b)

    def test_is_favorite_depends_on_current_user(self):
        """The same record, read in the same transaction by two users."""
        attachment = self._create_company_image()
        attachment.with_user(self.user_a).is_favorite = True
        self.assertTrue(attachment.with_user(self.user_a).is_favorite)
        self.assertFalse(attachment.with_user(self.user_b).is_favorite)
        self.assertFalse(attachment.is_favorite, "The superuser did not set it as favorite")

    def test_set_favorite_twice(self):
        attachment = self._create_company_image()
        attachment_a = attachment.with_user(self.user_a)
        attachment_a.is_favorite = True
        attachment_a.is_favorite = True
        self.assertEqual(attachment.favorite_user_ids, self.user_a)

        attachment_a.is_favorite = False
        attachment_a.is_favorite = False
        self.assertFalse(attachment.favorite_user_ids)

    def test_set_favorite_on_multiple_attachments(self):
        attachments = self._create_company_image('one.png') + self._create_company_image('two.png')
        attachments.with_user(self.user_a).write({'is_favorite': True})
        for attachment in attachments:
            self.assertEqual(attachment.favorite_user_ids, self.user_a)

    def test_write_favorite_with_other_values(self):
        attachment = self._create_image('mine.png', user=self.user_a)
        attachment.write({'name': 'renamed.png', 'is_favorite': True})
        self.assertEqual(attachment.name, 'renamed.png')
        self.assertTrue(attachment.is_favorite)

    def test_write_favorite_with_other_values_still_checks_write_access(self):
        attachment = self._create_company_image()
        with self.assertRaises(AccessError):
            attachment.with_user(self.user_a).write({'name': 'renamed.png', 'is_favorite': True})
        self.assertEqual(attachment.name, 'company.png')

    def test_search_favorites(self):
        favorite = self._create_company_image('favorite.png')
        other = self._create_company_image('other.png')
        favorite.with_user(self.user_a).is_favorite = True
        candidates = favorite + other

        def search(user, domain):
            return self.Attachment.with_user(user).search([('id', 'in', candidates.ids), *domain])

        self.assertEqual(search(self.user_a, [('is_favorite', '=', True)]), favorite)
        self.assertEqual(search(self.user_a, [('is_favorite', '!=', False)]), favorite)
        self.assertEqual(search(self.user_a, [('is_favorite', '=', False)]), other)
        self.assertEqual(search(self.user_a, [('is_favorite', '!=', True)]), other)
        self.assertFalse(search(self.user_b, [('is_favorite', '=', True)]))
        self.assertEqual(search(self.user_b, [('is_favorite', '=', False)]), candidates)

    def test_copy_does_not_keep_favorites(self):
        attachment = self._create_company_image()
        attachment.with_user(self.user_a).is_favorite = True
        copy = attachment.copy()
        self.assertFalse(copy.favorite_user_ids)
        self.assertFalse(copy.with_user(self.user_a).is_favorite)

    def test_unlink_favorite_attachment(self):
        attachment = self._create_image('mine.png', user=self.user_a)
        attachment.is_favorite = True
        attachment.unlink()
        self.assertFalse(self.Attachment.with_user(self.user_a).search([('is_favorite', '=', True)]))

    def test_read_is_favorite(self):
        """`is_favorite` is read by the media manager kanban view."""
        favorite = self._create_company_image('favorite.png')
        other = self._create_company_image('other.png')
        favorite.with_user(self.user_a).is_favorite = True
        values = (favorite + other).with_user(self.user_a).read(['is_favorite'])
        self.assertEqual(
            {value['id']: value['is_favorite'] for value in values},
            {favorite.id: True, other.id: False},
        )


@tagged('post_install', '-at_install')
class TestMediaManagerViews(MediaManagerCommon):

    def test_media_manager_views(self):
        kanban = self.env.ref('html_editor.mediamanager_media_kanban')
        search = self.env.ref('html_editor.mediamanager_media_search')
        views = self.Attachment.with_user(self.user_a).get_views([(kanban.id, 'kanban'), (search.id, 'search')])

        kanban_arch = views['views']['kanban']['arch']
        self.assertIn('widget="media_tags"', kanban_arch, "Tags should be editable from the card menu")
        self.assertIn('widget="many2many_tags"', kanban_arch, "Tags should be displayed on the card")
        self.assertIn('is_favorite', kanban_arch)

        search_arch = views['views']['search']['arch']
        self.assertIn("'group_by':'media_tag_ids'", search_arch.replace(' ', ''), "It should be possible to group by tag")
        self.assertIn('media_tag_ids', views['models']['ir.attachment']['fields'])
