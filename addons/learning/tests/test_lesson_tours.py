import json

from odoo.tests import HttpCase, tagged


class LessonTourCase(HttpCase):
    """Plays lesson checkpoints as tours generated from the lessons
    themselves (see static/tests/tours/lesson_tours.js)."""

    def play_checkpoint(self, lesson_key, checkpoint_key, login='admin'):
        user = self.env['res.users'].search([('login', '=', login)])
        result = self.env['learning.setup'].with_user(user).run(lesson_key, checkpoint_key)
        location, params = (result['location'], result['params']) if 'location' in result else (result, {})
        if not location:
            url = "/odoo"
        elif location['type'] == 'ir.actions.act_url':
            url = location['url']
        elif location.get('res_id'):
            url = f"/odoo/{location['res_model']}/{location['res_id']}"
        elif location.get('path'):
            url = f"/odoo/{location['path']}"
        else:
            url = f"/odoo/action-{location['id']}"
        tour_name = f'learning_lesson_{lesson_key}_{checkpoint_key}'
        self.start_tour(url, tour_name, login=login, code=(
            f"window.learningTourParams = {json.dumps(params)}; odoo.startTour({tour_name!r}, {{}})"
        ))


@tagged('post_install', '-at_install')
class TestLessonTours(LessonTourCase):

    def test_first_card(self):
        self.play_checkpoint('first_card', 'start')
        # renamed, then saved by leaving the form
        self.assertTrue(self.env['learning.practice.card'].search([('name', '=', "Buy copper pipes and fittings")]))

    def test_discard_card(self):
        self.env['learning.setup'].with_user(self.env.ref('base.user_admin')).run('discard_card', 'start')
        card = self.env['learning.practice.card'].search([('user_id', '=', self.env.ref('base.user_admin').id)])
        name = card.name
        self.play_checkpoint('discard_card', 'start')
        card.invalidate_recordset()
        self.assertEqual(card.name, name, "the change was thrown away")

    def test_copy_card(self):
        self.play_checkpoint('copy_card', 'start')
        self.assertTrue(self.env['learning.practice.card'].search([('name', '=', "Buy brass fittings")]))

    def test_find_card(self):
        self.play_checkpoint('find_card', 'start')

    def test_archive_card(self):
        self.play_checkpoint('archive_card', 'start')
        card = self.env['learning.practice.card'].with_context(active_test=False).search([('name', '=', "Old idea")])
        self.assertTrue(card.active, "archived, then brought back")

    def test_delete_card(self):
        self.play_checkpoint('delete_card', 'start')
        self.assertFalse(self.env['learning.practice.card'].with_context(active_test=False).search([('name', '=', "Card to throw away")]))

    def test_card_lines(self):
        self.play_checkpoint('card_lines', 'start')
        card = self.env['learning.practice.card'].search([('name', '=', "Bathroom renovation")])
        self.assertEqual(card.line_ids.mapped('name'), ["Lay new tiles"])
