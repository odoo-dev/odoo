import re

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError

# GSTR-1 (Table 13) only accepts document numbers of at most 16 characters
# made of letters, digits, '/' and '-'.
L10N_IN_DOCUMENT_NUMBER_MAX_LENGTH = 16
L10N_IN_DOCUMENT_NUMBER_PATTERN = re.compile(r'^[A-Za-z0-9/\-]*$')
L10N_IN_B2C_SEQUENCE_MAX_PADDING = 9
L10N_IN_B2C_SEQUENCE_MIN_PADDING = 4


class PosConfig(models.Model):
    _inherit = 'pos.config'

    l10n_in_b2c_invoice_prefix = fields.Char(
        string="B2C Invoice Prefix",
        compute='_compute_l10n_in_b2c_prefixes', store=True, readonly=False,
        help="Prefix of the invoice number given to the orders of consumers (B2C). "
             "Use %(y)s for the year, e.g. P1/%(y)s/ gives P1/26/000000001.",
    )
    l10n_in_b2c_refund_prefix = fields.Char(
        string="B2C Credit Note Prefix",
        compute='_compute_l10n_in_b2c_prefixes', store=True, readonly=False,
        help="Prefix of the credit note number given to the refunds of consumers (B2C).",
    )
    l10n_in_b2c_invoice_seq_id = fields.Many2one('ir.sequence', string="B2C Invoice Sequence", readonly=True, copy=False)
    l10n_in_b2c_refund_seq_id = fields.Many2one('ir.sequence', string="B2C Credit Note Sequence", readonly=True, copy=False)

    @api.depends('company_id')
    def _compute_l10n_in_b2c_prefixes(self):
        for config in self:
            defaults = config._l10n_in_get_default_b2c_prefixes()
            config.l10n_in_b2c_invoice_prefix = config.l10n_in_b2c_invoice_prefix or defaults.get('l10n_in_b2c_invoice_prefix')
            config.l10n_in_b2c_refund_prefix = config.l10n_in_b2c_refund_prefix or defaults.get('l10n_in_b2c_refund_prefix')

    @api.model_create_multi
    def create(self, vals_list):
        configs = super().create(vals_list)
        for config in configs:
            # The defaults use the id, which a new record from a form does not have yet.
            # Writing the prefixes also creates the sequences.
            if defaults := config._l10n_in_get_default_b2c_prefixes():
                config.write({field: config[field] or value for field, value in defaults.items()})
        return configs

    def write(self, vals):
        res = super().write(vals)
        if {'l10n_in_b2c_invoice_prefix', 'l10n_in_b2c_refund_prefix'} & vals.keys():
            self._l10n_in_sync_b2c_sequences()
        return res

    def _is_quantities_set(self):
        return self.company_id.l10n_in_gst_registration_type or super()._is_quantities_set()

    def _l10n_in_get_default_b2c_prefixes(self):
        self.ensure_one()
        if self.company_id.account_fiscal_country_id.code != 'IN' or not self.id:
            return {}
        return {
            'l10n_in_b2c_invoice_prefix': f"P{self.id}/%(y)s/",
            'l10n_in_b2c_refund_prefix': f"PR{self.id}/%(y)s/",
        }

    def _l10n_in_sync_b2c_sequences(self):
        """ Create or update the B2C sequences so that they follow the prefixes of the config. """
        for config in self:
            for prefix_field, sequence_field, name in (
                ('l10n_in_b2c_invoice_prefix', 'l10n_in_b2c_invoice_seq_id', _("POS B2C invoice from config #%s", config.id)),
                ('l10n_in_b2c_refund_prefix', 'l10n_in_b2c_refund_seq_id', _("POS B2C credit note from config #%s", config.id)),
            ):
                prefix = config[prefix_field]
                if not prefix:
                    continue
                sequence = config[sequence_field].sudo()
                if not sequence:
                    sequence = self.env['ir.sequence'].sudo().create({
                        'name': name,
                        'code': 'pos.order.l10n_in_b2c',
                        'company_id': config.company_id.id,
                        'implementation': 'no_gap',
                    })
                    config.sudo()[sequence_field] = sequence
                sequence.prefix = prefix
                sequence.padding = config._l10n_in_get_b2c_sequence_padding(sequence, config._fields[prefix_field].string)

    def _l10n_in_get_b2c_sequence_padding(self, sequence, label):
        """ Fill the number with as many digits as the GST portal allows, up to 9. """
        try:
            rendered_prefix, rendered_suffix = sequence._get_prefix_suffix()
        except UserError:
            raise ValidationError(_("%(label)s '%(prefix)s' contains an invalid placeholder.", label=label, prefix=sequence.prefix))
        rendered = rendered_prefix + rendered_suffix
        padding = min(L10N_IN_DOCUMENT_NUMBER_MAX_LENGTH - len(rendered), L10N_IN_B2C_SEQUENCE_MAX_PADDING)
        if not L10N_IN_DOCUMENT_NUMBER_PATTERN.match(rendered) or padding < L10N_IN_B2C_SEQUENCE_MIN_PADDING:
            raise ValidationError(_(
                "%(label)s '%(prefix)s' is not allowed: the GST portal only accepts invoice numbers of at most "
                "%(max_length)s characters made of letters, digits, '/' and '-', and at least %(min_digits)s of them "
                "must be kept for the number itself.",
                label=label,
                prefix=sequence.prefix,
                max_length=L10N_IN_DOCUMENT_NUMBER_MAX_LENGTH,
                min_digits=L10N_IN_B2C_SEQUENCE_MIN_PADDING,
            ))
        return padding

    def _l10n_in_get_b2c_sequence(self, is_refund):
        self.ensure_one()
        sequence_field = 'l10n_in_b2c_refund_seq_id' if is_refund else 'l10n_in_b2c_invoice_seq_id'
        if not self[sequence_field]:
            # Prefixes computed when the module was installed, before any sequence existed.
            self._l10n_in_sync_b2c_sequences()
        return self[sequence_field]
