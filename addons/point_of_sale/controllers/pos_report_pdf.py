import json

from odoo.http import Controller, request, route
from odoo.http.stream import content_disposition


class PosReportPDFController(Controller):

    @route('/pos_reports', type='http', auth='user', methods=['POST'], csrf=False)
    def download_pos_report_pdf(self, report_id, export_format='pdf', options=None, **kwargs):
        report = request.env['pos.report'].with_user(request.env.uid).browse(int(report_id))
        if not report.exists():
            return request.make_response(
                json.dumps({'error': 'Report not found'}),
                headers=[('Content-Type', 'application/json')],
                status=404,
            )

        parsed_options = json.loads(options) if options else {}

        try:
            result = report.export_to_pdf(parsed_options)
            file_content = result['file_content']
            file_name = result['file_name']

            headers = [
                ('Content-Type', 'application/pdf'),
                ('Content-Disposition', content_disposition(file_name)),
                ('Content-Length', str(len(file_content))),
            ]
            return request.make_response(file_content, headers=headers)

        except Exception as e:
            return request.make_response(
                json.dumps({'error': str(e)}),
                headers=[('Content-Type', 'application/json')],
                status=500,
            )
