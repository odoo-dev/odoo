from odoo import models, api, fields
from odoo.exceptions import UserError, ValidationError
import time
from dateutil.relativedelta import relativedelta
import logging
import random

_logger = logging.getLogger(__name__)

class SaleMassGenerator(models.Model):
    _name = "sale.mass.generator"
    _description = "Generate Mass Demo Sales + Invoices"

    @api.model
    def _get_demo_company(self, name="My Belgian Company"):
        """Return the demo company"""
        company = self.env["res.company"].search([("name", "=", name)], limit=1)
        if not company:
            company = self.env["res.company"].search([], limit=1)
        return company

    @api.model
    def action_generate_mass_data(self, total_count=1000, batch_size=100, journal_name="Sales"):
        """Generate massive sales + invoices targeting a specific journal"""

        # Check required models
        for model_name in ["sale.order", "account.move", "account.journal", "product.product"]:
            if model_name not in self.env:
                raise UserError(f"Required model '{model_name}' is not available. Ensure required modules are installed.")

        company = self._get_demo_company()
        env = self.env
        cr = env.cr

        start_time = time.time()
        _logger.info("Starting bulk generation for company: %s", company.name)

        # Fetch a saleable product
        product = env["product.product"].search([
            ("sale_ok", "=", True),
            ("company_id", "in", [company.id, False]),
            ("recurring_invoice", "=", False),
        ], limit=1)
        recurring_product = env["product.product"].search([
            ("sale_ok", "=", True),
            ("company_id", "in", [company.id, False]),
            ("recurring_invoice", "=", True),
        ], limit=1)
        if not product:
            product = env["product.product"].create({
                'name': 'Demo Sale Product',
                'type': 'consu',
                'sale_ok': True,
                'list_price': 100.0,
                'company_id': company.id,
            })
            recurring_product = env["product.product"].create({
                'name': 'Demo Recurring Sale Product',
                'type': 'service',
                'sale_ok': True,
                'list_price': 200.0,
                'recurring_invoice': True,
                'company_id': company.id,
            })
        _logger.info("Using product: %s", product.display_name)

        # Ensure product invoices on ordered quantity
        if product.invoice_policy != "order":
            product.write({"invoice_policy": "order"})
        # Optional: make it consumable to avoid stock moves
        product.write({"type": "consu"})

        uom_id = product.uom_id.id
        income_account = product.property_account_income_id.id or product.categ_id.property_account_income_categ_id.id
        if not income_account:
            income_account = env["account.account"].create({
                "name": "Misc Income",
                "code": "MISCINC",
                "account_type": "income",
            }).id

        # Fetch demo partners
        partners = env["res.partner"].search([
            ("customer_rank", ">", 0),
            ("company_id", "in", [company.id, False])
        ], limit=50)
        if not partners:
            partners = env["res.partner"].create([{
                "name": f"Demo Customer {i+1}",
                "customer_rank": 1,
                "company_id": company.id,
            } for i in range(10)])

        # Fetch the specific journal
        journal = env["account.journal"].search([
            ("name", "=", journal_name),
            ("company_id", "=", company.id)
        ], limit=1)
        if not journal:
            journal = env["account.journal"].search([
                ("code", "=", f"{journal_name[:2].upper()}{company.name[:3].upper()}"),
                ("company_id", "=", company.id)
            ], limit=1)
        if not journal:
            journal = env["account.journal"].create({
                "name": journal_name,
                "code": f"{journal_name[:2].upper()}{company.name[:3].upper()}",
                "type": "sale",
                "company_id": company.id,
            })
            _logger.info("Created journal: %s", journal.name)
        # Ensure warehouse exists
        warehouse = env["stock.warehouse"].search([("company_id", "=", company.id)], limit=1)
        if not warehouse:
            warehouse = env["stock.warehouse"].create({
                "name": f"{company.name} Warehouse",
                "code": f"{company.name[:5].upper()}WH",
                "company_id": company.id,
            })
            _logger.info("Created warehouse: %s", warehouse.name)

        created_orders = 0
        batch_no = 0

        while created_orders < total_count:
            batch_no += 1
            to_create = min(batch_size, total_count - created_orders)
            _logger.info("Starting batch %s: creating %s orders...", batch_no, to_create)

            # Prepare sales orders
            order_vals = []
            for i in range(to_create):
                partner = partners[(created_orders + i) % len(partners)]
                order_vals.append({
                    "partner_id": partner.id,
                    "company_id": company.id,
                    "order_line": [(0, 0, {
                        "product_id": product.id,
                        "name": product.name,
                        "product_uom_qty": random.randint(1, 10) * 1.0,
                        "product_uom_id": uom_id,
                        "price_unit": round(random.uniform(50, 1000), 2),
                    }), (0, 0, {
                        "product_id": recurring_product.id,
                        "name": recurring_product.name,
                        "product_uom_qty": random.randint(1, 5) * 1.0,
                        "product_uom_id": uom_id,
                        "price_unit": round(random.uniform(100, 500), 2),
                    })], 
                    "note": "Generated by Mass Demo Generator",
                    "warehouse_id": warehouse.id,
                    # recurring  monthly order
                    "plan_id": self.env["sale.subscription.plan"].search([("name", "=", "Monthly")], limit=1).id,
                })
                _logger.debug("Prepared order for partner: %s (at price: %.2f, qty: %.2f)", partner.name, order_vals[-1]["order_line"][0][2]["price_unit"], order_vals[-1]["order_line"][0][2]["product_uom_qty"])

            # Create sales orders
            orders = env["sale.order"].sudo().create(order_vals)

            cr.commit()
            created_orders += to_create
            _logger.info("Batch %s done — total created: %s", batch_no, created_orders)

        total_time = round(time.time() - start_time, 2)
        msg = f"✅ Created {created_orders} demo sales + invoices in journal '{journal_name}' in {total_time}s"
        _logger.info(msg)

        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": "Generation Complete",
                "message": msg,
                "sticky": False,
            },
        }
    

