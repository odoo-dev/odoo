from odoo import api, models
from odoo.exceptions import UserError


class LearningSetup(models.AbstractModel):
    """Puts the user in the situation a lesson checkpoint expects.

    Each checkpoint has a method ``_setup_<lesson>_<checkpoint>`` that creates
    the data it needs (idempotent, registered as practice records) and returns
    either the client action to open, or ``{'location': action or False,
    'params': {...}}`` where ``params`` feed lesson steps that depend on the
    database (e.g. the menus leading to a screen). ``False`` means the learner
    stays where they are. Modules adding lessons inherit this model.
    """

    _name = 'learning.setup'
    _description = "Lesson Checkpoint Setup"

    @api.model
    def run(self, lesson_key, checkpoint_key):
        method = getattr(self, f'_setup_{lesson_key}_{checkpoint_key}', None)
        if not method:
            raise UserError(self.env._("No setup for checkpoint %(checkpoint)s of lesson %(lesson)s.", checkpoint=checkpoint_key, lesson=lesson_key))
        return method()

    # ------------------------------------------------------------
    # Helpers for setups
    # ------------------------------------------------------------

    def _practice_record(self, res_model, values, domain=None):
        """Return the current user's practice record of ``res_model`` matching
        ``domain`` (or ``values``' name), creating and registering it if needed."""
        practice = self.env['learning.practice.record']
        domain = domain or [('name', '=', values['name'])]
        record = self.env[res_model].search([
            ('id', 'in', practice.search([('res_model', '=', res_model), ('user_id', '=', self.env.uid)]).mapped('res_id')),
            *domain,
        ], limit=1)
        if not record:
            record = self.env[res_model].create(values)
            practice.register(res_model, record.ids)
        return record

    def _menu_path(self, res_model, preferred_apps=()):
        """Return the way to a list of ``res_model`` through the menus the user
        sees, from the app to the menu item: ``[{'xmlid', 'name'}, ...]``, or an
        empty list if no menu leads there.

        :param preferred_apps: xmlids of the apps to go through first, if installed
        """
        Menu = self.env['ir.ui.menu']
        visible = Menu.search([])._filter_visible_menus()
        candidates = visible.filtered(lambda menu: (
            menu.action and menu.action._name == 'ir.actions.act_window'
            and menu.action.sudo().res_model == res_model
        ))
        paths = []
        for menu in candidates:
            path = [menu]
            while path[0].parent_id:
                path.insert(0, path[0].parent_id)
            paths.append(path)
        xmlids = Menu.union(menu for path in paths for menu in path)._get_menuitems_xmlids()
        # menus are found by their xmlid on screen, and all must be visible
        paths = [path for path in paths if all(menu in visible and menu.id in xmlids for menu in path)]
        if not paths:
            return []

        def app_rank(path):
            app_xmlid = xmlids[path[0].id]
            return preferred_apps.index(app_xmlid) if app_xmlid in preferred_apps else len(preferred_apps)

        best = min(paths, key=lambda path: (app_rank(path), len(path)))
        return [{'xmlid': xmlids[menu.id], 'name': menu.name} for menu in best]

    def _menu_location(self, res_model, fallback_action_xmlid, preferred_apps=(), **params):
        """Checkpoint result for lessons that start by finding a list through
        the menus, from wherever the learner is (see ``menuSteps`` in the web
        client). Without any menu leading there, open the list directly."""
        menu_path = self._menu_path(res_model, preferred_apps)
        location = False if menu_path else self.env['ir.actions.act_window']._for_xml_id(fallback_action_xmlid)
        return {'location': location, 'params': {'menuPath': menu_path, **params}}

    def _form_location(self, record, action_xmlid):
        """Open ``record`` as if the learner came from the list of
        ``action_xmlid``: the breadcrumb leads back to that list.

        Opening the URL reloads the page, so the web client rebuilds the
        breadcrumb from it; the lesson resumes after the reload.
        """
        path = self.env['ir.actions.act_window']._for_xml_id(action_xmlid).get('path') or f'action-{action_xmlid}'
        return {'type': 'ir.actions.act_url', 'url': f'/odoo/{path}/{record.id}', 'target': 'self'}

    # ------------------------------------------------------------
    # Lessons on the practice card
    # ------------------------------------------------------------

    def _setup_first_card_start(self):
        return self.env['ir.actions.act_window']._for_xml_id('learning.learning_practice_card_action')

    def _practice_card_form(self):
        """Open one of the user's original practice cards (not a copy)."""
        card = self.env['learning.practice.card'].search([
            ('user_id', '=', self.env.uid),
            ('name', 'not ilike', '(%)'),  # an original, not an earlier copy
        ], limit=1)
        if not card:
            card = self.env['learning.practice.card'].create({'name': self.env._("My first card")})
        return self._form_location(card, 'learning.learning_practice_card_action')

    def _setup_discard_card_start(self):
        return self._practice_card_form()

    def _setup_copy_card_start(self):
        return self._practice_card_form()

    def _practice_card(self, name, **values):
        """The user's practice card named ``name``, created if needed, reset
        to ``values`` (and active) so the lesson can be replayed."""
        Card = self.env['learning.practice.card'].with_context(active_test=False)
        card = Card.search([('user_id', '=', self.env.uid), ('name', '=', name)], limit=1)
        if not card:
            card = Card.create({'name': name})
        card.write({'active': True, **values})
        return card

    def _setup_find_card_start(self):
        # enough cards for searching to make sense
        for name in (
            self.env._("Buy brass fittings"),
            self.env._("Call the tiler"),
            self.env._("Order bathroom tiles"),
            self.env._("Send the quote to Mrs Martin"),
        ):
            self._practice_card(name)
        self._practice_card(self.env._("Check the boiler"), done=True)
        return self.env['ir.actions.act_window']._for_xml_id('learning.learning_practice_card_action')

    def _setup_archive_card_start(self):
        card = self._practice_card(self.env._("Old idea"), kind='idea')
        return self._form_location(card, 'learning.learning_practice_card_action')

    def _setup_delete_card_start(self):
        card = self._practice_card(self.env._("Card to throw away"))
        return self._form_location(card, 'learning.learning_practice_card_action')

    def _setup_card_lines_start(self):
        card = self._practice_card(self.env._("Bathroom renovation"), kind='task')
        card.line_ids.unlink()
        return self._form_location(card, 'learning.learning_practice_card_action')
