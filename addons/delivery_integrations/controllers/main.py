from odoo import http
from odoo.http import request
from odoo.exceptions import AccessError, UserError, ValidationError


class DeliveryIntegrationsController(http.Controller):
    @http.route('/delivery_service', type='http', methods=['POST'], auth='public', csrf=False)
    def delivery_service(self, **kw):
        request_data = request.get_json_data()
        method_name: str = request_data.get("action")
        request_objects: list = request_data.get('objects') or []
        context: dict = request_data.get('context') or {}
        response_data = {}
        # create a db transaction
        try:
            # or create records and then delete them after some time except for the dbuuid and company
            # or create a transaction ???
            with request.env.cr.savepoint():
                records_mapper = {}
                # loop over the different dicts in a list
                for list_item in request_objects:
                    print("============== item ==================", list_item)
                    self._convert_dictionary_data_to_odoo_records(list_item, records_mapper)
                carrier = next(iter(records_mapper.get('delivery.carrier', {}).values()), None)
                order = next(iter(records_mapper.get('sale.order', {}).values()), None)
                pickings = list(records_mapper.get('stock.picking', {}).values())
                result = {}
                if hasattr(carrier, f"{carrier.delivery_type}_{method_name}"):
                    if method_name == "rate_shipment":
                        result = getattr(carrier.with_context(context), f"{carrier.delivery_type}_{method_name}")(order)
                    elif method_name == "send_shipping":
                        result = getattr(carrier.with_context(context), f"{carrier.delivery_type}_{method_name}")(pickings)
                    elif method_name == "get_return_label":
                        result = getattr(carrier.with_context(context), f"{carrier.delivery_type}_{method_name}")(pickings, tracking_number=None, origin_date=None)
                    elif method_name == "cancel_shipment":
                        result = getattr(carrier.with_context(context), f"{carrier.delivery_type}_{method_name}")(pickings)
                else:
                    result = {"error": "Carrier %s does not support %s method" % (carrier.name, method_name)}
                response_data = {"data": result}
        except (ValueError, AccessError, UserError, ValidationError) as error:
            response_data = {"error": str(error)}
        # rollback db transaction after making the API request and getting the response
        request.env.cr.rollback()
        # self.env.cr.cache.clear()
        # self.env.flush_all()
        return request.make_json_response(response_data)

    def _convert_dictionary_data_to_odoo_records(self, data: dict, records_mapper: dict = {}):
        # loop over the record values list grouped by model
        for key, vals_list in data.items():
            print("============== key, vals_list ==================", key, vals_list)
            model, search_scope = key.split(':', 1)
            if not vals_list:
                continue
            # if isinstance(vals_list, dict):
            #     vals_list = [vals_list]
            # elif isinstance(value, list):
            # loop over the record values list of a model
            for record_vals in vals_list:
                print("============== record_vals ==================", record_vals)
                record = None
                vals = {}
                if search_scope == 'global':
                    record = self.env[model].sudo().search([
                        (field, '=', value) for field, value in record_vals.items() if field != 'id'], limit=1)
                    if not record:
                        vals.update({field: value for field, value in record_vals.items() if field != 'id'})
                elif search_scope == 'local':
                    print("-----------------------------------------------------", record, vals, records_mapper)
                    field_definitions = self.env[model].sudo().fields_get()
                    # loop over the fields/keys of a record vals
                    for field, val in record_vals.items():
                        print("============== field, val ==================", field, val)
                        if field == 'id':
                            continue
                        if field_model := field_definitions.get(field, {}).get('relation'):
                            # add or replace according to many2one one2many many2many
                            if not val:
                                vals[field] = val
                            else:
                                vals[field] = records_mapper.get(field_model).get(str(val)).id
                                # order models of received data is not correct if no match is found
                        else:
                            vals[field] = val
                if not record:
                    record = self.env[model].sudo().create(vals)
                    # breakpoint()
                # records_mapper.setdefault(model, {})[str(record_vals.get('id'))] = record
                if model not in records_mapper:
                    records_mapper[model] = {}
                if str(record_vals.get('id')) not in records_mapper[model]:
                    records_mapper[model][str(record_vals.get('id'))] = record
