from odoo import models, api


class ResUsers(models.Model):
    _inherit = ['res.users']

    @api.model
    def _load_pos_data_domain(self, data):
        return [('id', '=', self.env.uid)]

    @api.model
    def _load_pos_data_fields(self, config_id):
        return ['id', 'name', 'partner_id', 'groups_id']

    def _load_pos_data(self, data):
        domain = self._load_pos_data_domain(data)
        fields = self._load_pos_data_fields(data['pos.config']['data'][0]['id'])
        user = self.search_read(domain, fields, load=False)
        if data['pos.config']['data'][0]['group_pos_manager_id'] in user[0]['groups_id']:
            user[0]['role'] = 'manager'
        elif data['pos.config']['data'][0]['group_pos_user_id'] in user[0]['groups_id']:
            user[0]['role'] = 'cashier'
        elif data['pos.config']['data'][0]['group_pos_minimal_user_id'] in user[0]['groups_id']:
            user[0]['role'] = 'minimal'
        del user[0]['groups_id']
        return {
            'data': user,
            'fields': fields,
        }
