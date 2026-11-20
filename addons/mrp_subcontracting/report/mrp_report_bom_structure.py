# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models, _


class ReportMrpReport_Bom_Structure(models.AbstractModel):
    _inherit = 'report.mrp.report_bom_structure'

    @api.model
    def _get_report_values(self, docids, data=None):
        if data and data.get('subcontractor_id'):
            self = self.with_context(bom_overview_subcontractor_id=int(data['subcontractor_id']))  # noqa: PLW0642
        return super()._get_report_values(docids, data)

    @api.model
    def _get_report_data(self, bom_id, searchQty=0, searchVariant=False):
        res = super()._get_report_data(bom_id, searchQty, searchVariant)
        bom = self.env['mrp.bom'].browse(bom_id)
        if bom.type == 'subcontract' and len(bom.subcontractor_ids) > 1:
            lines = res['lines']
            lines['subcontractors'] = [{'id': partner.id, 'name': partner.display_name} for partner in bom.subcontractor_ids]
            lines['subcontractor_id'] = self._get_selected_subcontractor(bom).id or lines.get('subcontracting', {}).get('partner_id', False)
        return res

    @api.model
    def _get_selected_subcontractor(self, bom):
        """ Subcontractor selected in the BoM overview, if it is one of the BoM's subcontractors.
        Without selection, default to the first subcontractor when none of them has a vendor pricelist. """
        partner = self.env['res.partner'].browse(self.env.context.get('bom_overview_subcontractor_id'))
        if partner in bom.subcontractor_ids:
            return partner
        if not bom.product_tmpl_id.seller_ids.filtered(lambda s: s.partner_id in bom.subcontractor_ids):
            return bom.subcontractor_ids[:1]
        return self.env['res.partner']

    @api.model
    def _get_subcontractors(self, bom):
        return self._get_selected_subcontractor(bom) or bom.subcontractor_ids

    def _get_subcontracting_line(self, bom, seller_info, level, bom_quantity):
        ratio_uom_seller = seller_info['uom_id'].factor / bom.uom_id.factor
        price = seller_info['currency_id']._convert(seller_info['price'], self.env.company.currency_id, (bom.company_id or self.env.company))
        return {
            'name': seller_info['partner_id'].display_name,
            'partner_id': seller_info['partner_id'].id,
            'quantity': bom_quantity,
            'uom': bom.uom_id.name,
            'bom_cost': price / ratio_uom_seller * bom_quantity,
            'level': level or 0
        }

    @api.model
    def _get_component_available_qty(self, bom_data, component):
        qty = super()._get_component_available_qty(bom_data, component)
        if bom_data.get('bom').type == 'subcontract':
            qty += component.get('subcontract_free_qty', 0)
        return qty

    def _get_pdf_doc(self, bom_id, data, quantity, product_variant_id=None):
        doc = super()._get_pdf_doc(bom_id, data, quantity, product_variant_id)
        doc['is_subcontract'] = any(line.get('type') == 'subcontract' for line in doc.get('lines'))
        return doc

    @api.model
    def _get_component_forecast_available_qty(self, quantities_info, parent_bom=False):
        qty = super()._get_component_forecast_available_qty(quantities_info, parent_bom)
        if parent_bom and parent_bom.type == 'subcontract':
            qty += quantities_info.get('subcontract_free_qty', 0)
        return qty

    def _get_bom_data(self, bom, warehouse, product=False, line_qty=False, bom_line=False, level=0, parent_bom=False, parent_product=False, index=0, product_info=False, ignore_stock=False, simulated_leaves_per_workcenter=False):
        res = super()._get_bom_data(bom, warehouse, product, line_qty, bom_line, level, parent_bom, parent_product, index, product_info, ignore_stock, simulated_leaves_per_workcenter)
        if (bom.type == 'subcontract' or (parent_bom and parent_bom.type == 'subcontract')) and not self.env.context.get('minimized', False):
            seller_info = {}
            if not res['product']:
                seller_info = bom.product_tmpl_id.seller_ids.filtered(lambda s: s.partner_id in self._get_subcontractors(bom))[:1]._get_seller_info()
            elif bom.type == 'subcontract':
                seller_info = res['product']._select_seller(quantity=res['quantity'], uom_id=bom.uom_id, params={'subcontractor_ids': self._get_subcontractors(bom)})
                if not seller_info:
                    # If no vendor found for the right quantity, we still want to display the vendor in red
                    seller_info = res['product']._select_seller(quantity=None, uom_id=bom.uom_id, params={'subcontractor_ids': self._get_subcontractors(bom)})
                    res['text_danger'] = True
            if seller_info:
                res['subcontracting'] = self._get_subcontracting_line(bom, seller_info, level + 1, res['quantity'])
                if not self.env.context.get('minimized', False):
                    res['bom_cost'] += res['subcontracting']['bom_cost']
                    res['bom_unit_cost'] += bom.uom_id._compute_price(res['subcontracting']['bom_cost'], product.uom_id)
            if not ignore_stock:
                quantities_info = self._get_quantities_info(res.get('product'), bom.uom_id, product_info, bom=bom, parent_bom=parent_bom, parent_product=parent_product)
                if quantities_info.get('subcontracting_loc'):
                    res['subcontract_free_qty'] = quantities_info.get('subcontract_free_qty', 0)
                    res['subcontract_qty_on_hand'] = quantities_info.get('subcontract_qty_on_hand', 0)
                    if res['subcontract_qty_on_hand'] >= line_qty:
                        res['status'] = self._format_date_display('available', 0)
                        res['availability_state'] = 'available'
                        res['availability_delay'] = 0

        return res

    @api.model
    def _get_component_data(self, parent_bom, parent_product, warehouse, bom_line, line_quantity, level, index, product_info, ignore_stock=False):
        res = super()._get_component_data(parent_bom, parent_product, warehouse, bom_line, line_quantity, level, index, product_info, ignore_stock)
        if parent_bom and parent_bom.type == 'subcontract' and not ignore_stock and (product_info.get(parent_product.id, {}).get(parent_bom.id, {}).get('route_type') == 'subcontract'):
            quantities_info = self._get_quantities_info(bom_line.product_id, bom_line.uom_id, product_info, parent_bom=parent_bom, parent_product=parent_product)
            if quantities_info.get('subcontracting_loc'):
                res['subcontract_free_qty'] = quantities_info.get('subcontract_free_qty', 0)
                res['subcontract_qty_on_hand'] = quantities_info.get('subcontract_qty_on_hand', 0)
                if res.get('route_name') and bom_line.product_id.is_storable:
                    combined_qty = res['free_to_manufacture_qty'] + res['subcontract_free_qty']
                    missing_qty = max(line_quantity - combined_qty, 0)
                    if missing_qty:
                        res['status'] = self.env._("%(qty)s To %(route)s", qty=self._format_number_display(missing_qty), route=res['route_name'])
                        res['availability_state'] = 'unavailable'
                    else:
                        res['status'] = self._format_date_display('available', 0)
                        res['availability_state'] = 'available'
                        res['availability_delay'] = 0
        return res

    def _get_bom_array_lines(self, data, level, unfolded_ids, unfolded, parent_unfolded=True):
        lines = super()._get_bom_array_lines(data, level, unfolded_ids, unfolded, parent_unfolded)
        component_map = {comp['name']: comp for comp in data.get('components')}
        for line in lines:
            comp = component_map.get(line.get('name'))
            if comp and comp.get('subcontract_free_qty') is not None:
                line['subcontract_free_qty'] = comp.get('subcontract_free_qty', 0)
                line['subcontract_qty_on_hand'] = comp.get('subcontract_qty_on_hand', 0)

        if data.get('subcontracting'):
            subcontract_info = data['subcontracting']
            lines.append({
                'name': _("Subcontracting: %s", subcontract_info['name']),
                'type': 'subcontract',
                'uom': False,
                'quantity': subcontract_info['quantity'],
                'bom_cost': subcontract_info['bom_cost'],
                'level': subcontract_info['level'],
                'visible': level == 1 or unfolded or parent_unfolded
            })
        return lines

    @api.model
    def _need_special_rules(self, product_info, parent_bom=False, parent_product=False):
        if parent_bom and parent_product:
            parent_info = product_info.get(parent_product.id, {}).get(parent_bom.id, {})
            return parent_info and parent_info.get('route_type') == 'subcontract'
        return super()._need_special_rules(product_info, parent_bom, parent_product)

    @api.model
    def _find_special_rules(self, product, product_info, current_bom=False, parent_bom=False, parent_product=False):
        res = super()._find_special_rules(product, product_info, current_bom, parent_bom, parent_product)
        if not parent_bom or not parent_product:
            return res
        # If no rules could be found within the warehouse, check if the product is a component from a subcontracted product.
        parent_info = product_info.get(parent_product.id, {}).get(parent_bom.id, {})
        if parent_info and parent_info.get('route_type') == 'subcontract':
            # Since the product is subcontracted, check the subcontracted location for rules instead of the warehouse.
            subcontracting_loc = parent_info['subcontractor'].property_stock_subcontractor
            found_rules = product._get_rules_from_location(subcontracting_loc)
            if found_rules and self._is_resupply_rules(found_rules, current_bom):
                # We only want to show the effective resupply (i.e. a form of manufacture or buy)
                return found_rules
        return res

    @api.model
    def _format_route_info(self, rules, rules_delay, warehouse, product, bom, quantity):
        res = super()._format_route_info(rules, rules_delay, warehouse, product, bom, quantity)
        subcontract_rules = [rule for rule in rules if rule.action == 'buy' and bom and bom.type == 'subcontract']
        if subcontract_rules:
            seller_info = product._select_seller(quantity=quantity, uom_id=product.uom_id, params={'subcontractor_ids': self._get_subcontractors(bom)})
            if not seller_info:
                # If no vendor found for the right quantity, we still want to display a vendor for the lead times
                seller_info = product._select_seller(quantity=None, uom_id=product.uom_id, params={'subcontractor_ids': self._get_subcontractors(bom)})
            # for subcontracting, we can't decide the lead time without component's resupply availability
            # we only return necessary info and calculate the lead time late when we have component's data
            # A subcontractor selected in the overview is kept even without vendor pricelist.
            subcontractor = seller_info['partner_id'] if seller_info else self._get_selected_subcontractor(bom)
            if subcontractor:
                return {
                    'route_type': 'subcontract',
                    'route_name': subcontract_rules[0].route_id.display_name,
                    'route_detail': subcontractor.display_name,
                    'lead_time': rules_delay,
                    'supplier': seller_info['supplierinfo'] if seller_info else self.env['product.supplierinfo'],
                    'subcontractor': subcontractor,
                    'qty_checked': quantity,
                    'bom': bom,
                }

        return res

    @api.model
    def _get_quantities_info(self, product, bom_uom, product_info, bom=False, parent_bom=False, parent_product=False):
        quantities_info = super()._get_quantities_info(product, bom_uom, product_info, bom, parent_bom, parent_product)
        is_parent_subcontract = parent_bom and parent_bom.type == 'subcontract'
        if ((bom and bom.type == 'subcontract') or is_parent_subcontract) and product.is_storable:
            if is_parent_subcontract:
                route_info = product_info.get(parent_product.id, {}).get(parent_bom.id, {})
            else:
                route_info = (product_info or {}).get(product.id, {}).get(bom.id, {})
            subcontracting_loc = (
                route_info['subcontractor'].property_stock_subcontractor
                if route_info.get('route_type') == 'subcontract'
                else self.env['stock.warehouse'].browse(self.env.context.get('warehouse_id'))._get_subcontracting_location()
            )
            subloc_product = product.with_context(location=subcontracting_loc.id, warehouse_id=False)
            subloc_product.fetch(['free_qty', 'qty_available', 'virtual_available'])
            stock_loc = f"subcontract_{subcontracting_loc.id}"
            if product_info and not product_info[product.id]['consumptions'].get(stock_loc, False):
                product_info[product.id]['consumptions'][stock_loc] = 0
            quantities_info['subcontract_free_qty'] = max(product.uom_id._compute_quantity(subloc_product.free_qty, bom_uom), 0)
            quantities_info['subcontract_qty_on_hand'] = product.uom_id._compute_quantity(subloc_product.qty_available, bom_uom)
            quantities_info['stock_loc'] = quantities_info['subcontracting_loc'] = stock_loc
            quantities_info['forecasted_qty'] = subloc_product.virtual_available
        return quantities_info

    @api.model
    def _get_resupply_availability(self, route_info, components):
        resupply_state, resupply_delay = super()._get_resupply_availability(route_info, components)
        if route_info.get('route_type') == 'subcontract':
            max_component_delay = self._get_max_component_delay(components)
            if max_component_delay is False:
                return ('unavailable', False)
            # Calculate the lead time for subcontracting, keep same as `_get_lead_days`
            vendor_lead_time = route_info['supplier'].delay
            manufacture_lead_time = route_info['bom'].produce_delay
            subcontract_delay = resupply_delay if resupply_delay else 0
            subcontract_delay += max(vendor_lead_time, manufacture_lead_time) + max_component_delay
            route_info['manufacture_delay'] = route_info['lead_time'] + max(vendor_lead_time, manufacture_lead_time)
            route_info['lead_time'] += max(vendor_lead_time, manufacture_lead_time + route_info['bom'].days_to_prepare_mo)
            return ('estimated', subcontract_delay)
        return (resupply_state, resupply_delay)
