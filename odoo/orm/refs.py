from __future__ import annotations

import typing

from odoo.exceptions import UserError

if typing.TYPE_CHECKING:
    from odoo.tools.translate import LazyGettext

    from .environments import Environment
    from .models import BaseModel


class Ref:
    """ Declares that the code of a model depends on the record with the given
    XML ID.

    .. code-block:: python

        class SaleOrder(models.Model):
            _inherit = 'sale.order'

            _quote_template = models.Ref('sale.email_template_edi_sale', 'mail.template')
            _upsell_type = models.Ref('sale_upsell.activity_upsell', 'mail.activity.type', required=False)

            def action_quotation_send(self):
                template = self._quote_template
                ...

    On a recordset, the attribute returns the referenced record, browsed in the
    environment of the recordset.  On the class, it returns the declaration.

    A required reference protects its record: deleting it, directly or through
    a cascade, and deleting or renaming its XML ID are refused, as long as the
    declaring module is installed.  When the record is missing anyway, accessing
    the attribute raises a :class:`~odoo.exceptions.UserError` telling which
    module to update.

    An optional reference protects nothing, and returns an empty recordset of
    its model when the record is missing, or ``None`` when its model is not
    installed.  Declare records that users may delete as optional, and handle
    their absence where they are used.

    :param xmlid: the XML ID of the record, as ``'module.name'``
    :param model: the model of the record
    :param required: whether the record is required by the code, and thus
        protected
    :param message: the error message shown when deleting the protected record
        is refused, as a lazy translation (``_lt``) that may contain the
        placeholder ``%(name)s`` for the display name of the record
    """
    name: str = ''
    _module: str = ''

    def __init__(
        self,
        xmlid: str,
        model: str,
        *,
        required: bool = True,
        message: LazyGettext | None = None,
    ) -> None:
        module, _sep, name = xmlid.partition('.')
        assert module and name, f"Invalid XML ID {xmlid!r}, expecting 'module.name'"
        self.xmlid = xmlid
        self.model = model
        self.required = required
        self.message = message

    def __set_name__(self, owner, name):
        # like table objects, references are private members of the class
        assert name.startswith('_'), "Names of references in a model must start with '_'"
        assert not name.startswith(f"_{owner.__name__}__"), "Names of references must not be mangled"
        self.name = name
        if getattr(owner, 'pool', None) is None:  # models.is_model_definition(owner)
            # only for definition classes, not registry classes
            self._module = owner._module
            owner._ref_definitions.append(self)

    @typing.overload
    def __get__(self, records: None, owner: type | None = None) -> Ref: ...

    @typing.overload
    def __get__(self, records: BaseModel, owner: type | None = None) -> BaseModel: ...

    def __get__(self, records, owner=None):
        if records is None:
            return self
        return self.resolve(records.env)

    def resolve(self, env: Environment) -> BaseModel | None:
        """ Return the referenced record in ``env``.  If the reference is
        optional and the record is missing, return an empty recordset, or
        ``None`` if the model is not installed.
        """
        res_model, res_id = env['ir.model.data']._xmlid_to_res_model_res_id(self.xmlid)
        if not res_id or res_model not in env:
            if self.required:
                raise UserError(env._(
                    "The record %(xmlid)s, required by the module %(module)s, is missing."
                    " Update the module %(xmlid_module)s to restore it.",
                    xmlid=self.xmlid,
                    module=self._module or self.xmlid_module,
                    xmlid_module=self.xmlid_module,
                ))
            return env[self.model] if self.model in env else None
        if res_model != self.model:
            raise TypeError(
                f"{self}: the XML ID references a record of model {res_model!r}"
            )
        return env[res_model].browse(res_id)

    @property
    def xmlid_module(self) -> str:
        """ The module defining the referenced record. """
        return self.xmlid.partition('.')[0]

    def get_error_message(self, record: BaseModel) -> str:
        """ Return the custom message for refusing to delete ``record``, in the
        language of its environment, or an empty string. """
        if not self.message:
            return ''
        return record.env._(self.message) % {'name': record.sudo().display_name}

    def __repr__(self) -> str:
        return f"Ref({self.xmlid!r}, {self.model!r}, required={self.required!r})"

    def __str__(self) -> str:
        return f"{self._module or '?'}:{self.name or '?'} -> {self.xmlid} ({self.model})"
