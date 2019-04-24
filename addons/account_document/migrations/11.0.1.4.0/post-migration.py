from openupgradelib import openupgrade


@openupgrade.migrate()
def migrate(env, version):
    openupgrade.load_data(
        env.cr, 'account_document',
        'migrations/11.0.1.4.0/mig_data.xml')
    mail_template = env.ref('account.email_template_edi_invoice')
    translations = env['ir.translation'].search([
        ('res_id', '=', mail_template.id),
        ('name', '=like', 'mail.template,%')])
    translations.unlink()
    langs = env['res.lang'].search([('translatable', '=', True)])
    filter_lang = [lang.code for lang in langs]
    env['ir.translation'].load_module_terms(['account_document'], filter_lang)
