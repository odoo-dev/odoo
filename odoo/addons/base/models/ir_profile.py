import json
import base64
import datetime

from odoo import fields, models, api
from odoo.exceptions import UserError
from odoo.http import request
from odoo.tools.profiler import SpeedscopeResult


class IrProfileSession(models.Model):
    _name = 'ir.profile.session'
    _description = 'Ir profile sessions'
    _order = 'id desc'

    name = fields.Char('Name')
    result_ids = fields.One2many('ir.profile.execution', 'profile_session_id')

    def _action_generate_speedscope(self):
        return self.result_ids._action_generate_speedscope()

    @api.autovacuum
    def _gc_session(self):
        domain = [('create_date', '<', fields.Datetime.now() - datetime.timedelta(days=30))]
        return self.sudo().search(domain).unlink()

    def profiling_enabled(self):
        return request.env['ir.config_parameter'].sudo().get_param('base.profiling_enabled')

    def _update_profiling(self, profile=None, profile_sql=None, profile_traces_sync=None, profile_traces_async=None, **_kwargs):
        if profile:
            if self.profiling_enabled():
                if not request.session.profile_session_id:
                    request.session.profile_session_id = self.create({'name': self.env.user.name}).id
            else:
                raise UserError('Profiling is not enabled on this database')
        elif profile is False:
            request.session.profile_session_id = False

        def check(flag_set, flag, value):
            if value is True:
                flag_set.add(flag)
            elif value is False:
                flag_set.discard(flag)
        profile_modes = set(request.session.profile_modes or [])
        check(profile_modes, 'profile_sql', profile_sql)
        check(profile_modes, 'profile_traces_sync', profile_traces_sync)
        check(profile_modes, 'profile_traces_async', profile_traces_async)
        request.session.profile_modes = list(profile_modes)
        return {
            'profile_session_id': request.session.profile_session_id,
            'profile_modes': request.session.profile_modes,
        }


class IrProfileExcecution(models.Model):
    _name = 'ir.profile.execution'
    _description = 'Ir profile execution'

    description = fields.Char('Description')
    profile_session_id = fields.Many2one('ir.profile.session', ondelete='cascade')
    duration = fields.Float('Duration')

    # results slots

    init_stack = fields.Char('init_stack', prefetch=False)

    sql = fields.Char('Sql', prefetch=False)
    traces_async = fields.Char('Traces Async', prefetch=False)
    traces_sync = fields.Char('Traces Sync', prefetch=False)

    speedscope = fields.Binary('Speedscope', prefetch=False)
    speedscope_url = fields.Char('Open', compute='_compute_url')

    def _compute_url(self):
        url_root = request.httprequest.url_root
        for profile in self:
            if profile.speedscope:
                content_url = '%sweb/content/ir.profile.execution/%s/speedscope' % (url_root, profile.id)
                profile.speedscope_url = '/base/static/lib/speedscope/index.html#profileURL=%s' % content_url
            else:
                profile.speedscope_url = ''

    def _action_generate_speedscope(self):
        for profile in self:
            trace_result = None
            sql_result = None
            #if profile.speedscope:
            #    continue
            if profile.sql: # comment
                sql_result = json.loads(profile.sql)
            if profile.traces_async:
                trace_result = json.loads(profile.traces_async)

             # todo move init_stack to execution and give it to speedscope results

            result = SpeedscopeResult(profile=trace_result.get('result'), sql=sql_result.get('result')).make()
            profile.speedscope = base64.b64encode(json.dumps(result).encode('utf-8'))
