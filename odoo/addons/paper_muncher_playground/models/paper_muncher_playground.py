import base64

from odoo import models, fields
from odoo.tools.paper_muncher import run_paper_muncher


class PaperMuncherPlayground(models.Model):
    _name = 'paper.muncher.playground'
    _description = 'Paper Muncher Playground'

    name = fields.Char(
        string='Name',
        help='Name of the playground entry.',
    )

    pdf = fields.Binary(
        string='PDF File',
        help='Generated PDF file from Paper Muncher',
        readonly=True,
    )
    pdf_filename = fields.Char(
        string='PDF Filename',
        default='paper_muncher_playground.pdf',
    )

    html = fields.Text(
        string='HTML Content',
        help='Generated HTML content from Paper Muncher',
        required=True,
        default="""
         <!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <title>My Wonderful Template</title>
                <style>
                    @page {
                        @top-left {
                            content: "";
                        }
                        @bottom-left {
                            content: "";
                        }
                    }
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                    }
                    h1 {
                        color: #333;
                    }
                </style>
            </head>

            <body>

                <h1>My wonderful template</h1>

            </body>
        </html>
        """
    )

    paper_format = fields.Many2one(
        'report.paperformat',
        string='Paper Format',
        help='The paper format to be used for the PDF generation.',
    )
    is_landscape = fields.Boolean(
        string='Landscape Orientation',
        help='If checked, the PDF will be generated in landscape orientation.',
    )

    def action_compute_pdf(self):
        self.ensure_one()
        self.pdf = base64.b64encode(
            run_paper_muncher(
                paperformat=self.paper_format,
                bodies=[self.html],
                landscape=self.is_landscape,
            )
        ).decode('utf-8')
        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
            'params': {
                'model': self._name,
                'res_id': self.id,
            },
        }
