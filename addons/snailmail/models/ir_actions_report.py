from odoo import models


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    def retrieve_attachment(self, record):
        # Override this method in order to force to re-render the pdf in case of
        # using snailmail
        if self.env.context.get('snailmail_layout'):
            return False
        return super().retrieve_attachment(record)

    def get_paperformat(self):
        # force the right format (euro/A4) when sending letters, only if we are not using the l10n_DE layout
        res = super().get_paperformat()
        if self.env.context.get('snailmail_layout') and res != self.env['report.paperformat']._l10n_de__paperformat_euro_din_optional:
            paperformat_id = self.env.ref('base.paperformat_euro')
            return paperformat_id
        else:
            return res
