from odoo.http import request, route, Controller

class MySubscription(Controller):
    @route("/mysubscription", auth="user")
    def my_subscription(self):
        return request.render(
            "mysubscription.dashboard",
            {
                'session_info': request.env['ir.http'].get_frontend_session_info(),
            }
        )
