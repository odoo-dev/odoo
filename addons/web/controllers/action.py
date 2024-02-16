# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from odoo import _
from odoo.exceptions import MissingError
from odoo.http import Controller, request, route
from .utils import clean_action


_logger = logging.getLogger(__name__)


class Action(Controller):

    @route('/web/action/load', type='json', auth='user', readonly=True)
    def load(self, action_id, additional_context=None):
        Actions = request.env['ir.actions.actions']
        value = False
        try:
            action_id = int(action_id)
        except ValueError:
            try:
                action = request.env.ref(action_id)
                assert action._name.startswith('ir.actions.')
                action_id = action.id
            except Exception as exc:
                try:
                    action = Actions.search([('path', '=', action_id)], limit=1)
                    assert action._name.startswith('ir.actions.')
                    action_id = action.id
                except Exception:
                    raise MissingError(_("The action %r does not exist.", action_id)) from exc

        base_action = Actions.browse([action_id]).sudo().read(['type'])
        if base_action:
            action_type = base_action[0]['type']
            if action_type == 'ir.actions.report':
                request.update_context(bin_size=True)
            if additional_context:
                request.update_context(**additional_context)
            action = request.env[action_type].sudo().browse([action_id]).read()
            if action:
                value = clean_action(action[0], env=request.env)
        return value

    @route('/web/action/run', type='json', auth="user")
    def run(self, action_id, context=None):
        if context:
            request.update_context(**context)
        action = request.env['ir.actions.server'].browse([action_id])
        result = action.run()
        return clean_action(result, env=action.env) if result else False

    @route('/web/action/load_breadcrump', type='json', auth='user', readonly=True)
    def load_breadcrump(self, actions):
        display_names = []
        for action in actions:
            try:
                if action.get('action'):
                    act = self.load(action.get('action'))
                    if action.get("resId"):
                        display_names.append(request.env[act["res_model"]].browse([action.get("resId")]).display_name)
                    else:
                        display_names.append(act["display_name"])
                elif action.get("model"):
                    if action.get("resId"):
                        display_names.append(request.env[action.get("model")].browse([action.get("resId")]).display_name)
                    else:
                        display_names.append(request.env[action.get("model")]._description)
                else:
                    display_names.append(None)
            except Exception:
                display_names.append(None)
        return display_names
