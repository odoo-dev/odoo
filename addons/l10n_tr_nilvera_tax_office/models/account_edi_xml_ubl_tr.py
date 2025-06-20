from lxml import etree
from collections import defaultdict
import copy

from odoo import models


class AccountEdiXmlUblTr(models.AbstractModel):
    _inherit = "account.edi.xml.ubl.tr"

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _get_partner_party_tax_scheme_vals_list(self, partner, role):
        """Extend partner tax scheme values to include the Turkish tax office name.

        Adds the tax office name to the `tax_scheme_vals`
        if it exists on the partner.

        :param partner: The partner (customer or supplier).
        :param role: The role in the invoice (e.g. buyer or seller).
        :return: A list of tax scheme dictionaries including the tax office name if applicable.
        """
        vals_list = super()._get_partner_party_tax_scheme_vals_list(partner, role)

        for vals in vals_list:
            if partner.l10n_tr_tax_office_id:
                vals["tax_scheme_vals"].update(
                    {"id": "", "name": partner.l10n_tr_tax_office_id.name}
                )
        return vals_list
