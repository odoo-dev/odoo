from odoo import models


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    _l10n_de__paperformat_euro_din = models.Ref('l10n_de.paperformat_euro_din', 'report.paperformat', required=False)

    def retrieve_attachment(self, record):
        # Override this method in order to force to re-render the pdf in case of
        # using snailmail
        if self.env.context.get('snailmail_layout'):
            return False
        return super().retrieve_attachment(record)

    def get_paperformat(self):
        # force the right format (euro/A4) when sending letters, only if we are not using the l10n_DE layout
        res = super().get_paperformat()
        if self.env.context.get('snailmail_layout') and res != self._l10n_de__paperformat_euro_din:
            paperformat_id = self.env.ref('base.paperformat_euro')
            return paperformat_id
        else:
            return res
