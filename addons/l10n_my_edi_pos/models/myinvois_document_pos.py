# Part of Odoo. See LICENSE file for full copyright and licensing details.
import math
from datetime import datetime

from dateutil.relativedelta import relativedelta
from pytz import UTC

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools import date_utils, float_repr, float_round

from odoo.addons.l10n_my_edi.models.account_edi_xml_ubl_my import E_164_REGEX


class MyInvoisDocumentPoS(models.Model):
    """
    Odoo's support for consolidated invoice is limited to PoS transactions (for now).
    For regular journal entries, they can easily be sent in batch to MyInvois without the need to group them into
    consolidated invoices.

    These consolidated invoices will be linked to PoS orders, with the purpose of sending them at once each
    month during the allowed timeframe.
    An order that has been invoiced separately must not be included in consolidated invoices.

    A single invoice line could represent multiple transactions as long as their numbering is continuous.

    Note that while the xml generation will be using custom python code, the template will be the same as for regular invoices.
    The API endpoints used will also be the same.
    """
    _inherit = 'myinvois.document'

    # ------------------
    # Fields declaration
    # ------------------

    pos_order_ids = fields.Many2many(
        name="Orders",
        comodel_name="pos.order",
        relation="myinvois_document_pos_order_rel",
        column1="document_id",
        column2="order_id",
        check_company=True,
    )
    pos_config_id = fields.Many2one(
        string="PoS Config",
        comodel_name="pos.config",
        readonly=True,
    )
    linked_order_count = fields.Integer(
        compute='_compute_linked_order_count',
    )
    pos_order_date_range = fields.Char(
        string="Date Range",
        compute='_compute_pos_order_date_range',
        store=True,
    )

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    def _compute_linked_order_count(self):
        for consolidated_invoice in self.filtered('pos_order_ids'):
            consolidated_invoice.linked_order_count = len(consolidated_invoice.pos_order_ids)

    @api.depends('pos_order_ids')
    def _compute_pos_order_date_range(self):
        for consolidated_invoice in self.filtered('pos_order_ids'):
            first_order = consolidated_invoice.pos_order_ids[-1]
            latest_order = consolidated_invoice.pos_order_ids[0]
            consolidated_invoice.pos_order_date_range = f"{first_order.date_order.date()} to {latest_order.date_order.date()}"

    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    def _get_starting_sequence(self):
        """ In the PoS, a document represents a Consolidated INVoice. """
        self.ensure_one()
        if not self.pos_order_ids:
            return super()._get_starting_sequence()

        return "CINV/%04d/00000" % self.myinvois_issuance_date.year

    # --------------
    # Action methods
    # --------------

    def action_view_linked_orders(self):
        """ Return the action used to open the order(s) linked to the selected consolidated invoice. """
        self.ensure_one()
        if self.linked_order_count == 1:
            action_vals = {
                'type': 'ir.actions.act_window',
                'res_model': 'pos.order',
                'view_mode': 'form',
                'res_id': self.pos_order_ids.id,
                'views': [(False, 'form')],
            }
        else:
            action_vals = {
                'name': _("Point of Sale Orders"),
                'type': 'ir.actions.act_window',
                'res_model': 'pos.order',
                'view_mode': 'list,form',
                'views': [(False, 'list'), (False, 'form')],
                'domain': [('id', 'in', self.pos_order_ids.ids)],
            }

        return action_vals

    def action_open_consolidate_invoice_wizard(self):
        """
        Open the wizard, and set a default date_from/date_to based on the current date as well as already existing
        consolidated invoices.
        """
        latest_consolidated_invoice = self.env['myinvois.document'].search([
            ('company_id', '=', self.env.company.id),
            ('myinvois_state', 'in', ['in_progress', 'valid']),
            ('pos_order_ids', '!=', False),
        ], limit=1)
        if latest_consolidated_invoice:
            default_date_from = latest_consolidated_invoice.myinvois_issuance_date + relativedelta(days=1)
        else:
            default_date_from = date_utils.start_of(fields.Date.context_today(self) - relativedelta(months=1), 'month')
        default_date_to = date_utils.end_of(default_date_from, 'month')

        return {
            'name': _('Create Consolidated Invoice'),
            'res_model': 'myinvois.consolidate.invoice.wizard',
            'view_mode': 'form',
            'views': [[False, 'form']],
            'target': 'new',
            'context': {
                'default_date_from': default_date_from,
                'default_date_to': default_date_to,
            },
            'type': 'ir.actions.act_window',
        }

    # ----------------
    # Business methods
    # ----------------

    @api.model
    def _separate_orders_in_lines(self, pos_order_ids):
        """
        Separate the orders in self into lines as represented in a consolidated invoice, taking care of splitting when
        needed.

        There is no requirement asking to split per sequence (and thus config), but we still do so to make it easier to
        submit per PoS if wanted.

        :param pos_order_ids: The orders to separate.
        :return: A list of pos_order record sets, with one record set representing what would go in one line in the xml.
        """
        lines_per_config = {}
        # We start by gathering the sessions involved in this process, and loop on their orders.
        sorted_order = pos_order_ids.sorted(reverse=True)
        all_orders_per_config = sorted_order.session_id.order_ids.sorted(reverse=True).grouped('config_id')
        # During the loop, we want to gather "lines".
        # One line can be comprised of any number of orders as long as they are continuous.
        continuous_orders = self.env['pos.order']
        for config, orders in all_orders_per_config.items():
            config_lines = []
            for order in orders:
                if continuous_orders and order not in pos_order_ids:
                    config_lines.append(continuous_orders)
                    continuous_orders = self.env['pos.order']
                elif order in pos_order_ids:
                    continuous_orders |= order

            # We should group by POS config, as this is where the sequence is expected to be continuous.
            if continuous_orders:
                config_lines.append(continuous_orders)
                continuous_orders = self.env['pos.order']
            lines_per_config[config] = config_lines

        return lines_per_config

    def _myinvois_export_document(self):
        """ Returns a dict with all the values required to build the consolidated invoice XML file. """
        self.ensure_one()

        # We ignore fully refunded orders and orders that are only refunds.
        # In both cases, has_refundable_lines will be False (already refunded OR negative qty)
        orders = self.pos_order_ids.filtered('has_refundable_lines')

        if not orders:
            return super()._myinvois_export_document()

        xml_vals = {}
        # Start by setting up the general vals (which template to use, ...) for our export.
        self._add_general_template_vals(xml_vals)
        # Add the supplier information to the xml_vals
        self._add_supplier_information(xml_vals)
        # Do the same thing with the customer. For consolidated invoice, the customer is a generic one.
        self._add_customer_information(xml_vals)
        # Add the general document information to the vals.
        self._add_general_document_information(xml_vals)
        # Small interlude, we parse the orders in self in order to build the tax information.
        # We need these for the last two parts, lines and taxes
        # And for that, we need to prepare the data of our lines
        self._build_xml_lines_information(orders, xml_vals)
        # Next we add the line vals, excluding tax computation
        self._add_line_information(xml_vals)
        # And we finish by computing the tax information and adding them where expected.
        self._add_totals_information(xml_vals)

        return xml_vals

    def _myinvois_export_document_constrains(self, xml_vals):
        """ Provides generic constrains that would apply to any documents """
        self.ensure_one()
        constrains = super()._myinvois_export_document_constrains(xml_vals)

        builder = xml_vals['builder']
        if not self.company_id.l10n_my_edi_industrial_classification:
            builder._l10n_my_edi_make_validation_error(constrains, 'industrial_classification_required', 'company', self.company_id.display_name)

        # Supplier Check
        supplier = xml_vals['supplier']
        phone_number = supplier.phone or supplier.mobile
        if phone_number != "NA":
            phone = builder._l10n_my_edi_get_formatted_phone_number(phone_number)
            if E_164_REGEX.match(phone) is None:
                builder._l10n_my_edi_make_validation_error(constrains, 'phone_number_format', 'supplier', supplier.display_name)
        elif not phone_number:
            builder._l10n_my_edi_make_validation_error(constrains, 'phone_number_required', 'supplier', supplier.display_name)

        if not supplier.commercial_partner_id.l10n_my_identification_type or not supplier.commercial_partner_id.l10n_my_identification_number:
            builder._l10n_my_edi_make_validation_error(constrains, 'required_id', 'supplier', supplier.commercial_partner_id.display_name)

        if not supplier.state_id:
            builder._l10n_my_edi_make_validation_error(constrains, 'no_state', 'supplier', supplier.display_name)
        if not supplier.city:
            builder._l10n_my_edi_make_validation_error(constrains, 'no_city', 'supplier', supplier.display_name)
        if not supplier.country_id:
            builder._l10n_my_edi_make_validation_error(constrains, 'no_country', 'supplier', supplier.display_name)
        if not supplier.street:
            builder._l10n_my_edi_make_validation_error(constrains, 'no_street', 'supplier', supplier.display_name)

        if supplier.commercial_partner_id.sst_registration_number and len(supplier.commercial_partner_id.sst_registration_number.split(';')) > 2:
            builder._l10n_my_edi_make_validation_error(constrains, 'too_many_sst', 'supplier', supplier.commercial_partner_id.display_name)

        # Line check (based on the vals)
        for line in xml_vals['vals']['line_vals']:
            item_vals = line['item_vals']
            if not item_vals['classified_tax_category_vals']:
                builder._l10n_my_edi_make_validation_error(constrains, 'tax_ids_required', line['id'], item_vals['name'])

            for classified_tax_category_val in item_vals['classified_tax_category_vals']:
                if classified_tax_category_val['tax_category_code'] == 'E' and not classified_tax_category_val['tax_exemption_reason']:
                    # We don't have a name here, so the % will have to do
                    builder._l10n_my_edi_make_validation_error(constrains, 'tax_exemption_required_on_tax', classified_tax_category_val['id'], None)

        return constrains

    def _add_general_template_vals(self, xml_vals):
        """
        Aggregate the general information required by the UBL template to build the consolidated invoice XML file.
        """
        xml_vals.update({
            'builder': self.env['account.edi.xml.ubl_myinvois_my'],
            'format_float': lambda amount, precision_digits: float_repr(float_round(amount, precision_digits), precision_digits) if amount is not None else None,
            'AddressType_template': 'l10n_my_edi.ubl_20_AddressType_my',
            'ContactType_template': 'account_edi_ubl_cii.ubl_20_ContactType',
            'PartyType_template': 'l10n_my_edi.ubl_20_PartyType_my',
            'PaymentMeansType_template': 'account_edi_ubl_cii.ubl_20_PaymentMeansType',
            'PaymentTermsType_template': 'account_edi_ubl_cii.ubl_20_PaymentTermsType',
            'TaxCategoryType_template': 'account_edi_ubl_cii.ubl_20_TaxCategoryType',
            'TaxTotalType_template': 'account_edi_ubl_cii.ubl_20_TaxTotalType',
            'AllowanceChargeType_template': 'account_edi_ubl_cii.ubl_20_AllowanceChargeType',
            'SignatureType_template': 'account_edi_ubl_cii.ubl_20_SignatureType',
            'ResponseType_template': 'account_edi_ubl_cii.ubl_20_ResponseType',
            'DeliveryType_template': 'l10n_my_edi.ubl_20_DeliveryType_my',
            'MonetaryTotalType_template': 'account_edi_ubl_cii.ubl_20_MonetaryTotalType',
            'InvoiceLineType_template': 'l10n_my_edi.ubl_20_InvoiceLineType_my',
            'CreditNoteLineType_template': 'l10n_my_edi.ubl_20_InvoiceLineType_my',
            'DebitNoteLineType_template': 'l10n_my_edi.ubl_20_InvoiceLineType_my',
            'InvoiceType_template': 'l10n_my_edi.ubl_21_InvoiceType_my',
            'CreditNoteType_template': 'l10n_my_edi.ubl_21_InvoiceType_my',
            'DebitNoteType_template': 'l10n_my_edi.ubl_21_InvoiceType_my',
            'main_template': 'account_edi_ubl_cii.ubl_20_Invoice',
            'vals': {},
        })

    def _add_supplier_information(self, xml_vals):
        """ Add the supplier information to the XML file. """
        supplier = self.company_id.partner_id.commercial_partner_id
        supplier_vals = xml_vals['builder']._get_partner_party_vals(supplier, role='supplier')
        supplier_vals.update({
            'industry_classification_code_attrs': {'name': self.company_id.l10n_my_edi_industrial_classification.name},
            'industry_classification_code': self.company_id.l10n_my_edi_industrial_classification.code,
        })

        xml_vals['supplier'] = supplier
        xml_vals['vals']['accounting_supplier_party_vals'] = {
            'party_vals': supplier_vals,
        }

    def _add_customer_information(self, xml_vals):
        """ Add the customer information to the XML file. """
        # Use a search and not a ref in case the user create their own partner/...
        general_public_partner = self.env["res.partner"].search(
            domain=[
                *self.env['res.partner']._check_company_domain(self.company_id),
                '|',
                ('vat', '=', 'EI00000000010'),
                ('l10n_my_edi_malaysian_tin', '=', 'EI00000000010'),
            ],
            limit=1,
        )

        if not general_public_partner:
            raise UserError(_("You must have a 'General Public' commercial partner with a VAT set to 'EI00000000010' in order to submit consolidated invoices."))

        xml_vals['customer'] = general_public_partner
        xml_vals["vals"].update({
            'accounting_customer_party_vals': {
                'party_vals': xml_vals['builder']._get_partner_party_vals(general_public_partner, role='customer'),
            },
            'delivery_vals_list': [{
                'accounting_delivery_party_vals': xml_vals['builder']._l10n_my_edi_get_delivery_party_vals(general_public_partner),
            }],
        })

    def _add_general_document_information(self, xml_vals):
        """ Add the general document information to the XML file. """
        # An 'invoice' is required in the data, but it is only used to fetch the currency in one node, and as we have the same field it will work.
        xml_vals['invoice'] = self

        # The rate in the document will be the one at issuance_date.
        rate = ''
        if self.currency_id.name != "MYR":
            rate = self.env['res.currency']._get_conversion_rate(
                self.currency_id,
                self.company_id.currency_id,
                self.company_id,
                self.myinvois_issuance_date,
            )

        xml_vals['vals'].update({
            'document_type_code_attrs': {'listVersionID': 1.1},
            'document_type_code': '01',  # invoice
            'issue_time': datetime.now(tz=UTC).strftime("%H:%M:%SZ"),
            'tax_exchange_rate': rate,
            'id': self.name,
            'issue_date': self.myinvois_issuance_date,
            'currency_dp': self.currency_id.decimal_places,
            # The next few keys are not relevant to consolidated invoices, so we leave them empty.
            'invoice_period_vals_list': [],
            'additional_document_reference_list': [],
            'payment_terms_vals': [],
            'allowance_charge_vals': [],
            'ubl_version_id': None,
            'due_date': None,
            'note_vals': None,
            'order_reference': None,
        })

    def _add_line_information(self, xml_vals):
        """ Add the information of the consolidated invoice lines to the XML file.
        The orders are split in lines following the logic in _separate_orders_in_lines.
        """
        line_vals = []
        for xml_line_information in xml_vals['xml_lines']:
            xml_line_index = xml_line_information['xml_line_index']
            # Get the allowance charge vals per line then sum it up
            price_amount = price_subtotal = total_fixed_tax_amount = 0.0
            allowance_charge_vals_list = []
            taxes = self.env['account.tax']
            order_lines = self.env['pos.order.line']
            for line in xml_line_information['order_lines']:
                total_fixed_tax_amount += line['fixed_tax_amount']
                price_amount += line['price_amount']
                price_subtotal += line['price_subtotal']
                allowance_charge_vals_list.extend(line['allowance_charge_vals'])
                taxes |= line['taxes']
                order_lines |= line['record']

            # Aggregate the tax details (which are grouped per xml line, but not on the record level)
            taxes_vals = {
                'base_amount_currency': 0.0,
                'base_amount': 0.0,
                'tax_amount_currency': 0.0,
                'tax_amount': 0.0,
                'tax_details': {},
            }
            for grouping_key, tax_detail in xml_vals['lines_tax_information']['tax_details'].items():
                # We will find one group per tax, as expected.
                if grouping_key['xml_line_index'] == xml_line_index:
                    taxes_vals['base_amount_currency'] += tax_detail['base_amount_currency']
                    taxes_vals['base_amount'] += tax_detail['base_amount']
                    taxes_vals['tax_amount_currency'] += tax_detail['tax_amount_currency']
                    taxes_vals['tax_amount'] += tax_detail['tax_amount']
                    taxes_vals['tax_details'][grouping_key] = tax_detail

            taxes = taxes.flatten_taxes_hierarchy().filtered(lambda t: t.amount_type != 'fixed')
            orders = order_lines.order_id
            line_vals.append({
                'currency': self.currency_id,
                'currency_dp': self.currency_id.decimal_places,
                'id': xml_line_index,
                'line_quantity': 1,
                'line_quantity_attrs': {'unitCode': 'C62'},  # unit
                'item_price_extension_amount': price_subtotal,
                'line_extension_amount': price_subtotal + total_fixed_tax_amount,
                'allowance_charge_vals': allowance_charge_vals_list,
                'tax_total_vals': self._get_consolidated_invoice_tax_totals_vals_list(taxes_vals),
                'item_vals': {
                    'description': f"{orders[0].name}-{orders[-1].name}" if len(orders) > 1 else orders[0].name,
                    'name': f"{orders[0].name}-{orders[-1].name}" if len(orders) > 1 else orders[0].name,
                    'commodity_classification_vals': [{
                        'item_classification_code': "004",
                        'item_classification_attrs': {'listID': 'CLASS'},
                    }],
                    'classified_tax_category_vals': self._get_tax_category_vals_list(taxes),
                },
                'price_vals': {
                    'currency': self.currency_id,
                    'currency_dp': self.currency_id.decimal_places,
                    'price_amount': self.currency_id.round(price_amount),
                    'product_price_dp': self.env['decimal.precision'].precision_get('Product Price'),
                    'base_quantity': None,
                    'base_quantity_attrs': {'unitCode': 'C62'},  # unit
                },
            })
        xml_vals['vals']['line_vals'] = line_vals

    def _add_totals_information(self, xml_vals):
        """ Build and add the tax and monetary total information to the XML file. """
        line_extension_amount = sum(line['line_extension_amount'] for line in xml_vals['vals']['line_vals'])

        # We get all orders in self, as we need to process them to get the total and paid amount (without forgetting to handle refunds)
        order_lines = self.env['pos.order.line'].union(*[order_line['record'] for xml_line_information in xml_vals['xml_lines'] for order_line in xml_line_information['order_lines']])
        orders = order_lines.order_id

        amount_total = prepaid_amount = 0
        for order in orders:
            refund_orders = order.mapped('lines.refund_orderline_ids.order_id')
            if refund_orders:
                # We add as the refund order values are negatives already
                amount_total += order.amount_total + sum(refund_orders.mapped('amount_total'))
                prepaid_amount += order.amount_paid + sum(refund_orders.mapped('amount_paid'))
            else:
                amount_total += order.amount_total
                prepaid_amount += order.amount_paid

        amount_residual = amount_total - prepaid_amount
        xml_vals['vals'].update({
            'tax_total_vals': self._get_consolidated_invoice_tax_totals_vals_list(xml_vals["taxes_vals"]),
            'monetary_total_vals': {
                'currency': self.currency_id,
                'currency_dp': self.currency_id.decimal_places,
                'line_extension_amount': line_extension_amount,
                'tax_exclusive_amount': xml_vals['taxes_vals']['base_amount_currency'],
                'tax_inclusive_amount': amount_total,
                'allowance_total_amount': None,
                'charge_total_amount': None,
                'prepaid_amount': prepaid_amount,
                'payable_amount': amount_residual,
            },
        })

    def _build_xml_lines_information(self, orders, xml_vals):
        """ A single line in the xml could represent a multitude of PoS orders.
        To facilitate later calculations, we will prepare a dict with some information about the "xml lines".

        The most important information being the orders in each line, as well as a key to be used during tax computation,
        so that we can aggregate taxes built from each lines
        """
        xml_vals['xml_lines'] = []
        orders_per_line = next(iter(self._separate_orders_in_lines(orders).values()))  # Only one config in a same consolidated invoice

        # We start by gathering the order lines, and to build the tax base lines.
        for index, orders in enumerate(orders_per_line):
            xml_line_info = {
                'xml_line_index': index,  # This index will later be used as "record" when building the tax dict, and when fetching the results per xml lines.
                'order_lines': [],
            }
            for line in orders.lines:
                if (line.refunded_qty and line.refunded_qty == line.qty) or line.refunded_orderline_id:
                    continue  # Lines that have been fully refunded can be ignored, as well as refund lines (they're merged with their refunded line).
                # We need to take into account refunds.
                # We are not allowed to add negative lines in the XML, so refunds must immediately reduce the amounts on the original line.
                quantity = line.qty
                subtotal = line.price_subtotal
                for refund_line in line.refund_orderline_ids:
                    # Add as these values are negative on refund lines.
                    quantity += refund_line.qty
                    subtotal += refund_line.price_subtotal
                xml_line_info["order_lines"].append({
                    **self.env["account.tax"]._convert_to_tax_base_line_dict(
                        line,
                        currency=line.currency_id,
                        taxes=line.tax_ids,
                        price_unit=line.price_unit,
                        quantity=quantity,
                        discount=line.discount,
                        price_subtotal=subtotal,
                        extra_context={"xml_line_index": index},
                    ),
                    "price_amount": (line.price_subtotal / (1.0 - (line.discount or 0.0) / 100.0)),
                })
            xml_vals['xml_lines'].append(xml_line_info)

        # With our very base built, we now need to compute the tax information for the xml lines & the whole document.
        self._validate_taxes(orders)
        document_tax_information, lines_tax_information = self._prepare_aggregated_taxes(xml_vals)
        xml_vals["taxes_vals"] = document_tax_information
        xml_vals['lines_tax_information'] = lines_tax_information

        # Finally, we get back to our lines to compute allowance charges, and a few other values that will be useful later on.
        for xml_line in xml_vals['xml_lines']:
            for order_line in xml_line['order_lines']:
                allowance_charge_vals = self._get_line_allowance_vals_list(
                    order_line, tax_values_list=xml_vals["lines_tax_information"],
                )
                order_line.update({
                    'allowance_charge_vals': allowance_charge_vals,
                    'fixed_tax_amount': sum(
                        vals["amount"] for vals in allowance_charge_vals if vals.get("charge_indicator") == "true"
                    ),
                })

    def _validate_taxes(self, orders):
        """ Validate the structure of the tax repartition lines (invalid structure could lead to unexpected results) """
        self.ensure_one()
        for tax in orders.lines.tax_ids:
            try:
                tax._validate_repartition_lines()
            except ValidationError as e:
                error_msg = _("Tax '%s' is invalid: %s", tax.name, e.args[0])  # args[0] gives the error message
                raise ValidationError(error_msg)

    def _prepare_aggregated_taxes(self, xml_vals):
        """
        Prepares the aggregated tax details needed to build the document.

        We need grouping done on two levels; per XML lines (a group of PoS orders) and for the whole document.
        """
        self.ensure_one()

        def total_grouping_key_generator(base_line, tax_values):
            tax = tax_values['tax_repartition_line'].tax_id
            grouping_key = {
                'tax_category_id': tax.l10n_my_tax_type,
                'tax_category_percent': tax.amount if tax.amount_type == "percent" else False,
                '_tax_category_vals_': self._get_tax_category_vals(tax),
                'tax_amount_type': tax.amount_type,
            }
            # If the tax is fixed, we want to have one group per tax
            # s.t. when the invoice is imported, we can try to guess the fixed taxes
            if tax.amount_type == 'fixed':
                grouping_key['tax_name'] = tax.name
            return grouping_key

        def line_grouping_key_generator(base_line, tax_values):
            tax = tax_values['tax_repartition_line'].tax_id
            grouping_key = {
                'tax_category_id': tax.l10n_my_tax_type,
                'tax_category_percent': tax.amount if tax.amount_type == "percent" else False,
                '_tax_category_vals_': self._get_tax_category_vals(tax),
                'tax_amount_type': tax.amount_type,
                'xml_line_index': base_line['extra_context']['xml_line_index'],
            }
            # If the tax is fixed, we want to have one group per tax
            # s.t. when the invoice is imported, we can try to guess the fixed taxes
            if tax.amount_type == 'fixed':
                grouping_key['tax_name'] = tax.name
            return grouping_key

        def _remove_fixed_tax_details(taxes_vals):
            """ These taxes are handled on the document level """
            fixed_taxes_keys = [k for k in taxes_vals['tax_details'] if k['tax_amount_type'] == 'fixed']
            for key in fixed_taxes_keys:
                fixed_tax_details = taxes_vals['tax_details'].pop(key)
                taxes_vals['tax_amount_currency'] -= fixed_tax_details['tax_amount_currency']
                taxes_vals['tax_amount'] -= fixed_tax_details['tax_amount']
                taxes_vals['base_amount_currency'] += fixed_tax_details['tax_amount_currency']
                taxes_vals['base_amount'] += fixed_tax_details['tax_amount']
            return taxes_vals

        base_lines = [order_line for xml_line_vals in xml_vals['xml_lines'] for order_line in xml_line_vals['order_lines']]

        to_process = []
        for base_line in base_lines:
            to_update_vals, tax_values_list = self.env['account.tax']._compute_taxes_for_single_line(base_line)
            to_process.append((base_line, to_update_vals, tax_values_list))

        # Collect the tax_amount_currency/balance from tax lines.
        current_tax_amount_per_rep_line = {}

        # Collect the computed tax_amount_currency/tax_amount from the taxes computation.
        tax_details_per_rep_line = {}
        for _base_line, _to_update_vals, tax_values_list in to_process:
            for tax_values in tax_values_list:
                tax_rep_id = tax_values['tax_repartition_line_id']
                tax_rep_amounts = tax_details_per_rep_line.setdefault(tax_rep_id, {
                    'tax_amount_currency': 0.0,
                    'tax_amount': 0.0,
                    'distribute_on': [],
                })
                tax_rep_amounts['tax_amount_currency'] += tax_values['tax_amount_currency']
                tax_rep_amounts['tax_amount'] += tax_values['tax_amount']
                tax_rep_amounts['distribute_on'].append(tax_values)

        # Dispatch the delta on tax_values.
        for key, currency in (('tax_amount_currency', self.currency_id), ('tax_amount', self.company_currency_id)):
            for tax_rep_id, computed_tax_rep_amounts in tax_details_per_rep_line.items():
                current_tax_rep_amounts = current_tax_amount_per_rep_line.get(tax_rep_id, computed_tax_rep_amounts)
                diff = current_tax_rep_amounts[key] - computed_tax_rep_amounts[key]
                abs_diff = abs(diff)

                if currency.is_zero(abs_diff):
                    continue

                diff_sign = -1 if diff < 0 else 1
                nb_error = math.ceil(abs_diff / currency.rounding)
                nb_cents_per_tax_values = math.floor(nb_error / len(computed_tax_rep_amounts['distribute_on']))
                nb_extra_cent = nb_error % len(computed_tax_rep_amounts['distribute_on'])
                for tax_values in computed_tax_rep_amounts['distribute_on']:

                    if currency.is_zero(abs_diff):
                        break

                    nb_amount_curr_cent = nb_cents_per_tax_values
                    if nb_extra_cent:
                        nb_amount_curr_cent += 1
                        nb_extra_cent -= 1

                    # We can have more than one cent to distribute on a single tax_values.
                    abs_delta_to_add = min(abs_diff, currency.rounding * nb_amount_curr_cent)
                    tax_values[key] += diff_sign * abs_delta_to_add
                    abs_diff -= abs_delta_to_add

        # We return two dicts; one of them contains the tax information for the total (on the document) and the other contains the tax information for the lines.
        return (
            _remove_fixed_tax_details(self.env['account.tax']._aggregate_taxes(to_process, grouping_key_generator=total_grouping_key_generator)),
            _remove_fixed_tax_details(self.env['account.tax']._aggregate_taxes(to_process, grouping_key_generator=line_grouping_key_generator)),
        )

    def _get_tax_category_vals(self, tax):
        """ The tax information are the same as for accounting MyInvois, with the specificity that the tax exemption is set on the tax. """
        return {
            "id": tax.l10n_my_tax_type,
            "percent": tax.amount if tax.amount_type == "percent" else False,
            "tax_scheme_vals": {"id": "OTH", "id_attrs": {'schemeID': 'UN/ECE 5153', 'schemeAgencyID': '6'}},
            "tax_category_code": tax.l10n_my_tax_type,
            "tax_exemption_reason_code": None,  # Unused in this file.
            "tax_exemption_reason": tax.l10n_my_tax_exemption_reason,
        }

    def _get_tax_category_vals_list(self, taxes):
        res = []
        for tax in taxes:
            res.append(self._get_tax_category_vals(tax))
        return res

    def _get_consolidated_invoice_tax_totals_vals_list(self, taxes_vals):
        tax_totals_vals = {
            'currency': self.currency_id,
            'currency_dp': self.currency_id.decimal_places,
            'tax_amount': taxes_vals['tax_amount_currency'],
            'tax_subtotal_vals': [],
        }

        for grouping_key, vals in taxes_vals['tax_details'].items():
            if grouping_key['tax_amount_type'] != 'fixed':
                subtotal = {
                    'currency': self.currency_id,
                    'currency_dp': self.currency_id.decimal_places,
                    'taxable_amount': vals['base_amount_currency'],
                    'tax_amount': vals['tax_amount_currency'],
                    'percent': grouping_key['tax_category_percent'],
                    'tax_category_vals': grouping_key['_tax_category_vals_'],
                }
                tax_totals_vals['tax_subtotal_vals'].append(subtotal)

        return [tax_totals_vals]

    def _get_line_allowance_vals_list(self, line, tax_values_list=None):
        """ see UBL for more details. """
        fixed_tax_charge_vals_list = []
        for grouping_key, tax_details in tax_values_list['tax_details'].items():
            if grouping_key['tax_amount_type'] == 'fixed':
                fixed_tax_charge_vals_list.append({
                    'currency_name': line['currency'],
                    'currency_dp': line['currency'].decimal_places,
                    'charge_indicator': 'true',
                    'allowance_charge_reason_code': 'AEO',
                    'allowance_charge_reason': grouping_key['tax_name'],
                    'amount': tax_details['tax_amount_currency'],
                })

        if not line['discount']:
            return fixed_tax_charge_vals_list

        net_price_subtotal = line['price_subtotal']
        if line['discount'] == 100.0:
            gross_price_subtotal = 0.0
        else:
            gross_price_subtotal = line['currency'].round(net_price_subtotal / (1.0 - (line['discount'] or 0.0) / 100.0))

        allowance_vals = {
            'currency_name': line['currency'].name,
            'currency_dp': line['currency'].decimal_places,
            'charge_indicator': 'false',
            'allowance_charge_reason_code': 95,
            'amount': gross_price_subtotal - net_price_subtotal,
        }

        return [allowance_vals] + fixed_tax_charge_vals_list