class PayrollMassGenerator(models.Model):
    _name = "payroll.mass.generator"
    _description = "Generate Mass Demo Payslips"

    @api.model
    def _get_demo_company(self, name="My Belgian Company"):
        """Return the demo company"""
        company = self.env["res.company"].search([("name", "=", name)], limit=1)
        if not company:
            company = self.env["res.company"].search([], limit=1)
        return company


    def action_generate_mass_employees_with_active_contracts(self, total_count=1000, batch_size=100):
        """Generate massive employees with active contracts"""

        # Check required models
        for model_name in ["hr.employee", "hr.contract"]:
            if model_name not in self.env:
                raise UserError(f"Required model '{model_name}' is not available. Ensure required modules are installed.")

        company = self._get_demo_company()
        env = self.env
        cr = env.cr

        start_time = time.time()
        _logger.info("Starting bulk employee/contract generation for company: %s", company.name)

        # Fetch demo departments
        departments = env["hr.department"].search([
            ("company_id", "in", [company.id, False])
        ], limit=10)
        if not departments:
            raise UserError(f"No demo departments found for {company.name}")

        # Fetch demo job positions
        jobs = env["hr.job"].search([
            ("company_id", "in", [company.id, False])
        ], limit=10)
        if not jobs:
            jobs = self.env["hr.job"].create({
                "name": "Demo Job Position",
                "company_id": company.id,
            })
        created_employees = 0
        batch_no = 0

        while created_employees < total_count:
            batch_no += 1
            to_create = min(batch_size, total_count - created_employees)
            _logger.info("Starting batch %s: creating %s employees...", batch_no, to_create)

            # Prepare employees
            employee_vals = []
            contract_vals = []
            for i in range(to_create):
                name = f"Demo Employee {created_employees + i + 1}"
                department = departments[(created_employees + i) % len(departments)]
                job = jobs[(created_employees + i) % len(jobs)]
                employee_vals.append({
                    "name": name,
                    "company_id": company.id,
                    "department_id": department.id,
                    "job_id": job.id,
                })
                _logger.debug("Prepared employee: %s (Dept: %s, Job: %s)", name, department.name, job.name)

            # Create employees
            employees = env["hr.employee"].sudo().create(employee_vals)

            # Prepare and create contracts
            for emp in employees:
                contract_vals.append({
                    "name": f"Contract for {emp.name}",
                    "employee_id": emp.id,
                    "company_id": company.id,
                    "wage": random.randint(200 , 500) * 100.0,
                    "state": "open",
                    "date_start": fields.Date.today().replace(day=1, month=1) - relativedelta(years=5),
                    "date_end": False,
                })

            env["hr.contract"].sudo().create(contract_vals)
            cr.commit()
            created_employees += to_create
            _logger.info("Batch %s done — total created: %s", batch_no, created_employees)
        total_time = round(time.time() - start_time, 2)
        msg = f"✅ Created {created_employees} demo employees with active contracts in {total_time}s"

        _logger.info(msg)

        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": "Generation Complete",
                "message": msg,
                "sticky": False,
            },
        }

    def action_generate_mass_payslips(self, batch_size=100):
        # generate payslips for all employees with active contracts in the company for the whole year

        # Check required models
        for model_name in ["hr.employee", "hr.contract", "hr.payslip"]:
            if model_name not in self.env:
                raise UserError(f"Required model '{model_name}' is not available. Ensure required modules are installed.")

        company = self._get_demo_company()
        env = self.env
        cr = env.cr
        start_time = time.time()
        _logger.info("Starting bulk payslip generation for company: %s", company.name)
        employees_bare = env["hr.employee"].search([
            ("company_id", "=", company.id),
            ("contract_ids.state", "=", "open"),
        ])

        if not employees_bare:
            raise UserError(f"No employees with active contracts found for {company.name}")

        total_employees = len(employees_bare)
        _logger.info("Found %s employees with active contracts", total_employees)

        created_payslips = 0
        batch_no = 0

        for month in range(1, 13):
            # filter employees with active contracts for the month
            employees = employees_bare.filtered(lambda e: e.contract_ids.filtered(lambda c: c.state == "open" and (not c.date_start or c.date_start <= fields.Date.from_string("2023-%02d-01" % month)) and (not c.date_end or c.date_end >= fields.Date.from_string("2023-%02d-01" % month))))
            batch_no = 0
            emp_index = 0
            while emp_index < len(employees):
                batch_no += 1
                to_process = min(batch_size, total_employees - emp_index)
                _logger.info("Starting batch %s for month %s: processing %s employees...", batch_no, month, to_process)

                payslip_vals = []
                for _ in range(to_process):
                    emp = employees[emp_index]
                    contract = emp.contract_ids.filtered(lambda c: c.state == "open")[:1]
                    if not contract:
                        _logger.warning("No active contract found for employee: %s", emp.name)
                        continue
                    payslip_vals.append({
                        "name": f"Payslip {emp.name} {month}/2023",
                        "employee_id": emp.id,
                        "contract_id": contract.id,
                        "company_id": company.id,
                        "date_from": fields.Date.from_string("2023-%02d-01" % month),
                        "date_to": fields.Date.from_string("2023-%02d-28" % month) + relativedelta(days=4) - relativedelta(days=(fields.Date.from_string("2023-%02d-28" % month) + relativedelta(days=4)).day - 1),
                    })
                    _logger.debug("Prepared payslip for employee: %s (Contract: %s)", emp.name, contract.name)

                if payslip_vals:
                    payslips = env["hr.payslip"].sudo().create(payslip_vals)
                    payslips.compute_sheet()
                    struct_without_journal = payslips.mapped("struct_id").filtered(lambda s: not s.journal_id)
                    if struct_without_journal:
                        journal = env["account.journal"].create({
                            "name": f"Salary Journal {company.name}",
                            "code": f"SAL{company.name[:3].upper()}",
                            "type": "general",
                            "company_id": company.id,
                        })
                        struct_without_journal.write({"journal_id": journal.id})
                    payslips.action_payslip_done()
                    
                    created_payslips += len(payslips)
                    cr.commit()
                    _logger.info("Batch %s for month %s done — total payslips created: %s", batch_no, month, created_payslips)
                else:
                    _logger.info("No payslips to create in batch %s for month %s", batch_no, month)

                emp_index += to_process

        # force validate all payslips pay them for the right journal
        payslips = env["hr.payslip"].search([
            ("company_id", "=", company.id),
            ("state", "=", "done"),
        ])


        total_time = round(time.time() - start_time, 2)
        msg = f"✅ Created {created_payslips} demo payslips in {total_time}s"
        _logger.info(msg)

        #check account.move that are realted to payslips and post them if not already done
        moves = payslips.mapped("move_id").filtered(lambda m: m.state != "posted")
        # if no line in the move, add one
        for move in moves:
            if not move.line_ids:
                # also add stuff for account_move_line_check_accountable_required_fields
                account = self.env["account.account"].search([("account_type", "=", "asset_current")], limit=1)
                if not account:
                    account = self.env["account.account"].create({
                        "name": "Misc Account",
                        "code": "MISC",
                        "reconcile": True,
                    })

                move.write({
                    "line_ids": [(0, 0, {
                        "name": "Payslip Entry",
                        "debit": move.amount_total > 0 and move.amount_total or 0.0,
                        "credit": move.amount_total < 0 and -move.amount_total or 0.0,
                        "account_id": account.id,
                    }), (0, 0, {
                        "name": "Payslip Entry",
                        "debit": move.amount_total < 0 and -move.amount_total or 0.0,
                        "credit": move.amount_total > 0 and move.amount_total or 0.0,
                        "account_id": account.id,
                    })],
                })
        if moves:
            moves.action_post()
            _logger.info("Posted %s related account moves", len(moves))

        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": "Generation Complete",
                "message": msg,
                "sticky": False,
            },
        }

    def action_generate_mass_data(self):
        self.action_generate_mass_employees_with_active_contracts()
        self.action_generate_mass_payslips()
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": "Generation Complete",
                "message": "✅ Generated all demo employees, contracts and payslips.",
                "sticky": False,
            },
        }
