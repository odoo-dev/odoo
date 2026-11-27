# Part of Odoo. See LICENSE file for full copyright and licensing details.

from lxml import etree

from odoo import api, fields, models
from odoo.tools.view_validation import get_expression_field_names


class IrUiView(models.Model):
    _inherit = 'ir.ui.view'

    # The hub of a model: the buttons shown as tabs above the views of the
    # actions opened for one of its records (see ``web_get_hub``)
    type = fields.Selection(selection_add=[('hub', "Hub")])

    @api.model
    @api.ormcache(cache='templates')
    def _get_hub_models(self):
        """ Return the models having a hub view, for the web client to look for
        the hub of their records (see ``web_get_hub``).
        """
        # sudo: the views are not readable by all users
        views = self.sudo().search_fetch([('type', '=', 'hub'), ('mode', '=', 'primary')], ['model'])
        return tuple(sorted(set(views.mapped('model'))))

    def _postprocess_tag_hub(self, node, name_manager, node_info):
        # the context of the buttons is evaluated on the record (see
        # web_get_hub): the fields it uses must be read, as for modifiers
        for button in node.iterchildren('button'):
            if expr := button.get('context'):
                name_manager.must_have_fields(
                    button, get_expression_field_names(expr), node_info, ('context', expr),
                )

    def _validate_tag_hub(self, node, name_manager, node_info):
        if not node_info['validate']:
            return
        for child in node.iterchildren(tag=etree.Element):
            if child.tag != 'button':
                self._raise_view_error(self.env._("A hub view can only contain buttons."), child)
            if child.get('type') not in ('object', 'action') or not child.get('name'):
                self._raise_view_error(self.env._(
                    "The buttons of a hub view must open an action (type=\"action\") or call a "
                    "method (type=\"object\"), given by their name.",
                ), child)
            if not child.get('string'):
                self._raise_view_error(self.env._("The buttons of a hub view must have a string."), child)

    def get_view_info(self):
        _view_info = self._get_view_info()
        return {
            type_: {
                'display_name': display_name,
                'icon': _view_info[type_]['icon'],
                'multi_record': _view_info[type_].get('multi_record', True),
            }
            for (type_, display_name)
            in self.fields_get(['type'], ['selection'])['type']['selection']
            if type_ != 'qweb' and type_ in _view_info
        }

    def _get_view_info(self):
        return {
            'list': {'icon': 'reorder'},
            'form': {'icon': 'contact_mail', 'multi_record': False},
            'graph': {'icon': 'bar_chart'},
            'pivot': {'icon': 'oi_view-pivot'},
            'kanban': {'icon': 'oi_view-kanban'},
            'calendar': {'icon': 'calendar_today'},
            'search': {'icon': 'search'},
        }
