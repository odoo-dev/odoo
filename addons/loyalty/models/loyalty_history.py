# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from odoo import api, fields, models


class LoyaltyHistory(models.Model):
    _name = "loyalty.history"
    _description = "History for Loyalty cards and Ewallets"
    _order = "id desc"

    card_id = fields.Many2one(
        comodel_name="loyalty.card", required=True, index=True, ondelete="cascade", readonly=True
    )
    company_id = fields.Many2one(related="card_id.company_id")

    description = fields.Text(required=True, readonly=True)
    expiration_date = fields.Date(string="Expiration", readonly=True)
    linked_loyalty_history_id = fields.Many2one(
        comodel_name="loyalty.history",
        string="Linked History",
        index=True,
        ondelete="set null",
        readonly=True,
    )
    program_type = fields.Selection(related="card_id.program_type")
    issued = fields.Float(readonly=True)
    used = fields.Float(readonly=True)

    order_model = fields.Char(readonly=True)
    order_id = fields.Many2oneReference(model_field="order_model", readonly=True)

    def _get_order_portal_url(self):
        self.ensure_one()
        return False

    def _get_order_description(self):
        self.ensure_one()
        return self.env[self.order_model].browse(self.order_id).display_name

    def _get_expiration_date(self, card, start_date=None):
        if card.program_id.program_type == "loyalty" and (
            expire_after := card.program_id.expire_after
        ):
            return (start_date or fields.Date.today()) + timedelta(days=expire_after)
        return False

    @api.model_create_multi
    def create(self, vals_list):
        cards = (
            self
            .env["loyalty.card"]
            .browse([vals["card_id"] for vals in vals_list if vals.get("card_id")])
            .exists()
        )
        points_before = self._get_points_by_card(cards)
        for vals in vals_list:
            if vals.get("issued", 0) > 0 and "expiration_date" not in vals:
                card = self.env["loyalty.card"].browse(vals.get("card_id"))
                if expiration_date := self._get_expiration_date(card):
                    vals["expiration_date"] = expiration_date
        histories = super().create(vals_list)
        histories._send_points_change_communication(points_before)
        return histories

    def write(self, vals):
        if {
            "card_id",
            "issued",
            "used",
            "expiration_date",
            "linked_loyalty_history_id",
        } & vals.keys():
            cards = self.card_id
            if vals.get("card_id"):
                cards |= self.env["loyalty.card"].browse(vals["card_id"])
            points_before = self._get_points_by_card(cards.exists())
        else:
            points_before = {}
        result = super().write(vals)
        self._send_points_change_communication(points_before)
        return result

    def unlink(self):
        points_before = self._get_points_by_card(self.card_id)
        result = super().unlink()
        self._send_points_change_communication(points_before)
        return result

    def _get_points_by_card(self, cards):
        if self.env.context.get("loyalty_no_mail"):
            return {}
        return {card: card.points for card in cards}

    def _send_points_change_communication(self, points_before):
        if not points_before or self.env.context.get("loyalty_no_mail"):
            return
        cards = self.env["loyalty.card"].browse([card.id for card in points_before]).exists()
        cards.invalidate_recordset(["points"])
        cards._send_points_reach_communication({
            card: {"old": points_before[card], "new": card.points}
            for card in cards
            if card in points_before
        })

    def _get_sorted_history_lines(self, lines):
        """Sort history lines by redemption priority.
        1. Soonest expiration first
        2. Earlier creation order if same expiration
        3. Non-expiring lines last.
        """
        return lines.sorted(
            key=lambda line: (line.expiration_date is False, line.expiration_date, line.id)
        )

    def _get_valid_history_domain(self, card_ids=None):
        today = fields.Date.today()
        domain = [
            "|",
            ("expiration_date", "=", False),
            ("expiration_date", ">=", today),
            "|",
            ("linked_loyalty_history_id", "=", False),
            "|",
            ("linked_loyalty_history_id.expiration_date", "=", False),
            ("linked_loyalty_history_id.expiration_date", ">=", today),
        ]
        if card_ids:
            domain = [("card_id", "in", card_ids)] + domain
        return domain

    def _assign_linked_history(self, card, points_to_cover):
        """Create consuming history lines linked to their issuing lines.
        Points are consumed from soonest-expiring issuing lines first.

        :param card: loyalty.card record
        :param float points_to_cover: total points to consume
        :return: list of vals dicts for consuming lines (without order info)
        """
        today = fields.Date.today()
        available_issuers = self.search([
            ("card_id", "=", card.id),
            ("issued", ">", 0),
            ("linked_loyalty_history_id", "=", False),
            "|",
            ("expiration_date", "=", False),
            ("expiration_date", ">=", today),
        ])
        consuming_vals = []
        for issuer in self._get_sorted_history_lines(available_issuers):
            if not points_to_cover:
                break
            already_used = sum(
                self.search([("linked_loyalty_history_id", "=", issuer.id)]).mapped("used")
            )
            remaining = issuer.issued - already_used
            if remaining <= 0:
                continue
            consumed = min(remaining, points_to_cover)
            consuming_vals.append({
                "card_id": card.id,
                "issued": 0,
                "used": consumed,
                "linked_loyalty_history_id": issuer.id,
            })
            points_to_cover -= consumed
        # if points_to_cover still > 0, debt — no linked_loyalty_history_id set
        # those lines naturally never expire
        return consuming_vals, points_to_cover

    def _create_consuming_history(self, card, points, values):
        if points <= 0:
            return self.env["loyalty.history"]
        consuming_vals, remaining = self._assign_linked_history(card, points)
        if remaining:
            consuming_vals.append({
                "card_id": card.id,
                "issued": 0,
                "used": remaining,
                "linked_loyalty_history_id": False,
            })
        for consuming_val in consuming_vals:
            consuming_val.update(values)
        return self.create(consuming_vals)

    def _get_compensated_points_by_debt(self, debt_lines):
        if not debt_lines:
            return {}
        compensated_data = self._read_group(
            domain=[("linked_loyalty_history_id", "in", debt_lines.ids), ("issued", ">", 0)],
            groupby=["linked_loyalty_history_id"],
            aggregates=["issued:sum"],
        )
        return {debt.id: issued for debt, issued in compensated_data}

    def _create_issuing_history(self, card, points, values):
        """Create issuing history, compensating existing debt first."""
        points_to_issue = points
        if points_to_issue <= 0:
            return self.env["loyalty.history"]

        histories = self.env["loyalty.history"]
        debt_lines = self.search([
            ("card_id", "=", card.id),
            ("used", ">", 0),
            ("linked_loyalty_history_id", "=", False),
        ])
        compensated_by_debt = self._get_compensated_points_by_debt(debt_lines)

        for debt in debt_lines.sorted("id"):
            debt_to_compensate = debt.used - compensated_by_debt.get(debt.id, 0)
            if debt_to_compensate <= 0:
                continue
            compensated_points = min(points_to_issue, debt_to_compensate)
            histories |= self.create({
                **values,
                "card_id": card.id,
                "issued": compensated_points,
                "used": 0,
                "expiration_date": False,
                "linked_loyalty_history_id": debt.id,
            })
            points_to_issue -= compensated_points
            if not points_to_issue:
                break

        if points_to_issue:
            histories |= self.create({
                **values,
                "card_id": card.id,
                "issued": points_to_issue,
                "used": 0,
            })
        return histories

    def _reassign_debts(self):
        """Link uncovered debt to issuer points made available by cancellation."""
        debts = self.exists().filtered(
            lambda history: history.used > 0 and not history.linked_loyalty_history_id
        )
        compensated_by_debt = self._get_compensated_points_by_debt(debts)
        for debt in debts.sorted("id"):
            compensated_points = min(debt.used, compensated_by_debt.get(debt.id, 0))
            points_to_reassign = debt.used - compensated_points
            if points_to_reassign <= 0:
                continue

            consuming_vals, remaining = self._assign_linked_history(
                debt.card_id, points_to_reassign
            )
            if not consuming_vals:
                continue
            if remaining:
                consuming_vals.append({
                    "card_id": debt.card_id.id,
                    "issued": 0,
                    "used": remaining,
                    "linked_loyalty_history_id": False,
                })

            for consuming_val in consuming_vals:
                consuming_val.update({
                    "description": debt.description,
                    "order_model": debt.order_model,
                    "order_id": debt.order_id,
                })

            if compensated_points:
                debt.write({"used": compensated_points, "linked_loyalty_history_id": False})
                self.create(consuming_vals)
                continue

            first_part = consuming_vals.pop(0)
            debt.write({
                "used": first_part["used"],
                "linked_loyalty_history_id": first_part.get("linked_loyalty_history_id", False),
            })
            if consuming_vals:
                self.create(consuming_vals)

    def _release_compensation(self):
        for history in self:
            history.write({
                "expiration_date": history._get_expiration_date(
                    history.card_id, fields.Date.to_date(history.create_date)
                ),
                "linked_loyalty_history_id": False,
            })
