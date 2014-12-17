# -*- coding: utf-8 -*-
from openerp import http

# class ProjectActivity(http.Controller):
#     @http.route('/project_activity/project_activity/', auth='public')
#     def index(self, **kw):
#         return "Hello, world"

#     @http.route('/project_activity/project_activity/objects/', auth='public')
#     def list(self, **kw):
#         return http.request.render('project_activity.listing', {
#             'root': '/project_activity/project_activity',
#             'objects': http.request.env['project_activity.project_activity'].search([]),
#         })

#     @http.route('/project_activity/project_activity/objects/<model("project_activity.project_activity"):obj>/', auth='public')
#     def object(self, obj, **kw):
#         return http.request.render('project_activity.object', {
#             'object': obj
#         })