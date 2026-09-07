# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models

# Keep in sync with LOAD_LIMIT in
# addons/web_hierarchy/static/src/hierarchy_model.js
LOAD_LIMIT = 40


class Base(models.AbstractModel):
    _inherit = 'base'

    @api.model
    def hierarchy_read(self, domain, specification, parent_field, child_field=None, order=None, limit=None, offset=0):
        if parent_field not in specification:
            specification[parent_field] = {"fields": {"display_name": {}}}
        records = self.search(domain, order=order)
        fetch_child_ids_for_all_records = False
        if not records:
            return {'records': [], 'length': 0}
        elif len(records) == 1:
            domain = [(parent_field, '=', records.id), ('id', '!=', records.id)]
            if records[parent_field]:
                records += records[parent_field]
                domain = [('id', 'not in', records.ids), (parent_field, 'in', records.ids)]
            records += self.search(domain, order=order)
        else:
            fetch_child_ids_for_all_records = True
        total_count = len(records)
        records_to_read = records
        if limit is not None and fetch_child_ids_for_all_records:
            records_to_read = records[offset:offset + limit]
        children_ids_per_record_id = {}
        if not child_field:
            children_ids_per_record_id = {
                record.id: child_ids
                for record, child_ids in self._read_group(
                    [(parent_field, 'in', records_to_read.ids if fetch_child_ids_for_all_records else (records - records[parent_field]).ids)],
                    (parent_field,),
                    ('id:array_agg',),
                    order=order
                )
            }
        result = records_to_read.web_read(specification)
        if children_ids_per_record_id:
            for record_data in result:
                if record_data['id'] in children_ids_per_record_id:
                    record_data['__child_ids__'] = children_ids_per_record_id[record_data['id']]
        return {'records': result, 'length': total_count}
