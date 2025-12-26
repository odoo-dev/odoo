from odoo import api, fields, models
from odoo.exceptions import ValidationError


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_hr_mer_username = fields.Char("MojEracun username")
    l10n_hr_mer_password = fields.Char("MojEracun password")
    l10n_hr_mer_company_ident = fields.Char("MojEracun CompanyId")
    l10n_hr_mer_software_ident = fields.Char("MojEracun SoftwareId", default='Saodoo-001', help="Default SoftwareID for Odoo is 'Saodoo-001'")
    l10n_hr_mer_connection_state = fields.Selection(
        selection=[
            ('inactive', 'Inactive'),
            ('active', 'Active'),
        ],
        string='MojEracun connection status',
        required=True,
        default='inactive',
        compute='_compute_l10n_hr_mojeracun_state',
        store=True,
    )
    l10n_hr_mer_connection_mode = fields.Selection(
        selection=[
            ('prod', 'Production'),
            ('test', 'Test'),
            ('demo', 'Demo'),
        ],
        string='MojEracun Operating mode',
        default='test',
    )
    l10n_hr_mer_purchase_journal_id = fields.Many2one(
        comodel_name='account.journal',
        string='eracun Purchase Journal',
        domain=[('type', '=', 'purchase')],
        compute='_compute_l10n_hr_mer_purchase_journal_id', store=True, readonly=False,
    )

    # -------------------------------------------------------------------------
    # CONSTRAINTS
    # -------------------------------------------------------------------------

    @api.constrains('l10n_hr_mer_purchase_journal_id')
    def _check_l10n_hr_mer_purchase_journal_id(self):
        for company in self:
            if company.l10n_hr_mer_purchase_journal_id and company.l10n_hr_mer_purchase_journal_id.type != 'purchase':
                raise ValidationError(self.env._("A purchase journal must be used to receive eRacun document via MojEracun."))

    # -------------------------------------------------------------------------
    # COMPUTE METHODS
    # -------------------------------------------------------------------------

    @api.depends('l10n_hr_mer_connection_state')
    def _compute_l10n_hr_mer_purchase_journal_id(self):
        for company in self:
            if not company.l10n_hr_mer_purchase_journal_id and company.l10n_hr_mer_connection_state not in {'inactive'}:
                company.l10n_hr_mer_purchase_journal_id = self.env['account.journal'].search([
                    *self.env['account.journal']._check_company_domain(company),
                    ('type', '=', 'purchase'),
                ], limit=1)
                company.l10n_hr_mer_purchase_journal_id.l10n_hr_is_mer_journal = True
            else:
                company.l10n_hr_mer_purchase_journal_id = company.l10n_hr_mer_purchase_journal_id

    @api.depends('l10n_hr_mer_username', 'l10n_hr_mer_password')
    def _compute_l10n_hr_mojeracun_state(self):
        for company in self:
            if any(not field for field in [
                company.l10n_hr_mer_username,
                company.l10n_hr_mer_password,
            ]):
                company.l10n_hr_mer_connection_state = 'inactive'

    # -------------------------------------------------------------------------
    # MOJERACUN PARTICIPANT MANAGEMENT
    # -------------------------------------------------------------------------

    def _l10n_hr_activate_mojeracun(self):
        for company in self:
            if company.l10n_hr_mer_username and company.l10n_hr_mer_password:
                company.l10n_hr_mer_connection_state = 'active'
