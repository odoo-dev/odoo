from collections import defaultdict

from odoo import fields, models


class StockOrderpoint(models.Model):
    _inherit = 'stock.warehouse.orderpoint'

    def _get_lead_days_values(self):
        values = super()._get_lead_days_values()
        seller_cache = self.env.context.get('_seller_cache', {})
        if self.id in seller_cache:
            # Propagate the result of _select_seller cached in _compute_lead_days
            # so _get_lead_days does not call _select_seller a second time
            values['supplierinfo'] = self.env['product.supplierinfo'].browse(seller_cache[self.id])
        return values

    def _compute_lead_days(self):
        orderpoints = self.filtered(lambda op: op.product_id and op.location_id)
        if not orderpoints:
            return super()._compute_lead_days()

        subcont_boms = {}
        seller_cache = {}
        products = orderpoints.product_id
        MrpBom = self.env['mrp.bom'].sudo().with_context(company_id=False)
        domain = MrpBom._bom_find_domain(products, bom_type='subcontract')
        all_boms = MrpBom.search(domain, order='sequence, product_id, id')

        bom_by_product_id = {}
        bom_by_tmpl_id = defaultdict(list)
        for bom in all_boms:
            if bom.product_id:
                if bom.product_id.id not in bom_by_product_id:
                    bom_by_product_id[bom.product_id.id] = bom.id
            else:
                bom_by_tmpl_id[bom.product_tmpl_id.id].append(bom.id)

        # Prefetch seller_ids for _select_seller
        orderpoints.product_id.fetch(['seller_ids'])
        for orderpoint in orderpoints:
            buy_rule = orderpoint.rule_ids.filtered(lambda r: r.action == 'buy')
            if not buy_rule:
                continue

            # Retrieve the supplier and cache it to avoid computing it again later
            if orderpoint.supplier_id:
                seller = orderpoint.supplier_id
            else:
                seller = orderpoint.product_id.with_company(buy_rule.company_id)._select_seller(quantity=None)
            if not seller:
                continue
            seller_cache[orderpoint.id] = seller.id
            seller = seller[0]
            product = orderpoint.product_id
            company_id = buy_rule.picking_type_id.company_id.id
            subcont_partner = seller.partner_id

            # Retrieve all the ancestors of the seller
            ancestor_ids = {subcont_partner.id}
            partner = subcont_partner
            while partner.parent_id:
                ancestor_ids.add(partner.parent_id.id)
                partner = partner.parent_id

            # Replace calls to _bom_subcontract_find calls to one using the BoM in cache
            bom = MrpBom.browse(bom_by_product_id.get(product.id, []))
            if bom:
                # Product-level BoM found
                if (bom.company_id and bom.company_id.id != company_id) \
                   or not any(sub.id in ancestor_ids for sub in bom.subcontractor_ids):
                    bom = MrpBom  # reset to empty recordset
            if not bom:
                # No matching product-level BOM. Fall back to template-level BOMs.
                for candidate in MrpBom.browse(bom_by_tmpl_id.get(product.product_tmpl_id.id, [])):
                    if candidate.company_id and candidate.company_id.id != company_id:
                        continue
                    if not any(sub.id in ancestor_ids for sub in candidate.subcontractor_ids):
                        continue
                    bom = candidate
                    break

            key = (product.id, company_id, subcont_partner.id)
            subcont_boms[key] = bom.id if bom else 0

        return super(StockOrderpoint, self.with_context(
            subcont_boms=subcont_boms,
            _seller_cache=seller_cache,
        ))._compute_lead_days()
