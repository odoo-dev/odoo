# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import re
from xml.etree import ElementTree as ET

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import float_repr

from odoo.addons.l10n_pt_certification.const import PT_CERTIFICATION_NUMBER
from odoo.addons.l10n_pt_certification.models.account_move import AT_SERIES_TYPE_SAFT_TYPE_MAP
from odoo.addons.l10n_pt_certification.models.account_tax import L10N_PT_TAX_EXEMPTIONS

PT_PRODUCT_COMPANY_TAX_ID = '510825442'


class L10nPtSaftExportWizard(models.TransientModel):
    _name = "l10n_pt.saft.export.wizard"
    _description = "Export Portuguese SAF-T (PT) v1.04_01 Audit File"

    company_id = fields.Many2one(
        'res.company',
        string="Company",
        required=True,
        default=lambda self: self.env.company,
    )
    date_from = fields.Date(
        string="Start Date",
        required=True,
        default=lambda self: fields.Date.today().replace(day=1),
    )
    date_to = fields.Date(
        string="End Date",
        required=True,
        default=fields.Date.today,
    )
    type = fields.Selection(
        [
            ('F', 'Billing (Faturação)'),
            ('C', 'Accounting (Contabilidade)'),
            ('I', 'Integrated (Integrado)'),
        ],
        string="Tax Accounting Basis",
        required=True,
        default='F',
        help="Type of SAF-T (PT) file according to Portaria 302/2016",
    )
    export_file = fields.Binary(
        string="SAF-T File",
        readonly=True,
    )
    export_filename = fields.Char(
        string="File Name",
        readonly=True,
    )

    def action_export_saft(self):
        self.ensure_one()
        if self.date_from > self.date_to:
            raise UserError(_("Start Date cannot be greater than End Date."))

        company = self.company_id
        if company.account_fiscal_country_id.code != 'PT':
            raise UserError(_("The selected company is not Portuguese."))

        company_vat = re.sub(r'\D', '', company.vat or '')
        if not company_vat:
            raise UserError(_("The company does not have a valid Portuguese VAT number."))

        if not company.street or not company.city or not company.zip or not company.country_id:
            raise UserError(_("The company address is incomplete. Street, City, Zip, and Country are required for SAF-T export."))

        # Root AuditFile element
        audit_file = ET.Element('AuditFile', {
            'xmlns': 'urn:OECD:StandardAuditFile-Tax:PT_1.04_01',
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        })

        # -----------------------------------------------------------
        # 1. Header
        # -----------------------------------------------------------
        header = ET.SubElement(audit_file, 'Header')
        ET.SubElement(header, 'AuditFileVersion').text = '1.04_01'
        ET.SubElement(header, 'CompanyID').text = company.company_registry or company_vat
        ET.SubElement(header, 'TaxRegistrationNumber').text = company_vat
        ET.SubElement(header, 'TaxAccountingBasis').text = self.type
        ET.SubElement(header, 'CompanyName').text = company.name or 'Empresa'
        ET.SubElement(header, 'BusinessName').text = company.name or 'Empresa'

        company_address = ET.SubElement(header, 'CompanyAddress')
        ET.SubElement(company_address, 'AddressDetail').text = company.street
        ET.SubElement(company_address, 'City').text = company.city
        ET.SubElement(company_address, 'PostalCode').text = company.zip
        ET.SubElement(company_address, 'Country').text = company.country_id.code

        ET.SubElement(header, 'FiscalYear').text = str(self.date_to.year)
        ET.SubElement(header, 'StartDate').text = self.date_from.strftime('%Y-%m-%d')
        ET.SubElement(header, 'EndDate').text = self.date_to.strftime('%Y-%m-%d')
        ET.SubElement(header, 'CurrencyCode').text = 'EUR'
        ET.SubElement(header, 'DateCreated').text = fields.Date.today().strftime('%Y-%m-%d')
        ET.SubElement(header, 'TaxEntity').text = 'Global'
        ET.SubElement(header, 'ProductCompanyTaxID').text = PT_PRODUCT_COMPANY_TAX_ID
        ET.SubElement(header, 'SoftwareCertificateNumber').text = str(PT_CERTIFICATION_NUMBER)
        ET.SubElement(header, 'ProductID').text = 'Odoo/19.0'
        ET.SubElement(header, 'ProductVersion').text = '19.0'
        ET.SubElement(header, 'HeaderComment').text = 'Ficheiro de Auditoria SAF-T (PT) v1.04_01 gerado por Odoo'

        # Fetch relevant posted/cancelled invoices in period
        invoices = self.env['account.move'].search([
            ('company_id', '=', company.id),
            ('move_type', 'in', ('out_invoice', 'out_refund', 'out_receipt')),
            ('state', 'in', ('posted', 'cancel')),
            ('l10n_pt_document_number', '!=', False),
            ('invoice_date', '>=', self.date_from),
            ('invoice_date', '<=', self.date_to),
        ], order='invoice_date, sequence_number, id')

        sale_orders = self.env['sale.order']
        if 'sale.order' in self.env:
            sale_orders = self.env['sale.order'].search([
                ('company_id', '=', company.id),
                ('l10n_pt_document_number', '!=', False),
                ('date_order', '>=', fields.Datetime.to_datetime(self.date_from)),
                ('date_order', '<=', fields.Datetime.to_datetime(self.date_to).replace(hour=23, minute=59, second=59)),
            ], order='date_order, id')

        pickings = self.env['stock.picking']
        if 'stock.picking' in self.env:
            pickings = self.env['stock.picking'].search([
                ('company_id', '=', company.id),
                ('l10n_pt_document_number', '!=', False),
                ('date_done', '>=', fields.Datetime.to_datetime(self.date_from)),
                ('date_done', '<=', fields.Datetime.to_datetime(self.date_to).replace(hour=23, minute=59, second=59)),
            ], order='date_done, id')

        # Collect unique customers, products, and taxes across all models
        partners = (
            invoices.mapped('partner_id')
            | sale_orders.mapped('partner_id')
            | pickings.mapped('partner_id')
        ).filtered(lambda p: p)

        has_anonymous_customer = (
            any(not m.partner_id for m in invoices)
            or any(not so.partner_id for so in sale_orders)
            or any(not p.partner_id for p in pickings)
        )

        # Validate partner addresses upfront
        missing_address_partners = []
        for partner in partners:
            missing = []
            if not partner.street:
                missing.append('Street')
            if not partner.city:
                missing.append('City')
            if not partner.zip:
                missing.append('Postal Code')
            if not partner.country_id:
                missing.append('Country')
            if missing:
                missing_address_partners.append(f"{partner.display_name} (missing: {', '.join(missing)})")
        if missing_address_partners:
            raise UserError(_(
                "Cannot generate SAF-T: The following partners have incomplete addresses:\n%s\n"
                "Please update their addresses before exporting.",
                '\n'.join(missing_address_partners)
            ))

        invoice_lines = invoices.mapped('invoice_line_ids').filtered(lambda l: l.display_type in ('product', False))
        so_lines = sale_orders.mapped('order_line').filtered(lambda l: not l.display_type)
        products = (
            invoice_lines.mapped('product_id')
            | so_lines.mapped('product_id')
            | pickings.mapped('move_ids.product_id')
        ).filtered(lambda p: p)

        has_generic_product = (
            any(not l.product_id for l in invoice_lines)
            or any(not l.product_id for l in so_lines)
        )

        all_taxes = (
            invoice_lines.mapped('tax_ids')
            | (so_lines.mapped('tax_ids') if so_lines else self.env['account.tax'])
        ).filtered(lambda t: t and (not t.tax_group_id or t.tax_group_id.l10n_pt_tax_category or t.amount == 0.0))

        # -----------------------------------------------------------
        # 2. MasterFiles
        # -----------------------------------------------------------
        master_files = ET.SubElement(audit_file, 'MasterFiles')

        def _get_partner_tax_id(partner):
            if not partner or not partner.vat:
                return '999999990'
            raw_vat = partner.vat.strip().replace(' ', '').upper()
            if raw_vat.startswith('PT'):
                return re.sub(r'\D', '', raw_vat[2:])
            if partner.country_id and partner.country_id.code == 'PT':
                return re.sub(r'\D', '', raw_vat)
            return raw_vat

        # 2.1 Customers
        for partner in partners:
            customer = ET.SubElement(master_files, 'Customer')
            ET.SubElement(customer, 'CustomerID').text = str(partner.id)
            ET.SubElement(customer, 'AccountID').text = 'Desconhecido'
            ET.SubElement(customer, 'CustomerTaxID').text = _get_partner_tax_id(partner)
            ET.SubElement(customer, 'CompanyName').text = partner.name or 'Consumidor Final'

            billing_addr = ET.SubElement(customer, 'BillingAddress')
            ET.SubElement(billing_addr, 'AddressDetail').text = partner.street
            ET.SubElement(billing_addr, 'City').text = partner.city
            ET.SubElement(billing_addr, 'PostalCode').text = partner.zip
            ET.SubElement(billing_addr, 'Country').text = partner.country_id.code

            ET.SubElement(customer, 'SelfBillingIndicator').text = '0'

        if has_anonymous_customer:
            customer = ET.SubElement(master_files, 'Customer')
            ET.SubElement(customer, 'CustomerID').text = 'CF'
            ET.SubElement(customer, 'AccountID').text = 'Desconhecido'
            ET.SubElement(customer, 'CustomerTaxID').text = '999999990'
            ET.SubElement(customer, 'CompanyName').text = 'Consumidor Final'

            billing_addr = ET.SubElement(customer, 'BillingAddress')
            ET.SubElement(billing_addr, 'AddressDetail').text = 'Desconhecido'
            ET.SubElement(billing_addr, 'City').text = 'Desconhecido'
            ET.SubElement(billing_addr, 'PostalCode').text = '0000-000'
            ET.SubElement(billing_addr, 'Country').text = 'PT'

            ET.SubElement(customer, 'SelfBillingIndicator').text = '0'

        # 2.2 Products (Enforce unique ProductCode)
        product_code_map = {}
        seen_codes = set()
        for product in products:
            base_code = (product.default_code or f"PROD_{product.id}").strip()
            code = base_code
            if code in seen_codes:
                code = f"{base_code}_{product.id}"
            seen_codes.add(code)
            product_code_map[product.id] = code

            prod_elem = ET.SubElement(master_files, 'Product')
            ET.SubElement(prod_elem, 'ProductType').text = 'S' if product.type == 'service' else 'P'
            ET.SubElement(prod_elem, 'ProductCode').text = code
            desc = (product.name or 'Produto')[:200]
            ET.SubElement(prod_elem, 'ProductDescription').text = desc
            ET.SubElement(prod_elem, 'ProductNumberCode').text = (product.barcode or code)[:60]

        if has_generic_product:
            prod_elem = ET.SubElement(master_files, 'Product')
            ET.SubElement(prod_elem, 'ProductType').text = 'S'
            ET.SubElement(prod_elem, 'ProductCode').text = 'GEN'
            ET.SubElement(prod_elem, 'ProductDescription').text = 'Artigo Genérico'
            ET.SubElement(prod_elem, 'ProductNumberCode').text = 'GEN'

        def _get_tax_region(tax_rec):
            region = tax_rec.tax_group_id.l10n_pt_tax_region if tax_rec and tax_rec.tax_group_id else False
            if region in ('PT', 'PT-AC', 'PT-MA'):
                return region
            comp_region = company.l10n_pt_region_code
            if comp_region in ('PT', 'PT-AC', 'PT-MA'):
                return comp_region
            return 'PT'

        # 2.3 TaxTable (de-duplicated by TaxType, TaxCountryRegion, TaxCode)
        tax_table = ET.SubElement(master_files, 'TaxTable')
        seen_tax_keys = set()
        for tax in all_taxes:
            tax_type = 'IVA'
            tax_region = _get_tax_region(tax)
            tax_code = tax.tax_group_id.l10n_pt_tax_category or ('ISE' if tax.amount == 0.0 else 'NOR')
            key = (tax_type, tax_region, tax_code)
            if key in seen_tax_keys:
                continue
            seen_tax_keys.add(key)
            entry = ET.SubElement(tax_table, 'TaxTableEntry')
            ET.SubElement(entry, 'TaxType').text = tax_type
            ET.SubElement(entry, 'TaxCountryRegion').text = tax_region
            ET.SubElement(entry, 'TaxCode').text = tax_code
            ET.SubElement(entry, 'Description').text = (tax.name or 'IVA')[:256]
            ET.SubElement(entry, 'TaxPercentage').text = float_repr(tax.amount, 2)

        has_zero_tax = (
            any((not l.tax_ids or any(t.amount == 0.0 for t in l.tax_ids)) for l in invoice_lines)
            or any((not l.tax_ids or any(t.amount == 0.0 for t in l.tax_ids)) for l in so_lines)
        )
        default_region = _get_tax_region(False)
        if has_zero_tax and ('IVA', default_region, 'ISE') not in seen_tax_keys:
            entry = ET.SubElement(tax_table, 'TaxTableEntry')
            ET.SubElement(entry, 'TaxType').text = 'IVA'
            ET.SubElement(entry, 'TaxCountryRegion').text = default_region
            ET.SubElement(entry, 'TaxCode').text = 'ISE'
            ET.SubElement(entry, 'Description').text = 'Isento de IVA'
            ET.SubElement(entry, 'TaxPercentage').text = '0.00'
            seen_tax_keys.add(('IVA', default_region, 'ISE'))

        # -----------------------------------------------------------
        # 3. SourceDocuments
        # -----------------------------------------------------------
        source_docs = ET.SubElement(audit_file, 'SourceDocuments')

        # 3.1 SalesInvoices
        sales_invoices = ET.SubElement(source_docs, 'SalesInvoices')
        ET.SubElement(sales_invoices, 'NumberOfEntries').text = str(len(invoices))

        # Cancelled invoices (status 'A') must be excluded from TotalDebit and TotalCredit per Portaria 302/2016
        active_invoices = [m for m in invoices if m.state != 'cancel']
        total_debit = sum(abs(m.amount_untaxed_signed) for m in active_invoices if m.move_type == 'out_refund')
        total_credit = sum(abs(m.amount_untaxed_signed) for m in active_invoices if m.move_type != 'out_refund')
        ET.SubElement(sales_invoices, 'TotalDebit').text = float_repr(total_debit, 2)
        ET.SubElement(sales_invoices, 'TotalCredit').text = float_repr(total_credit, 2)

        for move in invoices:
            inv_elem = ET.SubElement(sales_invoices, 'Invoice')
            ET.SubElement(inv_elem, 'InvoiceNo').text = move.l10n_pt_document_number
            ET.SubElement(inv_elem, 'ATCUD').text = move.l10n_pt_atcud or '0'

            status = ET.SubElement(inv_elem, 'DocumentStatus')
            ET.SubElement(status, 'InvoiceStatus').text = 'A' if move.state == 'cancel' else 'N'
            status_date = move.write_date or move.create_date or fields.Datetime.now()
            ET.SubElement(status, 'InvoiceStatusDate').text = status_date.strftime('%Y-%m-%dT%H:%M:%S')
            ET.SubElement(status, 'SourceID').text = str(move.create_uid.id or 1)
            ET.SubElement(status, 'SourceBilling').text = 'P'

            hash_raw = getattr(move, 'inalterable_hash', False) or getattr(move, 'l10n_pt_inalterable_hash', False) or '0'
            if hash_raw and '$' in hash_raw:
                parts = hash_raw.split('$')
                hash_val = parts[2] if len(parts) >= 3 else hash_raw
                hash_control = parts[1] if len(parts) >= 3 else '1'
            else:
                hash_val = hash_raw
                hash_control = '1'
            ET.SubElement(inv_elem, 'Hash').text = hash_val
            ET.SubElement(inv_elem, 'HashControl').text = hash_control
            ET.SubElement(inv_elem, 'Period').text = str(move.invoice_date.month)
            ET.SubElement(inv_elem, 'InvoiceDate').text = move.invoice_date.strftime('%Y-%m-%d')
            doc_type = AT_SERIES_TYPE_SAFT_TYPE_MAP.get(move.l10n_pt_document_type, 'FT')
            ET.SubElement(inv_elem, 'InvoiceType').text = doc_type

            special_regimes = ET.SubElement(inv_elem, 'SpecialRegimes')
            ET.SubElement(special_regimes, 'SelfBillingIndicator').text = '0'
            ET.SubElement(special_regimes, 'CashVATSchemeIndicator').text = '0'
            ET.SubElement(special_regimes, 'ThirdPartiesBillingIndicator').text = '0'

            ET.SubElement(inv_elem, 'SourceID').text = str(move.create_uid.id or 1)
            entry_date = move.l10n_pt_hashed_on or move.create_date or fields.Datetime.now()
            ET.SubElement(inv_elem, 'SystemEntryDate').text = entry_date.strftime('%Y-%m-%dT%H:%M:%S')
            ET.SubElement(inv_elem, 'CustomerID').text = str(move.partner_id.id if move.partner_id else 'CF')

            line_idx = 1
            for line in move.invoice_line_ids.filtered(lambda l: l.display_type in ('product', False)):
                line_elem = ET.SubElement(inv_elem, 'Line')
                ET.SubElement(line_elem, 'LineNumber').text = str(line_idx)
                line_idx += 1
                prod_code = product_code_map.get(line.product_id.id, 'GEN') if line.product_id else 'GEN'
                line_desc = (line.name or 'Produto')[:200]
                ET.SubElement(line_elem, 'ProductCode').text = prod_code
                ET.SubElement(line_elem, 'ProductDescription').text = line_desc
                ET.SubElement(line_elem, 'Quantity').text = float_repr(abs(line.quantity), 2)
                uom_name = (line.product_uom_id.name or 'Unidade')[:20] if line.product_uom_id else 'Unidade'
                ET.SubElement(line_elem, 'UnitOfMeasure').text = uom_name
                ET.SubElement(line_elem, 'UnitPrice').text = float_repr(abs(line.price_unit), 4)
                ET.SubElement(line_elem, 'TaxPointDate').text = move.invoice_date.strftime('%Y-%m-%d')

                if move.move_type == 'out_refund':
                    ref_elem = ET.SubElement(line_elem, 'References')
                    orig_ref = (
                        move.reversed_entry_id.l10n_pt_document_number
                        or move.reversed_entry_id.name
                        or move.ref
                        or 'N/A'
                    )
                    ET.SubElement(ref_elem, 'Reference').text = orig_ref[:60]
                    reason_str = move.ref or line.name or 'Anulação/Retificação'
                    ET.SubElement(ref_elem, 'Reason').text = reason_str[:50]

                ET.SubElement(line_elem, 'Description').text = line_desc

                amount_subtotal = abs(line.price_subtotal)
                if move.move_type == 'out_refund':
                    ET.SubElement(line_elem, 'DebitAmount').text = float_repr(amount_subtotal, 2)
                else:
                    ET.SubElement(line_elem, 'CreditAmount').text = float_repr(amount_subtotal, 2)

                tax = line.tax_ids[:1]
                tax_elem = ET.SubElement(line_elem, 'Tax')
                tax_elem_type = ET.SubElement(tax_elem, 'TaxType')
                tax_elem_type.text = 'IVA'
                ET.SubElement(tax_elem, 'TaxCountryRegion').text = _get_tax_region(tax)
                tax_code = (tax.tax_group_id.l10n_pt_tax_category if tax and tax.tax_group_id.l10n_pt_tax_category else ('ISE' if (not tax or tax.amount == 0.0) else 'NOR'))
                ET.SubElement(tax_elem, 'TaxCode').text = tax_code
                ET.SubElement(tax_elem, 'TaxPercentage').text = float_repr(tax.amount, 2) if tax else '0.00'

                if not tax or tax.amount == 0.0:
                    ex_code = (tax.l10n_pt_tax_exemption_reason if tax else False) or 'M99'
                    mention, _legal = L10N_PT_TAX_EXEMPTIONS.get(ex_code, ('Não sujeito ou não tributado', ''))
                    ET.SubElement(line_elem, 'TaxExemptionReason').text = mention[:60]
                    ET.SubElement(line_elem, 'TaxExemptionCode').text = ex_code

                ET.SubElement(line_elem, 'SettlementAmount').text = '0.00'

            totals = ET.SubElement(inv_elem, 'DocumentTotals')
            ET.SubElement(totals, 'TaxPayable').text = float_repr(abs(move.amount_tax_signed), 2)
            ET.SubElement(totals, 'NetTotal').text = float_repr(abs(move.amount_untaxed_signed), 2)
            ET.SubElement(totals, 'GrossTotal').text = float_repr(abs(move.amount_total_signed), 2)

        # 3.2 MovementOfGoods (if l10n_pt_stock installed and pickings exist)
        if 'stock.picking' in self.env and pickings:
            mg_elem = ET.SubElement(source_docs, 'MovementOfGoods')
            total_movement_lines = sum(len(p.move_ids) for p in pickings)
            total_qty_issued = sum(sum(m.quantity for m in p.move_ids) for p in pickings)
            ET.SubElement(mg_elem, 'NumberOfMovementLines').text = str(total_movement_lines)
            ET.SubElement(mg_elem, 'TotalQuantityIssued').text = float_repr(total_qty_issued, 2)

            for pick in pickings:
                sm_elem = ET.SubElement(mg_elem, 'StockMovement')
                ET.SubElement(sm_elem, 'DocumentNumber').text = pick.l10n_pt_document_number
                ET.SubElement(sm_elem, 'ATCUD').text = pick.l10n_pt_atcud or '0'

                m_status = ET.SubElement(sm_elem, 'DocumentStatus')
                ET.SubElement(m_status, 'MovementStatus').text = 'A' if pick.state == 'cancel' else 'N'
                m_date = pick.write_date or pick.create_date or fields.Datetime.now()
                ET.SubElement(m_status, 'MovementStatusDate').text = m_date.strftime('%Y-%m-%dT%H:%M:%S')
                ET.SubElement(m_status, 'SourceID').text = str(pick.create_uid.id or 1)
                ET.SubElement(m_status, 'SourceBilling').text = 'P'

                hash_raw = getattr(pick, 'l10n_pt_inalterable_hash', False) or '0'
                if hash_raw and '$' in hash_raw:
                    parts = hash_raw.split('$')
                    hash_val = parts[2] if len(parts) >= 3 else hash_raw
                    hash_control = parts[1] if len(parts) >= 3 else '1'
                else:
                    hash_val = hash_raw
                    hash_control = '1'
                ET.SubElement(sm_elem, 'Hash').text = hash_val
                ET.SubElement(sm_elem, 'HashControl').text = hash_control
                doc_date = pick._l10n_pt_get_document_date()
                ET.SubElement(sm_elem, 'Period').text = str(doc_date.month)
                ET.SubElement(sm_elem, 'MovementDate').text = doc_date.strftime('%Y-%m-%d')
                ET.SubElement(sm_elem, 'MovementType').text = pick._l10n_pt_get_saft_doc_type() or 'GT'
                ET.SubElement(sm_elem, 'SystemEntryDate').text = (pick.l10n_pt_hashed_on or pick.create_date or fields.Datetime.now()).strftime('%Y-%m-%dT%H:%M:%S')
                ET.SubElement(sm_elem, 'CustomerID').text = str(pick.partner_id.id if pick.partner_id else 'CF')
                ET.SubElement(sm_elem, 'SourceID').text = str(pick.create_uid.id or 1)

                transport_dt = pick.l10n_pt_start_transport_date or fields.Datetime.now()
                ET.SubElement(sm_elem, 'MovementEndTime').text = transport_dt.strftime('%Y-%m-%dT%H:%M:%S')
                ET.SubElement(sm_elem, 'MovementStartTime').text = transport_dt.strftime('%Y-%m-%dT%H:%M:%S')

                at_doc_code = getattr(pick, 'l10n_pt_at_doc_code', False) or getattr(pick, 'l10n_pt_at_doc_code_id', False)
                if at_doc_code:
                    ET.SubElement(sm_elem, 'ATDocCodeID').text = at_doc_code

                m_line_idx = 1
                for sm in pick.move_ids:
                    ml_elem = ET.SubElement(sm_elem, 'Line')
                    ET.SubElement(ml_elem, 'LineNumber').text = str(m_line_idx)
                    m_line_idx += 1
                    ml_code = product_code_map.get(sm.product_id.id, 'GEN') if sm.product_id else 'GEN'
                    ET.SubElement(ml_elem, 'ProductCode').text = ml_code
                    move_desc = getattr(sm, 'description_picking', None) or getattr(sm, 'name', None) or (sm.product_id.name if sm.product_id else 'Produto')
                    prod_desc = (sm.product_id.name if sm.product_id else move_desc) or 'Artigo Genérico'
                    ET.SubElement(ml_elem, 'ProductDescription').text = prod_desc[:200]
                    ET.SubElement(ml_elem, 'Quantity').text = float_repr(abs(sm.quantity), 2)
                    uom = getattr(sm, 'product_uom', None) or getattr(sm, 'product_uom_id', None)
                    uom_name = (uom.name or 'Unidade')[:20] if uom else 'Unidade'
                    ET.SubElement(ml_elem, 'UnitOfMeasure').text = uom_name
                    ET.SubElement(ml_elem, 'UnitPrice').text = '0.0000'
                    ET.SubElement(ml_elem, 'Description').text = (move_desc or 'Produto')[:200]
                    ET.SubElement(ml_elem, 'CreditAmount').text = '0.00'

                sm_totals = ET.SubElement(sm_elem, 'DocumentTotals')
                ET.SubElement(sm_totals, 'TaxPayable').text = '0.00'
                ET.SubElement(sm_totals, 'NetTotal').text = '0.00'
                ET.SubElement(sm_totals, 'GrossTotal').text = '0.00'

        # 3.3 WorkingDocuments (if l10n_pt_sale installed and orders exist)
        if 'sale.order' in self.env and sale_orders:
            wd_elem = ET.SubElement(source_docs, 'WorkingDocuments')
            ET.SubElement(wd_elem, 'NumberOfEntries').text = str(len(sale_orders))
            ET.SubElement(wd_elem, 'TotalDebit').text = '0.00'
            wd_total_credit = sum(so.amount_untaxed for so in sale_orders if so.state != 'cancel')
            ET.SubElement(wd_elem, 'TotalCredit').text = float_repr(wd_total_credit, 2)

            for so in sale_orders:
                work_elem = ET.SubElement(wd_elem, 'WorkDocument')
                ET.SubElement(work_elem, 'DocumentNumber').text = so.l10n_pt_document_number
                ET.SubElement(work_elem, 'ATCUD').text = so.l10n_pt_atcud or '0'

                w_status = ET.SubElement(work_elem, 'DocumentStatus')
                ET.SubElement(w_status, 'WorkStatus').text = 'A' if so.state == 'cancel' else 'N'
                w_date = so.write_date or so.create_date or fields.Datetime.now()
                ET.SubElement(w_status, 'WorkStatusDate').text = w_date.strftime('%Y-%m-%dT%H:%M:%S')
                ET.SubElement(w_status, 'SourceID').text = str(so.create_uid.id or 1)
                ET.SubElement(w_status, 'SourceBilling').text = 'P'

                hash_raw = getattr(so, 'l10n_pt_inalterable_hash', False) or '0'
                if hash_raw and '$' in hash_raw:
                    parts = hash_raw.split('$')
                    hash_val = parts[2] if len(parts) >= 3 else hash_raw
                    hash_control = parts[1] if len(parts) >= 3 else '1'
                else:
                    hash_val = hash_raw
                    hash_control = '1'
                ET.SubElement(work_elem, 'Hash').text = hash_val
                ET.SubElement(work_elem, 'HashControl').text = hash_control
                ET.SubElement(work_elem, 'Period').text = str(so.date_order.month)
                ET.SubElement(work_elem, 'WorkDate').text = so.date_order.strftime('%Y-%m-%d')
                ET.SubElement(work_elem, 'WorkType').text = 'OR' if so.l10n_pt_document_type == 'quotation' else 'NE'
                ET.SubElement(work_elem, 'SourceID').text = str(so.create_uid.id or 1)
                w_entry_date = so.l10n_pt_hashed_on or so.create_date or fields.Datetime.now()
                ET.SubElement(work_elem, 'SystemEntryDate').text = w_entry_date.strftime('%Y-%m-%dT%H:%M:%S')
                ET.SubElement(work_elem, 'CustomerID').text = str(so.partner_id.id if so.partner_id else 'CF')

                so_line_idx = 1
                for line in so.order_line.filtered(lambda l: not l.display_type):
                    l_elem = ET.SubElement(work_elem, 'Line')
                    ET.SubElement(l_elem, 'LineNumber').text = str(so_line_idx)
                    so_line_idx += 1
                    l_code = product_code_map.get(line.product_id.id, 'GEN') if line.product_id else 'GEN'
                    line_desc = (line.name or 'Produto')[:200]
                    ET.SubElement(l_elem, 'ProductCode').text = l_code
                    ET.SubElement(l_elem, 'ProductDescription').text = line_desc
                    ET.SubElement(l_elem, 'Quantity').text = float_repr(abs(line.product_uom_qty), 2)
                    uom = getattr(line, 'product_uom_id', None) or getattr(line, 'product_uom', None)
                    uom_name = (uom.name or 'Unidade')[:20] if uom else 'Unidade'
                    ET.SubElement(l_elem, 'UnitOfMeasure').text = uom_name
                    ET.SubElement(l_elem, 'UnitPrice').text = float_repr(abs(line.price_unit), 4)
                    ET.SubElement(l_elem, 'TaxPointDate').text = so.date_order.strftime('%Y-%m-%d')
                    ET.SubElement(l_elem, 'Description').text = line_desc
                    ET.SubElement(l_elem, 'CreditAmount').text = float_repr(abs(line.price_subtotal), 2)

                    tax = line.tax_ids[:1]
                    tax_elem = ET.SubElement(l_elem, 'Tax')
                    ET.SubElement(tax_elem, 'TaxType').text = 'IVA'
                    ET.SubElement(tax_elem, 'TaxCountryRegion').text = _get_tax_region(tax)
                    tax_code = (tax.tax_group_id.l10n_pt_tax_category if tax and tax.tax_group_id.l10n_pt_tax_category else ('ISE' if (not tax or tax.amount == 0.0) else 'NOR'))
                    ET.SubElement(tax_elem, 'TaxCode').text = tax_code
                    ET.SubElement(tax_elem, 'TaxPercentage').text = float_repr(tax.amount, 2) if tax else '0.00'

                    if not tax or tax.amount == 0.0:
                        ex_code = (tax.l10n_pt_tax_exemption_reason if tax else False) or 'M99'
                        mention, _legal = L10N_PT_TAX_EXEMPTIONS.get(ex_code, ('Não sujeito ou não tributado', ''))
                        ET.SubElement(l_elem, 'TaxExemptionReason').text = mention[:60]
                        ET.SubElement(l_elem, 'TaxExemptionCode').text = ex_code

                    ET.SubElement(l_elem, 'SettlementAmount').text = '0.00'

                w_totals = ET.SubElement(work_elem, 'DocumentTotals')
                ET.SubElement(w_totals, 'TaxPayable').text = float_repr(abs(so.amount_tax), 2)
                ET.SubElement(w_totals, 'NetTotal').text = float_repr(abs(so.amount_untaxed), 2)
                ET.SubElement(w_totals, 'GrossTotal').text = float_repr(abs(so.amount_total), 2)

        # Generate XML formatted string
        xml_declaration = b'<?xml version="1.0" encoding="UTF-8"?>\n'
        xml_content = xml_declaration + ET.tostring(audit_file, encoding='utf-8')

        filename = f"SAF-T_PT_{company_vat}_{self.date_from.strftime('%Y%m%d')}_{self.date_to.strftime('%Y%m%d')}.xml"
        self.write({
            'export_file': base64.b64encode(xml_content),
            'export_filename': filename,
        })

        return {
            'type': 'ir.actions.act_window',
            'res_model': 'l10n_pt.saft.export.wizard',
            'view_mode': 'form',
            'res_id': self.id,
            'target': 'new',
        }
