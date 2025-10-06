{
    'name': 'Hackathon Registration',
    'version': '0.1',
    'category': 'Marketing/Events',
    'summary': 'Module for Hackathon Registration',
    'depends': [
        'website', 'event', 'website_event'
    ],
    'data': ['views/hackathon_template.xml', 'views/event_template_page_hackathon.xml'],
    'installable': True,
    'application': True,
}
