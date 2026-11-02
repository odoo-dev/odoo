from odoo import fields, models


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_jp_document_version_ids = fields.One2many(
        'l10n_jp.account.document.version',
        'move_id',
        string='Japan Evidence Versions',
        groups='account.group_account_manager',
    )

    def _extend_with_attachments(self, files_data, new=False):
        self.ensure_one()
        # The bill-upload importer links files before calling this decoder hook.
        # Preserve original bytes before a decoder can transform the attachments.
        attachments = self._from_files_data(files_data).filtered(
            lambda attachment: attachment.res_model == self._name and attachment.res_id == self.id
        )
        attachments._l10n_jp_register_scanned_documents()
        return super()._extend_with_attachments(files_data, new=new)

    def action_l10n_jp_add_evidence(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._('Upload Scanned Document'),
            'res_model': 'l10n_jp.account.document.version',
            'view_mode': 'form',
            'target': 'current',
            'context': {'default_move_id': self.id},
        }
