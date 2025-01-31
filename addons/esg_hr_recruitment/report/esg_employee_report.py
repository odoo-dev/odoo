from odoo import fields, models


class EsgEmployeeReport(models.Model):
    _inherit = "esg.employee.report"

    contract_type_id = fields.Many2one("hr.contract.type", readonly=True)

    def _select(self):
        return super()._select() + """,
            job.contract_type_id
        """

    def _from(self):
        return super()._from() + """
            LEFT JOIN hr_job job ON e.job_id = job.id
        """

    def _group_by(self):
        return super()._group_by() + """,
            job.contract_type_id
        """
