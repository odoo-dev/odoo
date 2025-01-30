# Part of Odoo. See LICENSE file for full copyright and licensing details.
# Source: https://base-empreinte.ademe.fr/
import base64
import logging
from odoo import fields, models, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

class EsgCarbonBaseImportWizard(models.TransientModel):
    _name = 'esg.carbon.base.import.wizard'
    _description = 'ESG: Carbon Base Import'

    file_ids = fields.One2many('ir.attachment', 'res_id',
        domain=[('res_model', '=', 'esg.carbon.base.import.wizard')],
        string='Tax Files')

    def action_import_file(self):
        self.ensure_one()
        if not self.file_ids:
            raise UserError(_('Please upload a carbon base file first.'))
        def get_existing_factor(existing_factors, new_factor_data):
            related_factor = False
            for existing_factor in existing_factors:
                if existing_factor.code == factor["Identifiant de l'élément"]:
                    related_factor = existing_factor
                    break
            return related_factor
        count = 0
        for tax_file in self.file_ids:
            count += 1
            _logger.info("Importing carbon base file %s/%s", count, len(self.file_ids))
            tax_file_content = base64.b64decode(tax_file.datas).decode('utf-8')
            lines = tax_file_content.split('\r\n')
            dict_keys = lines.pop(0).split(';')
            emission_factors = []
            for line in lines:
                line_data = dict(zip(dict_keys, line.split(';')))
                if line_data["Statut de l'élément"] == "Archivé" or line_data["Type de l'élément"] == "Données source":
                    continue
                emission_factors.append(line_data)
            existing_factors = self.env['esg.emission.factor'].search([
                ('database_id', '=', self.env.ref('esg.esg_provider_ademe')),
            ])
            factors_create_values = []
            for factor in emission_factors:
                related_factor = get_existing_factor(existing_factors, factor)
                emission_factor_data = {
                    'name': "%s %s %s" % (factor["Nom base anglais"], factor["Nom attribut anglais"], factor["Nom attribut anglais"]),
                    'code': factor["Identifiant de l'élément"],
                    'factor_type': 'element' if factor["Type Ligne"] == "Élement" else 'post',
                    'category_code': factor["Code de Catégorie"]
                    # TODO
                    # database_id
                    # valid_from
                    # valid_to
                    # last_update
                    # factor_category_id
                    # tag_ids
                    # emission_line_ids
                    # unit_id
                    # uncertainty
                    # co2_equivalent
                    # co2_equivalent_range_min
                    # co2_equivalent_range_max
                }
                if related_factor:
                    related_factor.write(emission_factor_data)
                else:
                    factors_create_values.append(emission_factor_data)
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'type': 'success',
                'message': _('The files have been successfully imported.'),
            }
        }
