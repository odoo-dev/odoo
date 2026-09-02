from lxml import html

from odoo.tests import HttpCase, tagged


@tagged('-at_install', 'post_install')
class TestForumIndex(HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.plain_forum, cls.course_forum = cls.env['forum.forum'].create([
            {'name': 'Plain Forum', 'privacy': 'public'},
            {'name': 'Course Forum'},
        ])
        cls.course = cls.env['slide.channel'].create({
            'name': 'Test Course',
            'forum_id': cls.course_forum.id,
            'visibility': 'public',
            'website_published': True,
        })

    def _get_forums_listing(self):
        self.env.flush_all()
        response = self.url_open('/forum')
        self.assertEqual(response.status_code, 200)
        listing = html.fromstring(response.text).xpath('//div[@id="o_wforum_forums_index_list"]')
        self.assertTrue(listing, 'The forum index page should render its forums listing.')
        return listing[0]

    def test_forum_index_promotes_slides_with_a_course_forum(self):
        listing = self._get_forums_listing()

        self.assertIn(
            'Course Forum', listing.xpath('.//h3/text()'),
            'A forum linked to a published public course should be listed.',
        )
        self.assertTrue(
            listing.xpath('.//a[@href="/slides"]'),
            'The forums listing should promote the courses when a forum is linked to one.',
        )

    def test_forum_index_does_not_promote_slides_without_a_course_forum(self):
        # the courses group of the listing compares recordsets to know which
        # group it is rendering, and two empty recordsets are equal
        self.env['slide.channel'].search([('forum_id', '!=', False)]).forum_id = False
        listing = self._get_forums_listing()

        self.assertIn(
            'Plain Forum', listing.xpath('.//h3/text()'),
            'A public forum should still be listed.',
        )
        self.assertFalse(
            listing.xpath('.//a[@href="/slides"]'),
            'The forums listing should not promote the courses when no forum is linked to one.',
        )
