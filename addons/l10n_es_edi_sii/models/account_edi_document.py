from odoo import fields, models


class AccountEdiDocument(models.Model):
    _inherit = 'account.edi.document'

    l10n_es_xml_sii_content = fields.Binary('XML Contenido', readonly=True)
    l10n_es_xml_sii_name = fields.Char(string='Nombre XML AEAT', compute='_compute_l10n_es_xml_sii_name')

    def _compute_l10n_es_xml_sii_name(self):
        for doc in self:
            doc.l10n_es_xml_sii_name = f"SII_{doc.move_id.name.replace('/', '_')}.xml"

    def action_download_aeat_xml(self):
        self.ensure_one()
        if not self.l10n_es_xml_sii_content:
            raise UserError(_("No hay un XML de la AEAT guardado para este documento."))
            
        return {
            'type': 'ir.actions.act_url',
            # Usamos el campo l10n_es_xml_sii_content para la descarga
            'url': f'/web/content/account.edi.document/{self.id}/l10n_es_xml_sii_content/{self.l10n_es_xml_sii_name}?download=true',
            'target': 'self',
        }