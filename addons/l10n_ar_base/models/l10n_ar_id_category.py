from odoo import api, models, fields, _
from odoo.exceptions import ValidationError, UserError
from odoo.osv import expression
from odoo.tools.safe_eval import safe_eval


class ResPartnerIdCategory(models.Model):

    _name = "l10n_ar_id_category"
    _description = "Identification Category"
    _rec_name = "code"
    _order = "sequence"

    code = fields.Char(
        string="Code", size=16, required=True,
        help="Abbreviation or acronym of this ID type. For example, "
             "'driver_license'")
    name = fields.Char(
        string="ID name", required=True, translate=True,
        help="Name of this ID type. For example, 'Driver License'")
    active = fields.Boolean(
        string="Active", default=True,
    )
    validation_code = fields.Text(
        'Python validation code',
        help="Python code called to validate an id number.",
        default=lambda self: self._default_validation_code())

    sequence = fields.Integer(
        default=10,
        required=True,
    )
    afip_code = fields.Integer(
        'AFIP Code',
        required=True
    )

    def _default_validation_code(self):
        return _("\n# Python code. Use failed = True to specify that the id "
                 "number is not valid.\n"
                 "# You can use the following variables :\n"
                 "#  - self: browse_record of the current ID Category "
                 "browse_record\n"
                 "#  - l10n_ar_id_number: l10n_ar_number")

    @api.multi
    def _validation_eval_context(self, l10n_ar_id_number):
        self.ensure_one()
        return {'self': self,
                'l10n_ar_id_number': l10n_ar_id_number,
                }

    # TODO nadie lo llama
    # solo en oca-partner-contact/partner_identification/models/res_partner_id_number.py
    @api.multi
    def validate_id_number(self, l10n_ar_id_number):
        """Validate the given ID number
        The method raises an odoo.exceptions.ValidationError if the eval of
        python validation code fails
        """
        self.ensure_one()
        if self.env.context.get('id_no_validate'):
            return
        eval_context = self._validation_eval_context(l10n_ar_id_number)
        try:
            safe_eval(self.validation_code,
                      eval_context,
                      mode='exec',
                      nocopy=True)
        except Exception as e:
            raise UserError(
                _('Error when evaluating the id_category validation code:'
                  ':\n %s \n(%s)') % (self.name, e))
        if eval_context.get('failed', False):
            raise ValidationError(
                _("%s is not a valid %s identifier") % (
                    self.name, l10n_ar_id_number))

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        args = args or []
        domain = []
        if name:
            domain = [
                '|',
                ('code', '=ilike', name + '%'),
                ('name', operator, name)]
            if operator in expression.NEGATIVE_TERM_OPERATORS:
                domain = ['&', '!'] + domain[1:]
        recs = self.search(domain + args, limit=limit)
        return recs.name_get()
