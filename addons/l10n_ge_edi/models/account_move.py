# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
import math
import time
from datetime import datetime, timedelta

from odoo import Command, api, fields, models
from odoo.exceptions import UserError

from odoo.addons.l10n_ge_edi.lib.rsge_client import (
    RSgeError,
    get_rsge_invoice_status,
    translate_rsge_error,
)

_logger = logging.getLogger(__name__)

# RS.ge returns every matching document in one uncapped response, so the backlog is walked
# in fixed windows rather than a single call.
FETCH_WINDOW = timedelta(hours=12)
FETCH_TIME_BUDGET = 60


class AccountMove(models.Model):
    _inherit = "account.move"

    l10n_ge_edi_state = fields.Selection(
        selection=[
            ("not_sent", "Not Sent"),
            ("error", "Error"),
            ("rejected", "Rejected"),
            ("sent", "Sent"),
            ("confirmed", "Confirmed"),
            ("corrected_original", "Original Invoice (Corrected)"),
            ("new_correction", "New Corrective Invoice"),
            (
                "correction_pending_confirmation",
                "Corrective Invoice – Pending Confirmation",
            ),
            ("cancel_requested", "Cancel Requested"),
            ("confirmed_cancelled", "Cancellation Confirmed"),
            ("confirmed_correction", "Corrective Invoice Confirmed"),
            ("unknown", "Unknown"),
        ],
        string="RS.ge Status",
        readonly=True,
        copy=False,
        default="not_sent",
    )
    l10n_ge_edi_invoice_id = fields.Char(
        string="RS.ge Invoice Id", readonly=True, copy=False
    )
    l10n_ge_edi_f_series = fields.Char(
        string="RS.ge F-Series", readonly=True, copy=False
    )
    l10n_ge_edi_f_number = fields.Integer(
        string="RS.ge F-Number", readonly=True, copy=False
    )
    l10n_ge_edi_k_type = fields.Selection(
        selection=[
            ("1", "Taxable Transaction Cancelled"),
            ("2", "Type of Transaction Changed"),
            ("3", "Compensation Amount Changed"),
            ("4", "Goods/Services Returned"),
        ],
        string="RS.ge Correction Type",
        readonly=True,
        copy=False,
    )
    l10n_ge_edi_original_move_id = fields.Many2one(
        "account.move",
        string="RS.ge Original Invoice",
        readonly=True,
        copy=False,
    )
    l10n_ge_edi_correction_move_id = fields.Many2one(
        "account.move",
        string="RS.ge Corrective Invoice",
        readonly=True,
        copy=False,
    )
    l10n_ge_edi_is_correction = fields.Boolean(
        string="Is RS.ge Corrective Invoice",
        compute="_compute_l10n_ge_edi_is_correction",
    )
    l10n_ge_edi_k_invoice_not_allowed = fields.Boolean(
        compute="_compute_l10n_ge_edi_k_invoice_not_allowed",
    )
    l10n_ge_edi_request_cancellation_not_allowed = fields.Boolean(
        compute="_compute_l10n_ge_edi_request_cancellation_not_allowed",
    )
    l10n_ge_edi_credit_note_not_allowed = fields.Boolean(
        compute="_compute_l10n_ge_edi_credit_note_not_allowed",
    )
    l10n_ge_edi_state_not_visible = fields.Boolean(
        compute="_compute_l10n_ge_edi_state_not_visible",
    )

    @api.depends("l10n_ge_edi_k_type")
    def _compute_l10n_ge_edi_is_correction(self):
        for move in self:
            move.l10n_ge_edi_is_correction = bool(move.l10n_ge_edi_k_type)

    @api.depends("l10n_ge_edi_state", "move_type", "l10n_ge_edi_k_type", "country_code")
    def _compute_l10n_ge_edi_k_invoice_not_allowed(self):
        for move in self:
            if move.country_code != "GE" or move.move_type != "out_invoice":
                move.l10n_ge_edi_k_invoice_not_allowed = True
            elif move.l10n_ge_edi_k_type:
                move.l10n_ge_edi_k_invoice_not_allowed = (
                    move.l10n_ge_edi_state != "confirmed_correction"
                )
            else:
                move.l10n_ge_edi_k_invoice_not_allowed = (
                    move.l10n_ge_edi_state != "confirmed"
                )

    @api.depends("l10n_ge_edi_state", "move_type", "l10n_ge_edi_k_type", "country_code")
    def _compute_l10n_ge_edi_request_cancellation_not_allowed(self):
        for move in self:
            if move.country_code != "GE":
                move.l10n_ge_edi_request_cancellation_not_allowed = True
            elif move.move_type == "out_invoice" and move.l10n_ge_edi_k_type:
                move.l10n_ge_edi_request_cancellation_not_allowed = (
                    move.l10n_ge_edi_state != "confirmed_correction"
                )
            elif move.move_type == "out_invoice":
                move.l10n_ge_edi_request_cancellation_not_allowed = (
                    move.l10n_ge_edi_state != "confirmed"
                )
            elif move.move_type == "out_refund" and move.l10n_ge_edi_k_type == "4":
                move.l10n_ge_edi_request_cancellation_not_allowed = (
                    move.l10n_ge_edi_state != "confirmed_correction"
                )
            else:
                move.l10n_ge_edi_request_cancellation_not_allowed = True

    @api.depends("l10n_ge_edi_state", "country_code")
    def _compute_l10n_ge_edi_credit_note_not_allowed(self):
        for move in self:
            move.l10n_ge_edi_credit_note_not_allowed = (
                move.country_code == "GE" and move.l10n_ge_edi_state != "not_sent"
            )

    @api.depends("l10n_ge_edi_state", "state", "move_type", "country_code")
    def _compute_l10n_ge_edi_state_not_visible(self):
        for move in self:
            move.l10n_ge_edi_state_not_visible = not (
                move.country_code == "GE"
                and move.move_type in ("out_invoice", "out_refund")
                and (
                    move.state == "posted"
                    or move.l10n_ge_edi_state
                    in ("confirmed_cancelled", "corrected_original")
                )
            )

    def _l10n_ge_edi_reset_draft_not_allowed(self):
        self.ensure_one()
        if self.country_code != "GE" or self.move_type not in (
            "out_invoice",
            "out_refund",
        ):
            return False
        if self.l10n_ge_edi_k_type == "1":
            return True
        if self.l10n_ge_edi_state in {
            "not_sent",
            "error",
            "rejected",
            "new_correction",
        }:
            return False
        if self.l10n_ge_edi_state == "confirmed_cancelled" and self.state != "cancel":
            return False
        if (
            self.l10n_ge_edi_state == "corrected_original"
            and self.state != "cancel"
            and self.l10n_ge_edi_correction_move_id.l10n_ge_edi_k_type in ("2", "3")
        ):
            return False
        return True

    @api.depends("l10n_ge_edi_state", "state", "move_type", "country_code")
    def _compute_show_reset_to_draft_button(self):
        # EXTENDS 'account'
        super()._compute_show_reset_to_draft_button()
        for move in self:
            if move._l10n_ge_edi_reset_draft_not_allowed():
                move.show_reset_to_draft_button = False

    def button_draft(self):
        # EXTENDS 'account'
        if any(move._l10n_ge_edi_reset_draft_not_allowed() for move in self):
            raise UserError(
                self.env._("Invoice sent to RS.ge cannot be reset to draft."),
            )
        return super().button_draft()

    def l10n_ge_edi_refresh_status(self):
        self.ensure_one()
        company = self.company_id
        client = company._get_rsge_client()
        try:
            invoice_data = client.get_invoice(
                user_id=company.sudo().l10n_ge_edi_user_id,
                invoice_id=int(self.l10n_ge_edi_invoice_id),
            )
        except RSgeError as error:
            self.message_post(body=translate_rsge_error(self.env, error))
            return

        previous_state = self.l10n_ge_edi_state
        self.l10n_ge_edi_state = get_rsge_invoice_status(invoice_data["status"])
        if (
            previous_state != "confirmed_cancelled"
            and self.l10n_ge_edi_state == "confirmed_cancelled"
        ):
            self.button_cancel()

    def action_l10n_ge_edi_open_original_move(self):
        self.ensure_one()
        return self.l10n_ge_edi_original_move_id._get_records_action(
            name=self.env._("Original Invoice"),
        )

    def action_l10n_ge_edi_open_correction_move(self):
        self.ensure_one()
        return self.l10n_ge_edi_correction_move_id._get_records_action(
            name=self.env._("Corrective Invoice"),
        )

    def action_l10n_ge_edi_open_k_invoice_wizard(self):
        self.ensure_one()
        if self.l10n_ge_edi_k_invoice_not_allowed:
            raise UserError(
                self.env._(
                    "This invoice must be confirmed by RS.ge before a corrective invoice can be created.",
                ),
            )
        return {
            "name": self.env._("Choose K Invoice Type"),
            "type": "ir.actions.act_window",
            "res_model": "l10n_ge_edi.k_invoice.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {"default_move_id": self.id},
        }

    def action_l10n_ge_edi_request_cancellation(self):
        self.ensure_one()
        if self.l10n_ge_edi_request_cancellation_not_allowed:
            raise UserError(
                self.env._(
                    "This invoice must be confirmed by RS.ge before a cancellation can be requested.",
                ),
            )
        if self.line_ids.filtered("reconciled"):
            raise UserError(
                self.env._(
                    "This invoice has reconciled payments and cannot be cancelled, since that "
                    "would incorrectly unreconcile the payment. Use K Invoice's Cancel "
                    "Transaction instead, which creates a credit note.",
                ),
            )

        company = self.company_id
        client = company._get_rsge_client()
        user_id = company.sudo().l10n_ge_edi_user_id
        invoice_id = int(self.l10n_ge_edi_invoice_id)

        try:
            client.change_invoice_status(
                user_id=user_id,
                invoice_id=invoice_id,
                status=6,
            )
            invoice_data = client.get_invoice(user_id=user_id, invoice_id=invoice_id)
        except RSgeError as error:
            raise UserError(translate_rsge_error(self.env, error)) from error

        self.l10n_ge_edi_state = get_rsge_invoice_status(invoice_data["status"])
        self.message_post(body=self.env._("Cancellation requested from RS.ge."))

    def _l10n_ge_edi_fetch_vendor_bills(self):
        # A user must never trigger a fetch against another company's RS.ge account.
        company = self.env.company
        if company.country_code == "GE" and company.sudo().l10n_ge_edi_user_id:
            self._l10n_ge_edi_fetch_company_vendor_bills(company)

    def _cron_l10n_ge_edi_fetch_vendor_bills(self):
        # res.company's own country_id/country_code are computed, so the only searchable
        # path to the country is through the company's partner.
        company_domain = [
            ("partner_id.country_id.code", "=", "GE"),
            ("l10n_ge_edi_user_id", ">", 0),
        ]
        for company in self.env["res.company"].sudo().search(company_domain):
            if company.l10n_ge_edi_last_fetched_date:
                self.with_company(company)._l10n_ge_edi_fetch_company_vendor_bills(
                    company
                )
            else:
                _logger.warning(
                    "RS.ge: no sync start date set for %s, skipping it until one is set in "
                    "the Accounting settings.",
                    company.display_name,
                )

    def _l10n_ge_edi_fetch_company_vendor_bills(self, company):
        company_sudo = company.sudo()
        start_date = company_sudo.l10n_ge_edi_last_fetched_date
        if not start_date:
            raise UserError(
                self.env._(
                    "No sync start date is set for %(company)s. Set one in the RS.ge section of "
                    "the Accounting settings before fetching vendor bills.",
                    company=company.display_name,
                ),
            )

        client = company._get_rsge_client()
        user_id = company_sudo.l10n_ge_edi_user_id
        un_id = int(company.partner_id.l10n_ge_edi_un_id)
        cron = self.env["ir.cron"]
        started_at = time.monotonic()

        now = fields.Datetime.now()
        while start_date < now:
            end_date = min(start_date + FETCH_WINDOW, now)
            try:
                rows = client.get_buyer_invoices(
                    user_id=user_id,
                    un_id=un_id,
                    start_date=start_date,
                    end_date=end_date,
                )
            except RSgeError as error:
                raise UserError(translate_rsge_error(self.env, error)) from error

            _logger.info(
                "RS.ge: %s documents registered between %s and %s for %s",
                len(rows),
                start_date,
                end_date,
                company.display_name,
            )
            for row in rows:
                self._l10n_ge_edi_create_vendor_bill(company, row)

            company_sudo.l10n_ge_edi_last_fetched_date = end_date
            start_date = end_date

            remaining_windows = math.ceil((now - end_date) / FETCH_WINDOW)
            cron_time_left = cron._commit_progress(
                processed=1,
                remaining=remaining_windows,
            )
            if not cron_time_left or time.monotonic() - started_at > FETCH_TIME_BUDGET:
                break

    def _l10n_ge_edi_create_vendor_bill(self, company, row):
        if row["STATUS"] not in {"1", "2"}:
            return self.browse()

        invoice_id = row["ID"]
        existing_bill = self.search(
            [
                ("company_id", "=", company.id),
                ("l10n_ge_edi_invoice_id", "=", invoice_id),
            ],
            limit=1,
        )
        if existing_bill:
            return existing_bill

        client = company._get_rsge_client()
        remote_lines = client.get_invoice_lines(
            user_id=company.sudo().l10n_ge_edi_user_id,
            invoice_id=int(invoice_id),
        )
        tax = (
            self.env["account.chart.template"]
            .with_company(company)
            .ref("ge_vat_purchase_18", raise_if_not_found=False)
        )

        line_commands = []
        for remote_line in remote_lines:
            quantity = float(remote_line.get("G_NUMBER") or 0) or 1
            # FULL_AMOUNT is VAT inclusive, DRG_AMOUNT is the VAT it contains (-1 when exempt).
            full_amount = float(remote_line.get("FULL_AMOUNT") or 0)
            vat_amount = max(float(remote_line.get("DRG_AMOUNT") or 0), 0)
            line_commands.append(
                Command.create(
                    {
                        "name": remote_line.get("GOODS") or "",
                        "quantity": quantity,
                        "price_unit": (full_amount - vat_amount) / quantity,
                        "tax_ids": [Command.set(tax.ids)],
                        "l10n_ge_edi_line_id": remote_line.get("ID"),
                    }
                ),
            )

        bill = self.create(
            {
                "move_type": "in_invoice",
                "company_id": company.id,
                # RS.ge stamps its own offset, and the operation date is the calendar day the seller
                # declared, so it is taken as-is rather than shifted into UTC.
                "invoice_date": datetime.fromisoformat(row["OPERATION_DT"]).date(),
                "ref": f"{row['F_SERIES']}-{row['F_NUMBER']}",
                "l10n_ge_edi_invoice_id": invoice_id,
                "l10n_ge_edi_f_series": row["F_SERIES"],
                "l10n_ge_edi_f_number": int(row["F_NUMBER"]),
                "l10n_ge_edi_state": get_rsge_invoice_status(int(row["STATUS"])),
                "invoice_line_ids": line_commands,
            }
        )
        bill.message_post(
            body=self.env._(
                "Fetched from RS.ge. Set the vendor before posting: %(name)s (TIN %(tin)s).",
                name=row.get("ORG_NAME") or "",
                tin=row.get("SA_IDENT_NO") or "",
            ),
        )
        return bill

    def _l10n_ge_edi_refresh_all_statuses(self):
        invoices_to_update = self.search(
            [
                ("move_type", "=", "out_invoice"),
                ("l10n_ge_edi_state", "not in", ["not_sent", "error", "rejected"]),
            ],
        )
        for invoice in invoices_to_update:
            invoice.l10n_ge_edi_refresh_status()

    def _l10n_ge_edi_matches_rsge(self, remote_header):
        return (
            remote_header["operation_dt"].date() == (self.invoice_date or self.date)
            and remote_header["seller_un_id"]
            == int(self.company_id.partner_id.l10n_ge_edi_un_id)
            and remote_header["buyer_un_id"] == int(self.partner_id.l10n_ge_edi_un_id)
        )

    def _l10n_ge_edi_submit_correction(self):
        self.ensure_one()
        company = self.company_id
        client = company._get_rsge_client()
        user_id = company.sudo().l10n_ge_edi_user_id
        invoice_id = int(self.l10n_ge_edi_invoice_id)
        lines = self.invoice_line_ids.filtered(lambda l: l.display_type == "product")

        try:
            remote_lines_by_id = {
                row["ID"]: row
                for row in client.get_invoice_lines(
                    user_id=user_id,
                    invoice_id=invoice_id,
                )
            }
            stale_line_ids = remote_lines_by_id.keys() - set(
                lines.mapped("l10n_ge_edi_line_id"),
            )
            for stale_line_id in stale_line_ids:
                client.delete_invoice_line(
                    user_id=user_id,
                    invoice_id=invoice_id,
                    line_id=int(stale_line_id),
                )

            for line in lines:
                remote_line = remote_lines_by_id.get(line.l10n_ge_edi_line_id)
                if remote_line and line._l10n_ge_edi_matches_rsge(remote_line):
                    continue

                line_id = client.save_invoice_line(
                    user_id=user_id,
                    invoice_id=invoice_id,
                    line_id=int(line.l10n_ge_edi_line_id or 0),
                    goods=line.name or line.product_id.display_name,
                    g_unit=line.product_uom_id.name or "pcs",
                    g_number=line.quantity,
                    full_amount=line.price_total,
                    drg_amount=line._l10n_ge_edi_drg_amount(),
                )
                line.l10n_ge_edi_line_id = str(line_id)

            client.change_invoice_status(
                user_id=user_id,
                invoice_id=invoice_id,
                status=5,
            )
            invoice_data = client.get_invoice(user_id=user_id, invoice_id=invoice_id)
        except RSgeError as error:
            self.l10n_ge_edi_state = "error"
            self.message_post(body=translate_rsge_error(self.env, error))
            return False

        self.write(
            {
                "l10n_ge_edi_state": get_rsge_invoice_status(invoice_data["status"]),
                "l10n_ge_edi_f_series": invoice_data["f_series"],
                "l10n_ge_edi_f_number": invoice_data["f_number"],
            },
        )
        message = self.env._(
            "Corrective invoice sent to RS.ge (%(f_series)s-%(f_number)s).",
            f_series=invoice_data["f_series"],
            f_number=invoice_data["f_number"],
        )
        self.message_post(body=message)
        return True

    def _l10n_ge_edi_submit_k_invoice_type_1(self):
        self.ensure_one()
        if self.l10n_ge_edi_k_type != "1":
            return False

        company = self.company_id
        client = company._get_rsge_client()
        user_id = company.sudo().l10n_ge_edi_user_id
        invoice_id = int(self.l10n_ge_edi_invoice_id)

        try:
            client.change_invoice_status(
                user_id=user_id,
                invoice_id=invoice_id,
                status=5,
            )
            invoice_data = client.get_invoice(user_id=user_id, invoice_id=invoice_id)
        except RSgeError as error:
            self.l10n_ge_edi_state = "error"
            self.message_post(body=translate_rsge_error(self.env, error))
            return False

        self.write(
            {
                "l10n_ge_edi_state": get_rsge_invoice_status(invoice_data["status"]),
                "l10n_ge_edi_f_series": invoice_data["f_series"],
                "l10n_ge_edi_f_number": invoice_data["f_number"],
            },
        )
        message = self.env._(
            "Corrective invoice sent to RS.ge (%(f_series)s-%(f_number)s).",
            f_series=invoice_data["f_series"],
            f_number=invoice_data["f_number"],
        )
        self.message_post(body=message)
        return True

    def _l10n_ge_edi_submit_invoice(self):
        self.ensure_one()
        if self.l10n_ge_edi_is_correction:
            if self.l10n_ge_edi_k_type == "1":
                return self._l10n_ge_edi_submit_k_invoice_type_1()
            return self._l10n_ge_edi_submit_correction()

        company = self.company_id
        client = company._get_rsge_client()
        user_id = company.sudo().l10n_ge_edi_user_id
        lines = self.invoice_line_ids.filtered(lambda l: l.display_type == "product")

        try:
            invoice_id = int(self.l10n_ge_edi_invoice_id or 0)
            remote_header = False
            remote_lines_by_id = {}
            if invoice_id:
                remote_header = client.get_invoice(
                    user_id=user_id,
                    invoice_id=invoice_id,
                )
                remote_lines_by_id = {
                    row["ID"]: row
                    for row in client.get_invoice_lines(
                        user_id=user_id,
                        invoice_id=invoice_id,
                    )
                }
                stale_line_ids = remote_lines_by_id.keys() - set(
                    lines.mapped("l10n_ge_edi_line_id"),
                )
                for stale_line_id in stale_line_ids:
                    client.delete_invoice_line(
                        user_id=user_id,
                        invoice_id=invoice_id,
                        line_id=int(stale_line_id),
                    )

            operation_date = self.invoice_date or self.date
            seller_un_id = int(company.partner_id.l10n_ge_edi_un_id)
            buyer_un_id = int(self.partner_id.l10n_ge_edi_un_id)
            if not remote_header or not self._l10n_ge_edi_matches_rsge(remote_header):
                invoice_id = client.save_invoice(
                    user_id=user_id,
                    invoice_id=invoice_id,
                    operation_date=operation_date,
                    seller_un_id=seller_un_id,
                    buyer_un_id=buyer_un_id,
                )
                self.l10n_ge_edi_invoice_id = str(invoice_id)

            for line in lines:
                remote_line = remote_lines_by_id.get(line.l10n_ge_edi_line_id)
                if remote_line and line._l10n_ge_edi_matches_rsge(remote_line):
                    continue

                line_id = client.save_invoice_line(
                    user_id=user_id,
                    invoice_id=invoice_id,
                    line_id=int(line.l10n_ge_edi_line_id or 0),
                    goods=line.name or line.product_id.display_name,
                    g_unit=line.product_uom_id.name or "pcs",
                    g_number=line.quantity,
                    full_amount=line.price_total,
                    drg_amount=line._l10n_ge_edi_drg_amount(),
                )
                line.l10n_ge_edi_line_id = str(line_id)

            client.change_invoice_status(
                user_id=user_id, invoice_id=invoice_id, status=1
            )
            invoice_data = client.get_invoice(user_id=user_id, invoice_id=invoice_id)
        except RSgeError as error:
            self.l10n_ge_edi_state = "error"
            self.message_post(body=translate_rsge_error(self.env, error))
            return False

        self.write(
            {
                "l10n_ge_edi_state": get_rsge_invoice_status(invoice_data["status"]),
                "l10n_ge_edi_f_series": invoice_data["f_series"],
                "l10n_ge_edi_f_number": invoice_data["f_number"],
            }
        )
        message = self.env._(
            "Invoice sent to RS.ge (%(f_series)s-%(f_number)s).",
            f_series=invoice_data["f_series"],
            f_number=invoice_data["f_number"],
        )
        self.message_post(body=message)
        return True
