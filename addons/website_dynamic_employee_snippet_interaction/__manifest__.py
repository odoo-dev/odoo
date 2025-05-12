{
    "name": "Dynamic Employee Snippet",
    "category": "Website/Website",
    "summary": "Show dynamic employee information on your website",
    "version": "1.0",
    "description": """
    This module allows you to display employee information dynamically on your website. It provides a snippet that can be added to any page, allowing you to showcase your team members effectively.
    """,
    "depends": ["website", "hr"],
    "data": [
        "views/snippets/employees_card.xml",
        "data/dynamic_employee_card_tour.xml",
    ],
    "assets": {
        "web.assets_frontend": [
            "website_dynamic_employee_snippet_interaction/static/src/snippets/**/*",
            (
                "remove",
                "website_dynamic_employee_snippet_interaction/static/src/snippets/s_website_dynamic_employee_card/options.js",
            ),
        ],
        "website.assets_wysiwyg": [
            "website_dynamic_employee_snippet_interaction/static/src/snippets/s_website_dynamic_employee_card/options.js"
        ],
        "web.assets_tests": [
            "website_dynamic_employee_snippet_interaction/static/tests/**/*",
        ],
    },
    "installable": True,
    "author": "Darpan",
    "license": "LGPL-3",
}
