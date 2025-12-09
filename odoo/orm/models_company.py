# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import decorators as api
from .fields import Field
from .fields_relational import Many2one, One2many
from .models import Model, AbstractModel
from .table_objects import Constraint

from odoo.tools import SQL


class CompanyDataModel(Model):
    # XXX meh, cannot be a mixin because we don't have comodel names
    # and cannot be here because not defined in a module (constraint)
    _register = False

    record_id = Many2one(required=True, ondelete='cascade')
    company_id = Many2one('res.company', required=True, ondelete='cascade')

    _company_idx = Constraint('UNIQUE(record_id, company_id)')


def company_data_ids(model_name: str):
    # XXX without o2m, we need to handle invalidation of a m2o and of company_related fields
    comodel_name = f'{model_name}.company_data'
    return One2many(comodel_name, 'record_id', string="Company Data")


def field[T: Field](field_type: type[T], *, company_data_ids: str = 'company_data_ids', compute_sudo=False, **kw) -> T:
    assert 'compute' not in kw, "A computed field is not a company-dependent field."
    assert not kw.get('required'), "A company-dependent field cannot be required."

    @api.depends(lambda _: [f'{company_data_ids}.{field.name}'])
    @api.depends_context('company')
    def compute_company_field(self):
        name = field.name
        company = self.env.company
        for rec in self:
            rec[name] = rec[company_data_ids].filtered(lambda d: d.company_id == company)[name]

    def inverse_company_field(self):
        name = field.name
        company = self.env.company
        for rec in self:
            data = rec[company_data_ids].filtered(lambda d: d.company_id == company)
            if data:
                data[name] = rec[name]
            elif rec.id:
                data.create({'record_id': rec.id, 'company_id': rec.env.company.id, name: rec[name]})
            else:
                rec[company_data_ids] = data.new({'record_id': rec.id, 'company_id': rec.env.company.id, name: rec[name]})

    def compute_sql_company_field(self, table):
        data_model = self.env[self._fields[company_data_ids].comodel_name]
        company_id = self.env.company.id or 0
        alias = table._make_alias(f'{company_data_ids}_{company_id}', data_model)
        table._query.add_join(
            'LEFT JOIN',
            alias,
            None,
            SQL("%s = %s AND %s = %s", table.id, alias.record_id, alias.company_id, company_id)
        )
        return alias[field.name]

    field = field_type(
        **kw,
        compute=compute_company_field,
        compute_sql=compute_sql_company_field,
        inverse=inverse_company_field,
        compute_sudo=compute_sudo,
    )
    return field
