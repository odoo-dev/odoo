from odoo import http
from odoo.http import request
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tools import frozendict

past_objects = {}


class DeliveryIntegrationsController(http.Controller):
    @http.route('/delivery_service/rate_shipment', type='http', methods=['POST'], auth='public', csrf=False)
    def delivery_service(self, **kw):
        request_body = request.get_json_data() or {}
        response_data = {}
        # create a db transaction
        try:
            # or create a transaction ???
            with request.env.cr.savepoint():
                objects = {}
                for key, value in request_body.items():
                    model, action = key.split(':', 1)
                    object = self._odoo_objects_structure_parser(model, action, value)
                    objects[model] = object
                past_objects.clear()
                carrier_id = objects.get('delivery.carrier')
                order_id = objects.get('sale.order')
                carrier = self.env['delivery.carrier'].sudo().browse(carrier_id)
                order = self.env['sale.order'].sudo().browse(order_id)
                if hasattr(carrier, '%s_rate_shipment' % carrier.delivery_type):
                    result = getattr(carrier, '%s_rate_shipment' % carrier.delivery_type)(order)
                else:
                    result = {'error': "Carrier does not support rate shipment"}
                response_data = {'status': 'success', 'data': result}
        except (ValueError, AccessError, UserError, ValidationError) as error:
            response_data = {'status': 'error', 'message': str(error)}
        # rollback db transaction after making the API request and getting the response
        request.env.cr.rollback()
        return response_data

    def _odoo_objects_structure_parser(self, model, action, data):
        """
        Recursively parse the incoming data, searching or creating Odoo records as needed.
        action is name of the record to identify it later in other object's parsing
        
        action scan be:
        - create
        - find/search
        - search_or_create
        - search_and_update
        - search_and_update_or_create
        """
        print("===== parser =====", model, action, data)
        # breakpoint()
        if isinstance(data, list):
            records = self.env[model]
            for item_data in data:
                item_record = self._odoo_objects_structure_parser(model, action, item_data)
                if item_record:
                    records |= item_record
            return records
        elif isinstance(data, dict):
            vals = {}
            for key, value in data.items():
                if value is None:
                    continue
                if ':' in key:
                    field, field_action = key.split(':', 1)
                    field_model = self.env[model].fields_get().get(field).get('relation')
                    # field_type = self.env[model].fields_get().get(field).get('type') # many2one, one2many, many2many
                    record = self._odoo_objects_structure_parser(field_model, field_action, value)
                    if isinstance(value, dict):
                    #     vals = self._odoo_objects_structure_parser(field_model, field_action, value)
                        vals[field] = record.id
                        # Command.link(record.id)
                    elif isinstance(value, list):
                    #     vals = [self._odoo_objects_structure_parser(field_model, field_action, item) for item in value]
                        vals[field] = record.ids
                        # [Command.link(r.id) for r in record]
                    # print(record)
                else:
                    vals[key] = value
            record = None
            # if action == 'search':
            #     record = self.env[model].sudo().search([(field, '=', value) for field, value in data.items()], limit=1)
            if action == 'search_global_or_create':
                # record = self.env[model].sudo().search([(field, '=', value) for field, value in data.items()], limit=1)
                # record = past_objects.get((model, frozenset(data.items())))
                # match every field
                record = self.env[model].sudo().search([(field, '=', value) for field, value in data.items()], limit=1)
            elif action == 'search_local_or_create':
                for obj in past_objects.get(model) or []:
                    if all(getattr(obj, field) == value for field, value in data.items()):
                        record = obj
                        break
            if action == 'create' or not record:
                # will generate error in case of currency, country, state,...
                record = self.env[model].sudo().create(vals)
                # past_objects[frozenset((model, frozendict(data.items())))] = record
                if past_objects.get(model):
                    past_objects[model].append(record)
                else:
                    past_objects[model] = [record]
            print(record)
            return record
