from odoo import fields, models

ETA_SUBMISSION_STATES = [
    ('accepted', "Accepted"),
    ('rejected', "Rejected"),
    ('test', "Accepted (Test)"),
    ('cancel', "Cancelled"),
]


class L10nEgEdiEtaSubmission(models.Model):
    _name = 'l10n_eg_edi.eta.submission'
    _description = "ETA Submission Details"

    move_id = fields.Many2one('account.move', string='Invoice', readonly=True)
    l10n_eg_eta_submission_date = fields.Datetime(string='Submission Date')
    l10n_eg_eta_document_uuid = fields.Char(string='Document UUID')
    l10n_eg_eta_document_longid = fields.Char(string='Document Long ID')
    l10n_eg_eta_submission_id = fields.Char(string='Submission ID')
    l10n_eg_eta_submission_state = fields.Selection(
        selection=ETA_SUBMISSION_STATES,
        string='State',
    )
    l10n_eg_eta_error_message = fields.Char(string="Response Message")
    l10n_eg_eta_json_filename = fields.Char(string="Submitted file name")
