# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from odoo import api, fields, models
from odoo.fields import Domain

FIFO_ORDER = "expiration_date ASC NULLS LAST, id ASC"


class LoyaltyHistory(models.Model):
    _name = "loyalty.history"
    _description = "History for Loyalty cards and Ewallets"
    _order = "id desc"

    card_id = fields.Many2one(
        comodel_name="loyalty.card", ondelete="cascade", readonly=True, required=True, index=True
    )
    company_id = fields.Many2one(related="card_id.company_id")

    description = fields.Text(required=True, readonly=True)

    issued = fields.Float(readonly=True)
    used = fields.Float(readonly=True)
    expiration_date = fields.Date(readonly=True, index=True)
    linked_loyalty_history_id = fields.Many2one(
        comodel_name="loyalty.history", ondelete="set null", readonly=True, index=True
    )

    order_model = fields.Char(readonly=True)
    order_id = fields.Many2oneReference(model_field="order_model", readonly=True)

    # === CRUD METHODS === #

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("issued", 0) > 0 and "expiration_date" not in vals:
                card = self.env["loyalty.card"].browse(vals.get("card_id"))
                if card.program_id.program_type == "loyalty" and card.program_id.expire_after:
                    vals["expiration_date"] = fields.Date.today() + timedelta(
                        days=card.program_id.expire_after
                    )
        send_mail = not self.env.context.get("loyalty_no_mail", False)
        cards = self.env["loyalty.card"]
        points_before = {}
        if send_mail:
            cards = self.env["loyalty.card"].browse({
                vals["card_id"] for vals in vals_list if vals.get("card_id")
            })
            points_before = self._get_points_by_card(cards)
        result = super().create(vals_list)
        if send_mail and cards:
            points_after = self._get_points_by_card(cards)
            points_changes = {
                card: {"old": points_before[card], "new": points_after[card]} for card in cards
            }
            cards._send_points_reach_communication(points_changes)
        return result

    def unlink(self):
        compensations = self.search([
            ("linked_loyalty_history_id", "in", self.ids),
            ("issued", ">", 0),
        ])
        affected_cards = self.card_id
        result = super().unlink()
        # The debt these compensating award(s) were paying off is gone, restore a normal
        # expiration date instead of leaving them permanently non-expiring.
        for history in compensations.exists():
            program = history.card_id.program_id
            new_expiration = False
            if program.program_type == "loyalty" and program.expire_after:
                new_expiration = fields.Date.to_date(history.create_date) + timedelta(
                    days=program.expire_after
                )
            history.write({"expiration_date": new_expiration, "linked_loyalty_history_id": False})
        if affected_cards:
            self._settle_outstanding_debt(affected_cards)
        return result

    # === BUSINESS METHODS === #

    def _get_order_portal_url(self):
        self.ensure_one()
        return False

    def _get_order_description(self):
        self.ensure_one()
        return self.env[self.order_model].browse(self.order_id).display_name

    @api.model
    def _get_points_by_card(self, cards):
        """Return {card: points} computed directly from history rows."""
        if not cards:
            return {}
        history_data = self._read_group(
            domain=Domain.AND([Domain("card_id", "in", cards.ids), self._get_valid_domain()]),
            groupby=["card_id"],
            aggregates=["issued:sum", "used:sum"],
        )
        points_per_card = {card.id: issued - used for card, issued, used in history_data}
        return {card: points_per_card.get(card.id, 0.0) for card in cards}

    @api.model
    def _get_valid_domain(self):
        """Domain matching history lines that still count towards a card's balance."""
        today = fields.Date.today()
        return Domain.AND([
            Domain.OR([
                Domain("expiration_date", "=", False),
                Domain("expiration_date", ">", today),
            ]),
            Domain.OR([
                Domain("linked_loyalty_history_id", "=", False),
                Domain("linked_loyalty_history_id.expiration_date", "=", False),
                Domain("linked_loyalty_history_id.expiration_date", ">", today),
            ]),
        ])

    @api.model
    def _settle_outstanding_debt(self, cards):
        """Re-attempt to source outstanding debt on cards from whatever
        capacity is currently available.
        """
        today = fields.Date.today()
        for card in cards.filtered(lambda c: c.program_id.program_type == "loyalty"):
            debts = self.search(
                [
                    ("card_id", "=", card.id),
                    ("used", ">", 0),
                    ("linked_loyalty_history_id", "=", False),
                ],
                order=FIFO_ORDER,
            )
            if not debts:
                continue
            has_capacity = bool(
                self.search_count([
                    ("card_id", "=", card.id),
                    ("issued", ">", 0),
                    ("linked_loyalty_history_id", "=", False),
                    "|",
                    ("expiration_date", "=", False),
                    ("expiration_date", ">", today),
                ])
            )
            if not has_capacity:
                continue
            compensated_debt_ids = set(
                self.search([
                    ("linked_loyalty_history_id", "in", debts.ids),
                    ("issued", ">", 0),
                ]).linked_loyalty_history_id.ids
            )
            retriable_debts = debts.filtered(lambda debt: debt.id not in compensated_debt_ids)
            replacements = [
                (
                    debt.used,
                    {
                        "order_model": debt.order_model,
                        "order_id": debt.order_id,
                        "description": debt.description,
                    },
                )
                for debt in retriable_debts
            ]
            retriable_debts.unlink()
            for amount, values in replacements:
                self._create_consuming_history(card, amount, values)

    @api.model
    def _create_issuing_history(self, card, points, values):
        """Award points to card, creating one or more history lines."""
        card.ensure_one()
        if points <= 0:
            return self.browse()
        if card.program_id.program_type != "loyalty":
            return self.create([{**values, "card_id": card.id, "issued": points, "used": 0}])

        debts = self.search(
            [
                ("card_id", "=", card.id),
                ("used", ">", 0),
                ("linked_loyalty_history_id", "=", False),
            ],
            order=FIFO_ORDER,
        )
        compensated_by_debt = dict(
            self._read_group(
                domain=[("linked_loyalty_history_id", "in", debts.ids), ("issued", ">", 0)],
                groupby=["linked_loyalty_history_id"],
                aggregates=["issued:sum"],
            )
        )
        remaining = points
        create_vals = []
        for debt in debts:
            if remaining <= 0:
                break
            still_owed = debt.used - compensated_by_debt.get(debt, 0.0)
            if still_owed <= 0:
                continue
            pay = min(still_owed, remaining)
            create_vals.append({
                **values,
                "card_id": card.id,
                "issued": pay,
                "used": 0,
                "expiration_date": False,
                "linked_loyalty_history_id": debt.id,
            })
            remaining -= pay
        if remaining > 0:
            create_vals.append({**values, "card_id": card.id, "issued": remaining, "used": 0})
        return self.create(create_vals)

    @api.model
    def _create_consuming_history(self, card, points, values):
        """Consume points from card, creating one or more history lines."""
        card.ensure_one()
        if points <= 0:
            return self.browse()
        if card.program_id.program_type != "loyalty":
            return self.create([{**values, "card_id": card.id, "issued": 0, "used": points}])

        today = fields.Date.today()
        sources = self.search(
            [
                ("card_id", "=", card.id),
                ("issued", ">", 0),
                ("linked_loyalty_history_id", "=", False),
                "|",
                ("expiration_date", "=", False),
                ("expiration_date", ">", today),
            ],
            order=FIFO_ORDER,
        )
        consumed_by_source = dict(
            self._read_group(
                domain=[("linked_loyalty_history_id", "in", sources.ids)],
                groupby=["linked_loyalty_history_id"],
                aggregates=["used:sum"],
            )
        )
        remaining = points
        create_vals = []
        for source in sources:
            if remaining <= 0:
                break
            available = source.issued - consumed_by_source.get(source, 0.0)
            if available <= 0:
                continue
            draw = min(available, remaining)
            create_vals.append({
                **values,
                "card_id": card.id,
                "issued": 0,
                "used": draw,
                "linked_loyalty_history_id": source.id,
            })
            remaining -= draw
        if remaining > 0:
            create_vals.append({**values, "card_id": card.id, "issued": 0, "used": remaining})
        return self.create(create_vals)
