from lxml import etree

from odoo import api, models
from odoo.tools.view_validation import get_dict_asts, get_domain_value_names

# How much each place a field appears in says about its importance.
SCORE_ALWAYS = 100        # record name, status bar
SCORE_SEARCH_FIELD = 3    # <field> in the search view
SCORE_GROUP_BY = 3        # "Group By" filter on the field
SCORE_FILTER = 2          # predefined filter whose domain uses the field
SCORE_LIST_COLUMN = 2     # column shown by default in the list view

# Fields that look important to the views but never are for a beginner.
IGNORED_FIELDS = {'active', 'is_favorite', 'company_id', 'activity_ids', 'activity_state', 'activity_exception_decoration'}


class LearningImportance(models.AbstractModel):
    """Guesses which fields of a model matter, from the views Odoo already has:
    what people search, filter and group by, and the default list columns."""

    _name = 'learning.importance'
    _description = "Field Importance for Focus Mode"

    @api.model
    def get_focus_profile(self, res_model):
        """Return ``{field_name: score}`` for the fields of ``res_model`` worth
        showing to a beginner, the most important having the highest score."""
        Model = self.env[res_model]
        scores = {}

        def add(field_name, score):
            field_name = field_name.split('.')[0]
            if field_name in Model._fields and field_name not in IGNORED_FIELDS:
                scores[field_name] = scores.get(field_name, 0) + score

        search_arch = self._get_arch(Model, 'search')
        for node in search_arch.iter('field'):
            if self._is_visible(node):
                add(node.get('name'), SCORE_SEARCH_FIELD)
        for node in search_arch.iter('filter'):
            if not self._is_visible(node):
                continue
            if node.get('domain'):
                field_names, _context_names = get_domain_value_names(node.get('domain'))
                for field_name in field_names:
                    add(field_name, SCORE_FILTER)
            if node.get('context'):
                group_by = get_dict_asts(node.get('context')).get('group_by')
                if group_by is not None and isinstance(getattr(group_by, 'value', None), str):
                    add(group_by.value.split(':')[0], SCORE_GROUP_BY)

        list_arch = self._get_arch(Model, 'list')
        for node in list_arch.iter('field'):
            if self._is_visible(node) and node.get('optional') != 'hide' and node.get('column_invisible') not in ('1', 'True'):
                add(node.get('name'), SCORE_LIST_COLUMN)

        form_arch = self._get_arch(Model, 'form')
        for node in form_arch.iter('field'):
            if node.get('widget') == 'statusbar':
                add(node.get('name'), SCORE_ALWAYS)
        add(Model._rec_name or 'id', SCORE_ALWAYS)

        for override in self.env['learning.focus.override'].sudo().search([('model', '=', res_model)]):
            if override.focus == 'in':
                scores[override.field_name] = max(scores.get(override.field_name, 0), SCORE_ALWAYS)
            else:
                scores.pop(override.field_name, None)
        return scores

    def _get_arch(self, Model, view_type):
        return etree.fromstring(Model.get_view(view_type=view_type)['arch'])

    def _is_visible(self, node):
        return node.get('invisible') not in ('1', 'True') and 'base.group_no_one' not in (node.get('groups') or '')
