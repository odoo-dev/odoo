

from odoo import api, fields, models, Command
from odoo.exceptions import UserError
from odoo.tools import frozendict


class AccountMove(models.Model):
    _inherit = 'account.move'

    has_grouped_lines = fields.Boolean(help="Is move lines Grouped")
    ubl_cii_xml_file = fields.Binary(
        attachment=True,
        string="UBL/CII File",
        copy=False,
    )
    ubl_cii_xml_filename = fields.Char(
        string="UBL/CII Filename",
        compute='_compute_filename',
    )

    # -------------------------------------------------------------------------
    # COMPUTE
    # -------------------------------------------------------------------------

    @api.depends('ubl_cii_xml_file')
    def _compute_filename(self):
        """ Compute the filename based on the uploaded file. """
        for record in self:
            record.ubl_cii_xml_filename = record.ubl_cii_xml_file.filename

    # -------------------------------------------------------------------------
    # BUSINESS
    # -------------------------------------------------------------------------

    def _get_fields_to_detach(self):
        # EXTENDS account
        fields_list = super()._get_fields_to_detach()
        fields_list.append("ubl_cii_xml_file")
        return fields_list

    def _get_invoice_files(self):
        invoice_files = super()._get_invoice_files()
        if xml_file := self.ubl_cii_xml_file:
            # The XML is already embedded in the PDF for those hybrid formats
            # (see _hook_invoice_document_after_pdf_report_render), sending it a second time as a
            # standalone file makes some recipient systems detect two separate invoices. But if the PDF
            # doesn't contain the XML, the standalone file is the only copy, so we send it.
            comm_partner = self.commercial_partner_id.with_company(self.company_id)
            is_embedded = (
                comm_partner.invoice_edi_format in ('facturx', 'zugferd')
                and self.env['account.move.send']._is_xml_embedded_in_pdf(self)
            )
            invoice_files.append({'file': xml_file, 'send': not is_embedded, 'chatter': True})
        return invoice_files

    def _get_invoice_legal_documents(self, filetype, allow_fallback=False):
        # EXTENDS account
        self.ensure_one()
        if filetype == 'ubl':
            if ubl_xml := self.ubl_cii_xml_file:
                return [{
                    'filename': ubl_xml.filename,
                    'filetype': 'xml',
                    'content': ubl_xml,
                }]
            elif allow_fallback:
                if (
                    self.partner_id
                    and (edi_format := self.commercial_partner_id.with_company(self.company_id)
                        ._get_ubl_cii_edi_format())
                    and self._need_ubl_cii_xml(edi_format)
                ):
                    builder = self.env['res.partner']._get_edi_builder(edi_format)
                    xml_content, errors = builder._export_invoice(self)
                    filename = builder._export_invoice_filename(self)
                    return [{
                        'filename': filename,
                        'filetype': 'xml',
                        'content': xml_content,
                        'errors': errors,
                    }]
        return super()._get_invoice_legal_documents(filetype, allow_fallback=allow_fallback)

    def action_group_ungroup_lines_by_tax(self):
        """
        This action allows the user to reload an imported move, grouping or not lines by tax
        """
        self.ensure_one()
        self._check_move_for_group_ungroup_lines_by_tax()

        if self.has_grouped_lines:
            self._ungroup_lines()
        else:
            self._group_lines_by_tax()

    def _ungroup_lines(self):
        """
        Ungroup lines using the original file, used to import the move
        """
        self.ensure_one()
        error_message = self.env._("Cannot find the origin file, try by importing it again")
        ubl_xml = self.ubl_cii_xml_file
        if not ubl_xml:
            raise UserError(error_message)

        files_data = self._to_files_data(self.env['ir.attachment'].browse(ubl_xml.attachment_id))
        files_data.extend(self._unwrap_attachments(files_data))
        file_data_group = self._group_files_data_into_groups_of_mixed_types(files_data)[0]

        decoder = file_data_group[0].get('decoder_info', {}).get('decoder')
        if decoder is None:
            raise UserError(self.env._("Cannot decode origin file, try by importing it again"))

        self.invoice_line_ids = [Command.clear()]
        if decoder(self, file_data_group[0]) is None:
            self.has_grouped_lines = False
            self._message_log(body=self.env._("Ungrouped lines from %s", file_data_group[0]['attachment'].name))
        else:
            raise UserError(error_message)

    def _group_lines_by_tax(self):
        """
        Group lines by tax, based on the invoice lines
        """
        self.ensure_one()
        if not self.is_invoice(include_receipts=True):
            raise UserError(self.env._("You can only group lines of an invoice"))

        line_vals = self._get_line_vals_group_by_tax(self.partner_id)
        self.invoice_line_ids = [Command.clear()]
        self.invoice_line_ids = line_vals
        self.has_grouped_lines = True
        self._message_log(body=self.env._("Grouped lines by tax"))

    def _get_line_vals_group_by_tax(self, partner):
        """
        Create a collection of dicts containing the values to create invoice lines, grouped by
        tax and deferred date if present.
        :param partner: partner linked to the move
        """
        self.ensure_one()
        AccountTax = self.env['account.tax']

        base_lines, _tax_lines = self._get_rounded_base_and_tax_lines()

        def aggregate_function(target_base_line, base_line):
            target_base_line.setdefault('_aggregated_quantity', 0.0)
            target_base_line['_aggregated_quantity'] += base_line['quantity']

        def grouping_function(base_line):
            return {
                '_grouping_key': frozendict(AccountTax._prepare_base_line_grouping_key(base_line)),
            }

        base_lines = AccountTax._reduce_base_lines_with_grouping_function(
            base_lines,
            grouping_function=grouping_function,
            aggregate_function=aggregate_function,
        )
        AccountTax._fix_base_lines_tax_details_on_manual_tax_amounts(base_lines, self.company_id)

        to_create = []
        for base_line in base_lines:
            taxes = base_line['tax_ids']
            account = base_line['account_id']
            description = account.name
            if taxes.mapped('name') and len(base_lines) > 1:
                description += f" - {taxes.mapped('name')[0]}"
            to_create.append(Command.create({
                'name': description,
                'quantity': base_line['quantity'],
                'price_unit': base_line['price_unit'],
                'extra_tax_data': AccountTax._export_base_line_extra_tax_data(base_line),
                **base_line['_grouping_key'],
            }))
        return to_create

    def _check_move_for_group_ungroup_lines_by_tax(self):
        """
        Perform checks to evaluate if a move is eligible to grouping/ungrouping
        """
        self.ensure_one()
        if self.state != 'draft':
            raise UserError(self.env._("You can only (un)group lines of a draft invoice"))
        if len(self.invoice_line_ids) <= 1 and not self.has_grouped_lines:
            raise UserError(self.env._("You need at least two lines to group them."))

    @api.model
    def _post_process_link_to_purchase_order(self, invoice):
        # Override account.move
        try:
            invoice._check_move_for_group_ungroup_lines_by_tax()
        except UserError:
            return

        if not invoice.partner_id or not invoice.ubl_cii_xml_file:
            return

        # Group lines
        if invoice.journal_id.type == 'sale':
            move_types = invoice.get_sale_types(include_receipts=True)
        else:
            move_types = invoice.get_purchase_types(include_receipts=True)
        last_bill_from_vendor = self.env['account.move'].search([
            ('move_type', 'in', move_types),
            ('partner_id', '=', invoice.partner_id.id),
            ('state', '=', 'posted'),
            ('id', '!=', invoice.id),
            *self.env['account.move']._check_company_domain(invoice.company_id),
        ], order='create_date desc', limit=1)
        if last_bill_from_vendor and last_bill_from_vendor.has_grouped_lines:
            invoice._group_lines_by_tax()

    # -------------------------------------------------------------------------
    # EDI
    # -------------------------------------------------------------------------

    def _get_import_file_type(self, file_data):
        """ Identify CII files. """
        # EXTENDS 'account'
        if (tree := file_data['xml_tree']) is not None:
            if tree.tag == '{urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100}CrossIndustryInvoice':
                return 'account.edi.xml.cii'
        return super()._get_import_file_type(file_data)

    def _get_ubl_cii_importable_models(self):
        """ The EDI models whose files are imported with _import_invoice_ubl_cii. """
        return self._get_edi_child_models('account.edi.xml.cii')

    def _get_edi_child_models(self, model):
        """ The given model and all the models inheriting from it. """
        child_models = {model}
        for child in self.env.registry[model]._inherit_children:
            child_models.update(self._get_edi_child_models(child))
        return child_models

    def _get_edi_decoder(self, file_data, new=False):
        if file_data['import_file_type'] in self._get_ubl_cii_importable_models():
            return {
                'priority': 20,
                'decoder': self.env[file_data['import_file_type']]._import_invoice_ubl_cii,
            }
        return super()._get_edi_decoder(file_data, new)

    def _need_ubl_cii_xml(self, ubl_cii_format):
        self.ensure_one()
        return not self.ubl_cii_xml_file \
            and (self.is_sale_document() or self._is_exportable_as_self_invoice()) \
            and ubl_cii_format in self.env['res.partner']._get_ubl_cii_formats()

    def _is_exportable_as_self_invoice(self):
        """ Whether this vendor bill can be exported as a self-billed invoice (see account_edi_ubl). """
        return False
