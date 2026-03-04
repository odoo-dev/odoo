# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from odoo import _, models
from odoo.tools import float_compare
import base64


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def validate_coupon_programs(self, point_changes, new_codes):
        """
        This is called upon validating the order in the pos.

        This will check the balance for any pre-existing coupon to make sure that the rewards are in fact all claimable.
        This will also check that any set code for coupons do not exist in the database.
        """
        point_changes = {int(k): v for k, v in point_changes.items()}
        coupon_ids_from_pos = set(point_changes.keys())
        coupons = self.env['loyalty.card'].browse(coupon_ids_from_pos).exists().filtered('program_id.active')
        coupon_difference = set(coupons.ids) ^ coupon_ids_from_pos
        if coupon_difference:
            return {
                'successful': False,
                'payload': {
                    'message': _('Some coupons are invalid. The applied coupons have been updated. Please check the order.'),
                    'removed_coupons': list(coupon_difference),
                }
            }
        for coupon in coupons:
            if float_compare(coupon.points, -point_changes[coupon.id], 2) == -1:
                return {
                    'successful': False,
                    'payload': {
                        'message': _('There are not enough points for the coupon: %s.', coupon.code),
                        'updated_points': {c.id: c.points for c in coupons}
                    }
                }
        # Check existing coupons
        coupons = self.env['loyalty.card'].search([('code', 'in', new_codes)])
        if coupons:
            return {
                'successful': False,
                'payload': {
                    'message': _('The following codes already exist in the database, perhaps they were already sold?\n%s',
                        ', '.join(coupons.mapped('code'))),
                }
            }
        return {
            'successful': True,
            'payload': {},
        }

    def add_loyalty_history_lines(self, coupon_data, coupon_updates):
        id_mapping = {item['old_id']: int(item['id']) for item in coupon_updates}
        history_lines_create_vals = []
        for coupon in coupon_data:
            card_id = id_mapping.get(int(coupon['card_id']), False) or int(coupon['card_id'])
            if not self.env['loyalty.card'].browse(card_id).exists():
                continue
            issued = coupon['won']
            cost = coupon['spent']
            if (issued or cost) and card_id > 0:
                history_lines_create_vals.append({
                    'card_id': card_id,
                    'order_model': self._name,
                    'order_id': self.id,
                    'description': _('Onsite %s', self.display_name),
                    'used': cost,
                    'issued': issued,
                })
        self.env['loyalty.history'].create(history_lines_create_vals)

    def confirm_coupon_programs(self, coupon_data):
        """
        This is called after the order is created.

        This will create all necessary coupons and link them to their line orders etc..

        It will also return the points of all concerned coupons to be updated in the cache.
        """
        get_partner_id = lambda partner_id: partner_id and self.env['res.partner'].browse(partner_id).exists() and partner_id or False
        # Keys are stringified when using rpc
        coupon_data = {int(k): v for k, v in coupon_data.items()}

        self._check_existing_loyalty_cards(coupon_data)
        self._remove_duplicate_coupon_data(coupon_data)
        self._process_existing_gift_cards(coupon_data)

        # Map negative id to newly created ids.
        coupon_new_id_map = {k: k for k in coupon_data.keys() if k > 0}

        # Create the coupons that were awarded by the order.
        coupons_to_create = {k: v for k, v in coupon_data.items() if k < 0 and (v.get('points') or v.get('line_codes'))}
        coupon_create_vals = [{
            'program_id': p['program_id'],
            'partner_id': get_partner_id(p.get('partner_id', self.partner_id.id)),
            'code': p.get('code') or p.get('barcode') or self.env['loyalty.card']._generate_code(),
            'points': 0,
            'expiration_date': p.get('expiration_date') or p.get('date_to', False),
            'source_pos_order_id': self.id,
        } for p in coupons_to_create.values()]

        # Pos users don't have the create permission
        new_coupons = self.env['loyalty.card'].with_context(action_no_send_mail=True).sudo().create(coupon_create_vals)

        # Map the newly created coupons
        for old_id, new_id in zip(coupons_to_create.keys(), new_coupons):
            coupon_new_id_map[new_id.id] = old_id

        # We need a sudo here because this can trigger `_compute_order_count` that require access to `sale.order.line`
        all_coupons = self.env['loyalty.card'].sudo().browse(coupon_new_id_map.keys()).exists()
        lines_per_reward_code = defaultdict(lambda: self.env['pos.order.line'])
        for line in self.lines:
            if not line.reward_identifier_code:
                continue
            lines_per_reward_code[line.reward_identifier_code] |= line
        for coupon in all_coupons:
            if coupon.id in coupon_new_id_map:
                # Coupon existed previously, update amount of points.
                coupon.points += coupon_data[coupon_new_id_map[coupon.id]]['points']
            for reward_code in coupon_data[coupon_new_id_map[coupon.id]].get('line_codes', []):
                lines_per_reward_code[reward_code].coupon_id = coupon
        # Send creation email
        new_coupons.with_context(action_no_send_mail=False)._send_creation_communication()
        # Reports per program
        report_per_program = {}
        coupon_per_report = defaultdict(list)
        # Important to include the updated gift cards so that it can be printed. Check coupon_report.
        for coupon in new_coupons:
            if coupon.program_id not in report_per_program:
                report_per_program[coupon.program_id] = coupon.program_id.communication_plan_ids.\
                    filtered(lambda c: c.trigger == 'create').pos_report_print_id
            for report in report_per_program[coupon.program_id]:
                coupon_per_report[report.id].append(coupon.id)

        # Adding loyalty history lines
        loyalty_points = [
            {
                'order_id': self.id,
                'card_id': coupon_id,
                'spent': -coupon_vals['points'] if coupon_vals['points'] < 0 else 0,
                'won': coupon_vals['points'] if coupon_vals['points'] > 0 else 0,
            }
            for coupon_id, coupon_vals in coupon_data.items()
        ]
        coupon_updates = [
            {
                'id': coupon.id,
                'old_id': coupon_new_id_map[coupon.id],
            }
            for coupon in all_coupons
        ]
        self.add_loyalty_history_lines(loyalty_points, coupon_updates)

        return {
            'coupon_updates': [{
                'old_id': coupon_new_id_map[coupon.id],
                'id': coupon.id,
                'points': coupon.points,
                'code': coupon.code,
                'program_id': coupon.program_id.id,
                'partner_id': coupon.partner_id.id,
            } for coupon in all_coupons if coupon.program_id.is_nominative],
            'program_updates': [{
                'program_id': program.id,
                'usages': program.sudo().total_order_count,
            } for program in all_coupons.program_id],
            'new_coupon_info': [{
                'program_name': coupon.program_id.name,
                'expiration_date': coupon.expiration_date,
                'code': coupon.code,
            } for coupon in new_coupons if (
                coupon.program_id.applies_on == 'future'
                # Don't send the coupon code for the gift card and ewallet programs.
                # It should not be printed in the ticket.
                and coupon.program_id.sudo().program_type not in ['gift_card', 'ewallet']
            )],
            'coupon_report': coupon_per_report,
        }

    def _process_existing_gift_cards(self, coupon_data):
        # Batch search all gift cards by code or ID
        gift_card_codes = [v['code'] for v in coupon_data.values() if v.get('code')]
        gift_card_ids = [v['coupon_id'] for v in coupon_data.values() if v.get('coupon_id')]
        existing_cards = self.env['loyalty.card'].search([
            '|', ('code', 'in', gift_card_codes), ('id', 'in', gift_card_ids)
        ])
        card_by_code = {card.code: card for card in existing_cards}
        card_by_id = {card.id: card for card in existing_cards}

        history_vals = []
        updated_gift_cards = self.env['loyalty.card']
        coupon_key_to_remove = []

        for coupon_id, coupon_vals in coupon_data.items():
            program = self.env['loyalty.program'].browse(coupon_vals['program_id'])
            if program.program_type != 'gift_card':
                continue

            gift_card = card_by_id.get(coupon_vals.get('coupon_id')) or card_by_code.get(coupon_vals.get('code'))
            if not gift_card or not gift_card.exists():
                continue

            updated = False
            if not gift_card.partner_id and self.partner_id:
                updated = True
                gift_card.partner_id = self.partner_id
                history_vals.append({
                    'card_id': gift_card.id,
                    'description': _('Assigning partner %s', self.partner_id.name),
                    'used': 0,
                    'issued': gift_card.points,
                })

            if not any(h.order_id for h in gift_card.history_ids if h.order_id):
                updated = True
                gift_card.source_pos_order_id = self.id
                history_vals.append({
                    'card_id': gift_card.id,
                    'order_model': self._name,
                    'order_id': self.id,
                    'description': _('Assigning order %s', self.display_name),
                    'used': 0,
                    'issued': gift_card.points,
                })

            if coupon_vals.get('points') != gift_card.points:
                updated = True
                gift_card.points += coupon_vals['points']
                history_vals.append({
                    'card_id': gift_card.id,
                    'order_model': self._name,
                    'order_id': self.id,
                    'description': _('Onsite %s', self.display_name),
                    'used': -coupon_vals['points'] if coupon_vals['points'] < 0 else 0,
                    'issued': coupon_vals['points'] if coupon_vals['points'] > 0 else 0,
                })

            if updated:
                updated_gift_cards |= gift_card
            coupon_key_to_remove.append(coupon_id)

        if history_vals:
            self.env['loyalty.history'].create(history_vals)

        for key in coupon_key_to_remove:
            coupon_data.pop(key, None)

        return updated_gift_cards

    def _check_existing_loyalty_cards(self, coupon_data):
        # Batch search for existing loyalty/ewallet cards to avoid N+1 queries
        partner_program_pairs = []
        candidate_entries = []
        for coupon_id, coupon_vals in coupon_data.items():
            partner_id = coupon_vals.get('partner_id', False)
            if partner_id:
                partner_program_pairs.append((partner_id, coupon_vals['program_id']))
                candidate_entries.append((coupon_id, coupon_vals))

        if not candidate_entries:
            return

        # Single search for all relevant loyalty/ewallet cards
        partner_ids = list({p for p, _ in partner_program_pairs})
        program_ids = list({prog for _, prog in partner_program_pairs})
        existing_cards = self.env['loyalty.card'].search([
            ('partner_id', 'in', partner_ids),
            ('program_type', 'in', ['loyalty', 'ewallet']),
            ('program_id', 'in', program_ids),
        ])

        # Index cards by (partner_id, program_id) for O(1) lookup
        card_index = {}
        for card in existing_cards:
            key = (card.partner_id.id, card.program_id.id)
            if key not in card_index:
                card_index[key] = card

        coupon_key_to_modify = []
        for (coupon_id, coupon_vals), (partner_id, program_id) in zip(candidate_entries, partner_program_pairs):
            card = card_index.get((partner_id, program_id))
            if card:
                coupon_vals['coupon_id'] = card.id
                coupon_key_to_modify.append((coupon_id, card.id))

        for old_key, new_key in coupon_key_to_modify:
            coupon_data[new_key] = coupon_data.pop(old_key)

    def _remove_duplicate_coupon_data(self, coupon_data):
        # Batch check for existing history lines to avoid N+1 queries
        if not coupon_data:
            return
        program_ids = [v['program_id'] for v in coupon_data.values()]
        existing_history = self.env['loyalty.history'].sudo().search([
            ('card_id.program_id', 'in', program_ids),
            ('order_model', '=', self._name),
            ('order_id', '=', self.id),
        ])
        programs_with_history = set(existing_history.mapped('card_id.program_id.id'))
        items_to_remove = [
            coupon_id for coupon_id, coupon_vals in coupon_data.items()
            if coupon_vals['program_id'] in programs_with_history
        ]
        for item in items_to_remove:
            coupon_data.pop(item)

    def _get_fields_for_order_line(self):
        fields = super(PosOrder, self)._get_fields_for_order_line()
        fields.extend(['is_reward_line', 'reward_id', 'coupon_id', 'reward_identifier_code', 'points_cost'])
        return fields

    def _add_mail_attachment(self, name, ticket, basic_receipt):
        attachment = super()._add_mail_attachment(name, ticket, basic_receipt)
        gift_card_programs = self.config_id._get_program_ids().filtered(lambda p: p.program_type == 'gift_card' and p.pos_report_print_id)
        if not gift_card_programs:
            return attachment

        gift_cards = self.env['loyalty.card'].search([('source_pos_order_id', '=', self.id), ('program_id', 'in', gift_card_programs.ids)])
        if not gift_cards:
            return attachment

        attachments_to_create = []
        for program in gift_card_programs:
            filtered_gift_cards = gift_cards.filtered(lambda gc: gc.program_id == program)
            if filtered_gift_cards:
                action_report = program.pos_report_print_id
                report, _ = action_report._render_qweb_pdf(action_report.report_name, filtered_gift_cards.ids)
                filename = f"{name}.pdf"
                attachments_to_create.append({
                    'name': filename,
                    'type': 'binary',
                    'datas': base64.b64encode(report),
                    'store_fname': filename,
                    'res_model': 'pos.order',
                    'res_id': self.id,
                    'mimetype': 'application/x-pdf'
                })

        if attachments_to_create:
            created_attachments = self.env['ir.attachment'].create(attachments_to_create)
            attachment += [(4, att.id) for att in created_attachments]

        return attachment
