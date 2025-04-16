# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    l10n_lv_transaction_type = fields.Selection(
        selection=[
            # Sale, PVN/1III
            ('sale_S', '(S) Transactions referred to in Article 16(4)'),
            ('sale_P', '(P) Services supplied to taxable persons established in other EU member states'),
            ('sale_G', '(G) Goods supplied to taxable persons established in other EU member states (not to be used for declarations declared under codes "E" or "N")'),
            ('sale_C', '(C) Supply of goods in accordance with the fifth paragraph of Article 45 of the Law'),
            ('sale_N', '(N) Supply of goods within the territory of the European Union at the time referred to in Article 31.1 of the Law, if delivered to a warehouse in another member state'),
            ('sale_E1', '(E1) Dispatch of goods'),
            ('sale_E2', '(E2) Return of goods'),
            ('sale_E3', '(E3) Replacement of the original consignee'),
            ('sale_E4', '(E4) Partial replacement of the original consignee'),
            # NOTE: / TODO:
            # Codes "N" and "E" are valid from 01.01.2020

            # Purchase, PVN/1I
            ('purchase_domestic_I', '(I) Import'),
            ('purchase_domestic_A', '(A) Transaction with a registered taxable person or a taxable person of another Member State or established in another Member State'),
            ('purchase_domestic_C', '(C) Purchase and Importation of passenger cars'),
            # TODO: (N) does not make much sense as a transaction type on tax level
            ('purchase_domestic_N', '(N) The Counterparty does not have a VAT registration number'),
            ('purchase_domestic_K', '(K) Compensation paid to a farmer'),
            # TODO: (T) & (V) & (Z) do not make much sense as a transaction type on tax level
            ('purchase_domestic_T', '(T) Transactions below 150€'),
            ('purchase_domestic_V', '(V) Transactions with a single counterparty below 150€ for a total amount above 150€'),
            ('purchase_domestic_Z', '(Z) Lost Debts'),
            ('purchase_domestic_R1', '(R1) Timber Transactions'),
            ('purchase_domestic_R2', '(R2) Transactions in scrap'),
            ('purchase_domestic_R3', '(R3) Construction serices'),
            ('purchase_domestic_R4', '(R4) Mobile phones, tables, laptops and integrated circuit devices and games; supply of computer and circuit board devices (R&R) and consoles'),
            ('purchase_domestic_R5', '(R5) Supply of cereals and industrial crops'),
            ('purchase_domestic_R6', '(R6) Supply of unwrought precious metals, previous metal alloys and precious metal clad metals'),
            ('purchase_domestic_R7', '(R7) Transactions in fabricated metal products'),
            # TODO: do we need transaction types whose validity ends in 2019?
            ('purchase_domestic_R8', '(R8) Supply of household electronic equipment and household electrical appliances (valid for the tax period ending 31.12.2019)'),
            ('purchase_domestic_R9', '(R9) Supply of construction producs (valid for the tax period ending 31.12.2019)'),
            ('purchase_domestic_M', '(M) Amount of tax on the purchase of property at an auction held by a bailiff (valid for the tax period from 01.01.2021)'),
            # NOTE: / TODO:
            # If transactions with type R1, R2, R3, R4, R5, R6, R7, R8 or R9 are indicated, they must also be included in fields
            # <R52> and <R62> of the table <PVN>
            # If transactions with type C are indicated, they must also be included in the field
            # <R62> of the table <RVAT> (TODO:?:)

            # Purchase, PVN/1II
            ('purchase_eu_P', '(P) services'),
            ('purchase_eu_G', '(G) goods'),
            ('purchase_eu_C', '(C) receipt of goods in accordance with the third paragraph of Article 9 of the law'),
        ],
        string="Transaction Type (Latvia)",
    )
