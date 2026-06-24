# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    "name": "HabitFlow",
    "summary": "OWL 3.0 habit tracker",
    "description": """
		HabitFlow is a habit tracking app built with OWL 3.0 inside Odoo.
		It helps users create habits, mark them as done daily, track streaks,
		and view automatic dashboard summaries.
	""",
    "category": "Productivity",
    "version": "1.0",
    "depends": ["web"],
    "data": [
        "views/habit_flow_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "habit_flow/static/src/**/*.js",
            "habit_flow/static/src/**/*.xml",
            "habit_flow/static/src/**/*.scss",
        ],
    },
    "installable": True,
    "application": True,
    "license": "LGPL-3",
}
