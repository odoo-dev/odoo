from . import models
from . import controllers


def _post_init_hook_create_stripe_journal(env):
    for company in env['res.company'].search([], order="parent_path"):
        if not company.stripe_journal_id:
            journal_xmlid = f"hr_expense_stripe.{company.id}_stripe_issuing_journal"
            existing_journal = env.ref(journal_xmlid, raise_if_not_found=False)
            if not existing_journal:
                AccountJournal = env['account.journal'].with_company(company)
                journal = AccountJournal.create([{
                    'code': 'STRPI',
                    'name': 'Stripe Issuing',
                    'type': 'bank',
                }])
                env['ir.model.data']._update_xmlids(
                    [{
                        'xml_id': journal_xmlid,
                        'record': journal,
                        'noupdate': True,
                    }]
                )
            else:
                journal = existing_journal
            if not journal.active:
                journal.active = True
            company.stripe_journal_id = journal.id