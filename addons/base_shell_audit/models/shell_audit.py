from odoo import api, fields, models


class ShellAuditHistory(models.Model):
    _name = 'shell.audit.history'
    _description = 'Shell Audit History'
    _order = 'id desc'

    comment = fields.Text('Comment')
    source = fields.Text('Python Source', readonly=True)
    overview = fields.Text(compute='_compute_overview', string='Label')
    transaction_ids = fields.One2many('shell.audit.transaction', 'history_id', 'Transactions')

    @api.depends('comment', 'source')
    def _compute_overview(self):
        max_lines = 4
        for record in self:
            label_source = []
            if record.comment:
                label_source = record.comment.splitlines()
            elif record.source:
                label_source = record.source.splitlines()
            record.overview = '\n'.join(label_source[:max_lines])
            if len(label_source) > max_lines:
                record.overview += '\n...'


class ShellAuditTransaction(models.Model):
    _name = 'shell.audit.transaction'
    _description = 'Shell Audit Transaction'
    _order = 'id'

    history_id = fields.Many2one(
        comodel_name='shell.audit.history',
        ondelete='cascade',
        required=True,
        index=True,
    )
    transaction_date = fields.Datetime('Transaction Date', readonly=True)
    queries = fields.Text('SQL Queries', readonly=True)
