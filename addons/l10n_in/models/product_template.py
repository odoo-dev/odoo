import re
from odoo import _, api, models, fields


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    l10n_in_hsn_code = fields.Char(string="HSN/SAC Code", help="Harmonized System Nomenclature/Services Accounting Code")
    l10n_in_hsn_warning = fields.Text(string="HSC/SAC warning", compute="_compute_l10n_in_hsn_warning")
    l10n_in_is_gst_registered_enabled = fields.Boolean(compute="_compute_l10n_in_is_gst_registered_enabled")
    l10n_in_hsn_based_tax_id = fields.Many2one(
        comodel_name='account.tax',
        string="GST Rate",
        domain="[('type_tax_use', '=', 'sale'), ('country_id.code', '=', 'IN')]",
        help="Tax rates to be applied on sales of this product. When unit price exceeds the threshold limit, the tax will be applied based on the HSN/SAC code.",
        company_dependent=True,
        ondelete='restrict'
    )
    l10n_in_threshold_limit = fields.Float(
        string="Threshold Price limit per Unit",
        help="Threshold limit in INR beyond which GST is applied.",
        company_dependent=True
    )
    l10n_in_is_aligible_for_hsn_taxation = fields.Boolean(string="Is Eligible for Tax Rate", help="Check if the product is eligible for GST tax rate.", compute="_compute_l10n_in_is_aligible_for_hsn_taxation", company_dependent=True)
    l10n_in_hsn_taxation_information = fields.Text(string="HSN Taxation Information", help="Information about HSN/SAC code and its applicability for GST taxation.", compute="_compute_l10n_in_hsn_taxation_information")

    @api.depends('company_id.l10n_in_is_gst_registered')
    @api.depends_context('allowed_company_ids')
    def _compute_l10n_in_is_gst_registered_enabled(self):
        for record in self:
            allowed_companies = record.company_id or self.env.companies
            record.l10n_in_is_gst_registered_enabled = any(
                company.l10n_in_is_gst_registered
                for company in allowed_companies
            )

    @api.depends('sale_ok', 'l10n_in_hsn_code')
    def _compute_l10n_in_hsn_warning(self):
        digit_suffixes = {
            '4': _("either 4, 6 or 8"),
            '6': _("either 6 or 8"),
            '8': _("8")
        }
        active_hsn_code_digit_len = max(
            int(company.l10n_in_hsn_code_digit)
            for company in self.env.companies
        )
        for record in self:
            check_hsn = record.sale_ok and record.l10n_in_hsn_code and active_hsn_code_digit_len
            if check_hsn and (not re.match(r'^\d{4}$|^\d{6}$|^\d{8}$', record.l10n_in_hsn_code) or len(record.l10n_in_hsn_code) < active_hsn_code_digit_len):
                record.l10n_in_hsn_warning = _(
                    "HSN code field must consist solely of digits and be %s in length.",
                    digit_suffixes.get(str(active_hsn_code_digit_len))
                )
                continue
            record.l10n_in_hsn_warning = False

    @api.depends('l10n_in_hsn_code')
    def _compute_l10n_in_is_aligible_for_hsn_taxation(self):
        for record in self:
            aligible_hsn_code_starting_digits = ['61', '62', '63', '64', '9404']
            if record.l10n_in_hsn_code and any(record.l10n_in_hsn_code.startswith(digit) for digit in aligible_hsn_code_starting_digits):
                record.l10n_in_is_aligible_for_hsn_taxation = True
            else:
                record.l10n_in_is_aligible_for_hsn_taxation = False

    @api.depends('list_price', 'taxes_id', 'l10n_in_is_aligible_for_hsn_taxation', 'l10n_in_threshold_limit', 'l10n_in_hsn_based_tax_id')
    def _compute_l10n_in_hsn_taxation_information(self):
        for product in self:
            if not product.l10n_in_is_aligible_for_hsn_taxation:
                product.l10n_in_hsn_taxation_information = False
            elif product.list_price <= product.l10n_in_threshold_limit:
                product.l10n_in_hsn_taxation_information = _("The unit price of this product does not exceed the threshold limit of %.2f INR. Therefore, GST will be applied based on the selected tax rates.", product.l10n_in_threshold_limit)
            elif not product.l10n_in_hsn_based_tax_id:
                product.l10n_in_hsn_taxation_information = _("The unit price of this product exceeds the threshold limit of %.2f INR. However, no GST rate is configured based on the HSN/SAC code. Please set a GST rate to ensure correct taxation.", product.l10n_in_threshold_limit)
            else:
                product.l10n_in_hsn_taxation_information = _(
                    "The unit price of this product exceeds the threshold limit of %(limit).2f INR. "
                    "Therefore, GST will be applied based on the HSN/SAC code with the selected tax rate: %(tax)s.",
                    limit=product.l10n_in_threshold_limit,
                    tax=product.l10n_in_hsn_based_tax_id.display_name,
                )
