from openerp import http
from openerp.http import request
from hashlib import md5


class FinancialReportController(http.Controller):

    def get_report_obj_from_name(self, name, id=None):
        uid = request.session.uid
        if name == 'financial_report':
            return request.env['account.financial.report'].sudo(uid)
        if name == 'generic_tax_report':
            return request.env['account.generic.tax.report'].sudo(uid)

    @http.route('/account/<string:report_name>/<string:report_id>', type='http', auth='user')
    def report(self, report_name, report_id=None, **kw):
        uid = request.session.uid
        domain = [('create_uid', '=', uid)]
        report_obj = self.get_report_obj_from_name(report_name)
        if report_name == 'financial_report':
            report_id = int(report_id)
            domain.append(('report_id', '=', report_id))
            report_obj = report_obj.browse(report_id)
        context_obj = request.env['account.report.context.common'].get_context_by_report_name(report_name)
        context_id = context_obj.sudo(uid).search(domain, limit=1)
        if not context_id:
            create_vals = {}
            if report_name == 'financial_report':
                create_vals['report_id'] = report_id
            context_id = context_obj.sudo(uid).create(create_vals)
        if 'xls' in kw:
            response = request.make_response(None,
                headers=[('Content-Type', 'application/vnd.ms-excel'),
                         ('Content-Disposition', 'attachment; filename=' + report_obj.get_name() + '.xls;')])
            context_id.get_xls(response)
            return response
        if 'pdf' in kw:
            return request.make_response(context_id.get_pdf(),
                headers=[('Content-Type', 'application/pdf'),
                         ('Content-Disposition', 'attachment; filename=' + report_obj.get_name() + '.pdf;')])
        if kw:
            update = {}
            for field in context_id._fields:
                if kw.get(field):
                    update[field] = kw[field]
                elif field in ['cash_basis', 'comparison', 'all_entries']:
                    update[field] = False
            context_id.write(update)
        lines = report_obj.get_lines(context_id)
        rcontext = {
            'context': context_id,
            'report': report_obj,
            'lines': lines,
            'mode': 'display',
        }
        return request.render(report_obj.get_template(), rcontext)

    @http.route(['/account/followup_report/all/', '/account/followup_report/all/page/<int:page>'], type='http', auth='user')
    def followup_all(self, page=1, **kw):
        uid = request.session.uid
        context_obj = request.env['account.report.context.followup']
        report_obj = request.env['account.followup.report']
        progressbar_obj = request.env['account.report.followup.progressbar']
        reports = []
        progressbar_id = progressbar_obj.sudo(uid).search([('create_uid', '=', uid)])
        partners = request.env['res.partner'].get_partners_in_need_of_action()
        if not progressbar_id:
            progressbar_id = progressbar_obj.sudo(uid).create({'valuemax': len(partners)})
        if 'partner_done' in kw:
            progressbar_id.write({'valuenow': progressbar_id.valuenow + 1})
        for partner in partners[((page - 1) * 15):(page * 15)]:
            context_id = context_obj.sudo(uid).search([('partner_id', '=', partner.id)], limit=1)
            if not context_id:
                context_id = context_obj.with_context(lang=partner.lang).create({'partner_id': partner.id})
            lines = report_obj.with_context(lang=partner.lang).get_lines(context_id)
            reports.append({
                'context': context_id.with_context(lang=partner.lang),
                'lines': lines,
            })
        rcontext = {
            'reports': reports,
            'report': report_obj,
            'mode': 'display',
            'page': page,
            'progressbar': progressbar_id,
            'just_arrived': 'partner_done' not in kw,
        }
        return request.render('account.report_followup_all', rcontext)

    @http.route('/account/followup_report/<int:partner>/', type='http', auth='user')
    def followup(self, partner, **kw):
        uid = request.session.uid
        context_obj = request.env['account.report.context.followup']
        report_obj = request.env['account.followup.report']
        context_id = context_obj.sudo(uid).search([('partner_id', '=', partner)], limit=1)
        partner = request.env['res.partner'].browse(partner)
        if 'partner_done' in kw:
            partners = request.env['res.partner'].get_partners_in_need_of_action()
            if not partners:
                return self.followup_all(kw=kw)
            partner = partners[0]
        if not context_id:
            context_id = context_obj.with_context(lang=partner.lang).create({'partner_id': partner.id})
        if 'pdf' in kw:
            return request.make_response(context_id.with_context(lang=partner.lang).get_pdf(),
                headers=[('Content-Type', 'application/pdf'),
                         ('Content-Disposition', 'attachment; filename=' + partner.name + '.pdf;')])
        lines = report_obj.with_context(lang=partner.lang).get_lines(context_id)
        rcontext = {
            'context': context_id.with_context(lang=partner.lang),
            'report': report_obj.with_context(lang=partner.lang),
            'lines': lines,
            'mode': 'display',
            'debug': True,
        }
        return request.render('account.report_followup', rcontext)


    @http.route('/account/public_followup_report/<int:partner>/<string:password>', type='http', auth='none')
    def followup_public(self, partner, password, **kw):
        partner = request.env['res.partner'].sudo().browse(partner)
        db_uuid = request.env['ir.config_parameter'].get_param('database.uuid')
        check = md5(str(db_uuid) + partner.name).hexdigest()
        if check != password:
            return request.not_found()
        context_obj = request.env['account.report.context.followup']
        report_obj = request.env['account.followup.report']
        context_id = context_obj.sudo().search([('partner_id', '=', int(partner))], limit=1)
        if not context_id:
            context_id = context_obj.sudo().with_context(lang=partner.lang).create({'partner_id': int(partner)})
        lines = report_obj.sudo().with_context(lang=partner.lang).get_lines(context_id, public=True)
        rcontext = {
            'context': context_id.with_context(lang=partner.lang, public=True),
            'report': report_obj.with_context(lang=partner.lang),
            'lines': lines,
            'mode': 'display',
        }
        return request.render('account.report_followup_public', rcontext)
