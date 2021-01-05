from odoo.http import Controller, request, route


class Debug(Controller):

    @route('/web/debug', type='json', auth='public', sitemap=False)  # should we keep this as http?
    def debug(self, debug=None, tests=None, assets=None):
        # todo use this or remove
        def check(flag_set, flag, value):
            if value is True:
                flag_set.add(flag)
            elif value is False:
                flag_set.discard(flag)

        debug_modes = set(request.session.debug or [])
        check(debug_modes, '1', debug)
        check(debug_modes, 'tests', tests)
        check(debug_modes, 'assets', assets)
        request.session.debug = list(debug_modes)

    @route('/web/profiling', type='json', auth='public', sitemap=False)
    def profile(self, **kwargs):
        return request.env['ir.profile.session']._update_profiling(**kwargs)
