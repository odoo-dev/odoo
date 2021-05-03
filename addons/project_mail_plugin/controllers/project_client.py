
from odoo import http
from odoo.http import request
from odoo.tools import html2plaintext, html_sanitize


class ProjectClient(http.Controller):
    @http.route('/mail_plugin/project/search', type='json', auth='outlook', cors="*")
    def projects_search(self, search_term, limit=5):
        """
        Used in the plugin side when searching for projects.
        Fetches projects that have names containing the search_term.
        """
        projects = request.env['project.project'].search([('name', 'ilike', search_term)], limit=limit)

        return [
            {
                'project_id': project.id,
                'name': project.name,
            }
            for project in projects
        ]

    @http.route('/mail_plugin/task/create', type='json', auth='outlook', cors="*")
    def task_create(self, email_subject, email_body, project_id, partner_id):

        partner = request.env['res.partner'].browse(partner_id).exists()
        if not partner:
            return {'error': 'partner_not_found'}

        if not request.env['project.project'].browse(project_id).exists():
            return {'error': 'project_not_found'}

        record = request.env['project.task'].create({
            'name': html2plaintext(email_subject),
            'partner_id': partner_id,
            'description': html_sanitize(email_body),
            'project_id': project_id,
            'user_id': request.env.uid,
        })

        return {'task_id': record.id, 'company_id': record.company_id.id}

    @http.route('/mail_plugin/project/create', type='json', auth='outlook', cors="*")
    def project_create(self, name):
        record = request.env['project.project'].create({'name': name})
        return {"project_id": record.id, "name": record.name}
