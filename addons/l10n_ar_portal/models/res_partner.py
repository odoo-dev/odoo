##############################################################################
# For copyright and license notices, see __manifest__.py file in module root
# directory
##############################################################################
from odoo import models, api, _
import logging
_logger = logging.getLogger(__name__)


class ResPartner(models.Model):

    @api.model
    def try_write_commercial(self, data):
        """ User for website. capture the validation errors and return them.
        return (error, error_message) = (dict[fields], list(str()))
        """
        error = dict()
        error_message = []
        l10n_ar_id_number = data.get('l10n_ar_id_number', False)
        l10n_ar_id_category_id = data.get('l10n_ar_id_category_id', False)
        afip_responsability_type_id = data.get('afip_responsability_type_id',
                                               False)

        if l10n_ar_id_number and l10n_ar_id_category_id:
            commercial_partner = self.env['res.partner'].sudo().browse(
                int(data.get('commercial_partner_id', False)))
            try:
                values = {
                    'l10n_ar_id_number': l10n_ar_id_number,
                    'l10n_ar_id_category_id': int(l10n_ar_id_category_id),
                    'afip_responsability_type_id':
                        int(afip_responsability_type_id)
                        if afip_responsability_type_id else False,
                }
                commercial_fields = ['l10n_ar_id_number', 'l10n_ar_id_category_id',
                                     'afip_responsability_type_id']
                values = commercial_partner.remove_readonly_required_fields(
                    commercial_fields, values)
                with self.env.cr.savepoint():
                    commercial_partner.write(values)
            except Exception as exception_error:
                _logger.error(exception_error)
                error['l10n_ar_id_number'] = 'error'
                error['l10n_ar_id_category_id'] = 'error'
                error_message.append(_(exception_error))
        return error, error_message

    @api.multi
    def remove_readonly_required_fields(self, required_fields, values):
        """ In some cases we have information showed to the user in the form
        that is required but that is already set and readonly.
        We do not really update this fields and then here we are trying to
        write them: the problem is that this fields has a constraint if
        we are trying to re-write them (even when is the same value).

        This method remove this (field, values) for the values to write in
        order to do avoid the constraint and not re-writted again when they
        has been already writted.

        param: @required_fields: (list) fields of the fields that we want to
               check
        param: @values (dict) the values of the web form

        return: the same values to write and they do not include
        required/readonly fields.
        """
        self.ensure_one()
        for r_field in required_fields:
            value = values.get(r_field)
            if r_field.endswith('_id'):
                if self[r_field].id == value:
                    values.pop(r_field, False)
            else:
                if self[r_field] == value:
                    values.pop(r_field, False)
        return values
