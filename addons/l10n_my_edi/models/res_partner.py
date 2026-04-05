# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models
from odoo.exceptions import UserError

# Maps additional_identifiers code → MyInvois scheme ID
MY_IDENTIFIER_SCHEME = {
    'MY_MYID': 'NRIC',
    'MY_BRN': 'BRN',
    'MY_PASSPORT': 'PASSPORT',
    'MY_ARMY': 'ARMY',
}
# Reverse mapping: MyInvois scheme ID → additional_identifiers code
MY_SCHEME_TO_CODE = {v: k for k, v in MY_IDENTIFIER_SCHEME.items()}


class ResPartner(models.Model):
    _inherit = 'res.partner'

    # ------------------
    # Fields declaration
    # ------------------

    l10n_my_tin_validation_state = fields.Selection(
        selection=[
            ('valid', 'Valid'),
            ('invalid', 'Invalid'),
        ],
        string='Tin Validation State',
        help="Technical field, hold the result of TIN validation using MyInvois API.\n"
             "It is non blocking, and will simply help ensure that the customer of an invoice is valid to avoid submission errors.",
        compute='_compute_l10n_my_tin_validation_state',
        readonly=False,
        store=True,
        export_string_translation=False,
    )
    l10n_my_edi_display_tin_warning = fields.Boolean(
        compute='_compute_l10n_my_edi_display_tin_warning',
    )

    l10n_my_edi_industrial_classification = fields.Many2one(
        comodel_name='l10n_my_edi.industry_classification',
        string="Ind. Classification",
        compute='_compute_l10n_my_edi_industrial_classification',
        store=True,
        readonly=False,
    )
    l10n_my_edi_malaysian_tin = fields.Char(
        string="Malaysian TIN",
        help="The value set in this field will be used as TIN for the customer/supplier.\n"
             "If left empty, the Tax ID field will be used.",
    )

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    @api.depends('additional_identifiers', 'vat', 'l10n_my_edi_malaysian_tin')
    def _compute_l10n_my_tin_validation_state(self):
        """ The three @depends are used for the validation. If they change, we will invalidate it and expect the user to revalidate. """
        self.l10n_my_tin_validation_state = False

    @api.depends_context('company', 'additional_identifiers')
    def _compute_l10n_my_edi_display_tin_warning(self):
        """ We want to display the tin warning for companies registered to use MyInvois. """
        # We need to sudo here, as all users having access to partners may not have the rights to access the proxy users.
        proxy_user = self.env.company.sudo().l10n_my_edi_proxy_user_id
        is_edi_used = proxy_user and proxy_user.proxy_type == 'l10n_my_edi'
        for partner in self:
            # Users with no business number can't be validated using the api
            partner.l10n_my_edi_display_tin_warning = is_edi_used and bool(partner._l10n_my_get_identification()[1])

    def _compute_l10n_my_edi_industrial_classification(self):
        default_classification = self.env.ref('l10n_my_edi.class_00000', raise_if_not_found=False)
        self.filtered(lambda p: not p.l10n_my_edi_industrial_classification).l10n_my_edi_industrial_classification = default_classification

    # --------------
    # Action methods
    # --------------

    def action_validate_tin(self):
        """ Calling this action will reach our EDI proxy in order to validate the TIN against the provided identification information. """
        self.ensure_one()
        id_type, id_val = self._l10n_my_get_identification()
        if not self._l10n_my_edi_get_tin_for_myinvois() or not id_type or not id_val:
            raise UserError(self.env._('In order to validate the TIN, you must provide the Identification type and number.'))

        # Sudo to allow a user without access to the proxy user to validate the ID if needed.
        proxy_user = self.env.company.sudo().l10n_my_edi_proxy_user_id
        if not proxy_user:
            raise UserError(self.env._("Please register for the E-Invoicing service in the settings first."))

        response = proxy_user._l10n_my_edi_contact_proxy('api/l10n_my_edi/1/validate_tin', params={
            'identification_values': {
                'tin': self._l10n_my_edi_get_tin_for_myinvois(),
                'id_type': id_type,
                'id_val': id_val,
            },
        })

        if 'error' in response:
            ref = response['error']['reference']
            # No need to rollback, we don't want to be blocking on that.
            if ref == 'document_tin_not_found':
                self._message_log(body=self.env._('MyInvois was not able to match the TIN with the provided identification number.\nThis may happen when using generic TIN and will not prevent you from invoicing.'))
                self.l10n_my_tin_validation_state = 'invalid'
            else:
                self._message_log(body=self.env._('An unexpected error occurred while validating the TIN. Please try again later.'))
        else:
            self.l10n_my_tin_validation_state = 'valid' if response.get('success') else 'invalid'

    def _l10n_my_edi_get_tin_for_myinvois(self):
        """ Helper to return the VAT number relevant to the situation. """
        self.ensure_one()
        # When l10n_my_edi_malaysian_tin is set, it will be used instead of the VAT.
        # A user may want to keep the correct VAT on a foreign contact while also use myinvois with a malaysia TIN/Generic TIN
        # Using the Tax ID field also causes issue when base_vat is enabled, which block setting foreign VAT numbers.
        return self.l10n_my_edi_malaysian_tin or self.vat

    def _l10n_my_get_identification(self):
        """ Return (scheme_id, value) for the first MY identifier found in additional_identifiers, or (None, None). """
        self.ensure_one()
        for code, scheme in MY_IDENTIFIER_SCHEME.items():
            value = (self.additional_identifiers or {}).get(code)
            if value:
                return scheme, value
        return None, None

    @api.model
    def _commercial_fields(self):
        return super()._commercial_fields() + ['additional_identifiers', 'l10n_my_edi_industrial_classification', 'l10n_my_edi_malaysian_tin']

    def _get_frontend_writable_fields(self):
        frontend_writable_fields = super()._get_frontend_writable_fields()
        frontend_writable_fields.update({'additional_identifiers', 'l10n_my_edi_industrial_classification'})

        return frontend_writable_fields
