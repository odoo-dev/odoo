{
    "name": "Hackathon Registration",
    "version": "0.1",
    "category": "Marketing/Events",
    "summary": "Module for Hackathon Registration",
    "depends": ["website", "event", "website_event"],
    "data": [
        "security/ir.model.access.csv",
        "views/hackathon_template.xml",
        "views/event_template_page_hackathon.xml",
        "views/inherited_navbar_template.xml",
        "views/event_registration_views.xml",
        "views/event_type_views.xml",
        "views/event_registration_stage_views.xml",
    ],
    "installable": True,
    "application": True,
}
