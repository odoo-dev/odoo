# -*- coding: utf-8 -*-
# License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl.html).
from openupgradelib import openupgrade
from openupgradelib.openupgrade import logged_query

# modelos renombrados en l10n_ar_invoice
model_renames = [
    # a account_document
    ('afip.document_class', 'account.document.type'),
    ('account.journal.afip_document_class', 'account.journal.document.type'),
    # a l10n_ar_account
    ('afip.document_letter', 'account.document.letter'),
    ('afip.responsability', 'afip.responsability.type'),
    # a l10n_ar_partner
    ('afip.document_type', 'res.partner.id_category'),
]

table_renames = [
    ('afip_document_class', 'account_document_type'),
    ('account_journal_afip_document_class', 'account_journal_document_type'),
    ('afip_document_letter', 'account_document_letter'),
    ('afip_responsability', 'afip_responsability_type'),
    ('afip_document_type', 'res_partner_id_category'),
    # m2m fields
    ('afip_doc_letter_issuer_rel', 'account_doc_let_responsability_issuer_rel'),
    ('afip_doc_letter_receptor_rel', 'account_doc_let_responsability_receptor_rel'),
]

# campos renombrados en l10n_ar_invoice
column_renames = {
    'account_doc_let_responsability_issuer_rel': [
        ('responsability_id', 'afip_responsability_type_id'),
    ],
    'account_doc_let_responsability_receptor_rel': [
        ('responsability_id', 'afip_responsability_type_id'),
    ],
    'account_document_type': [
        ('afip_code', 'code'),
        ('document_type', 'internal_type'),
    ],
    'res_partner': [
        ('document_type_id', 'main_id_category_id'),
        ('responsability_id', 'afip_responsability_type_id'),
    ],
    'account_invoice': [
        ('journal_document_class_id', 'journal_document_type_id'),
        ('afip_document_class_id', 'document_type_id'),
        ('afip_document_number', 'document_number'),
    ],
    'account_move': [
        ('document_class_id', 'document_type_id'),
        # backup old doc number column so we can create new column
        ('document_number', None),
        ('afip_document_number', 'document_number'),
    ],
    'account_journal_document_type': [
        ('afip_document_class_id', 'document_type_id'),
    ],
}


@openupgrade.migrate()
def migrate(cr, version):

    openupgrade.rename_models(cr, model_renames)
    openupgrade.rename_tables(cr, table_renames)
    openupgrade.rename_columns(cr, column_renames)
    fix_data_on_l10n_ar_account(cr)
    fix_data_on_l10n_ar_partner(cr)


def fix_data_on_l10n_ar_account(cr):
    """
    because in apriori we rename l10n_ar_invoice to account_document, but
    not some things are done on l10n_ar_account, we fix this
    """
    # pasamos de a account_account a l10n_ar_account
    old_name = 'account_document'
    new_name = 'l10n_ar_account'

    l10n_ar_account_data_models = [
        'afip.responsability.type',
        'account.document.type',
    ]
    l10n_ar_account_models = [
        'afip.responsability.type',
        'afip.incoterm',
        'account.document.letter'
    ]

    update_data_module_name(
        cr, l10n_ar_account_data_models, old_name, new_name)
    update_models_module_name(
        cr, l10n_ar_account_models, old_name, new_name)


def fix_data_on_l10n_ar_partner(cr):
    # pasamos de a account_account a l10n_ar_partner
    old_name = 'account_document'
    new_name = 'l10n_ar_partner'

    l10n_ar_partner_data_models = [
        'res.partner',
        'res.partner.id_category',
        'res.partner.title',
    ]

    update_data_module_name(
        cr, l10n_ar_partner_data_models, old_name, new_name)


def update_data_module_name(cr, models, old_name, new_name):
    """
    fix data has been assigend to account_account but is loaded by
    l10n_ar_account
    """
    for model in models:
        query = ("UPDATE ir_model_data SET module = %s "
                 "WHERE module = %s and model = %s")
        logged_query(cr, query, (new_name, old_name, model))


def update_models_module_name(cr, models, old_name, new_name):
    """
    This models are still from l10n_ar_account and not from account_document
    Deal with changed module names of certified modules
    in order to prevent  'certificate not unique' error,
    as well as updating the module reference in the
    XML id.

    :param namespec: tuple of (old name, new name)
    """
    for model in models:
        # renombramos la data
        query = ("UPDATE ir_model_data SET module = %s "
                 "WHERE module = %s and model = %s")
        logged_query(cr, query, (new_name, old_name, model))

        # renombamos la info del model
        query = ("UPDATE ir_model_data SET module = %s "
                 "WHERE module = %s and name = %s and model='ir.model'")
        logged_query(
            cr, query,
            (new_name, old_name, "model_%s" % model.replace('.', '_')))

        # renombamos la info de fields
        query = ("UPDATE ir_model_data SET module = %s "
                 "WHERE module = %s and name LIKE %s "
                 "and model='ir.model.fields'")
        logged_query(
            cr, query,
            (new_name, old_name, "field_%s%%" % model.replace('.', '_')))
