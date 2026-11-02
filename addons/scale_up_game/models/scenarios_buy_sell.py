"""Level "Buy & Sell": nine independent sub-levels (one per card of the Scale-Up! game).

Each sub-level seeds its own prerequisites, so any card can be played alone.
"""
from odoo import _, models
from odoo.exceptions import UserError


class BsCreateProduct(models.AbstractModel):
    _name = 'scale.up.game.scenario.bs_create_product'
    _inherit = 'scale.up.game.scenario'
    _description = 'Buy & Sell 1: Create a product'

    def _steps(self):
        return [
            ('create', _("Create the product")),
            ('details', _("Set type, tracking, sales price and cost")),
            ('vendor', _("Add the Wood Corner vendor price")),
        ]

    def _check(self, tmpl):
        issues = []
        if not self._is_desk(tmpl):
            issues.append(_("The product should be the Large Desk."))
        if tmpl.type != 'consu' or not tmpl.is_storable:
            issues.append(_("A desk is something you keep in stock: Goods with Track Inventory."))
        if not self._eq(tmpl.list_price, 220.0):
            issues.append(_("The sales price should be $220."))
        if not 100.0 <= tmpl.standard_price <= 140.0:
            issues.append(_("The cost should be between $100 and $140."))
        return issues

    def _check_vendor(self, tmpl):
        sellers = tmpl.seller_ids.filtered(lambda s: s.partner_id == self._vendor())
        if not sellers:
            return [_("Wood Corner is not on the product's Purchase tab yet.")]
        if not any(self._eq(s.min_qty, 10.0) and self._eq(s.price, 100.0) for s in sellers):
            return [_("Wood Corner sells at $100 each from a minimum of 10 desks.")]
        return []

    def _evaluate(self, session):
        tmpls = self._player_records(session, 'product.template')
        tmpl, issues, _ok = self._best(tmpls, lambda t: self._check(t) + self._check_vendor(t))
        if not tmpl:
            return {'stage': 'none', 'flags': [False] * 3, 'issues': []}
        details = not self._check(tmpl)
        vendor = not self._check_vendor(tmpl)
        return {'stage': 'done' if details and vendor else 'draft', 'flags': [True, details, vendor], 'issues': issues}

    def _terminal(self, session, ev):
        items = [self._item_new(_("New product"), 'product.template')]
        tmpl = self._best(self._player_records(session, 'product.template'), self._check)[0]
        if tmpl:
            items.append(self._item_open(_("Open my product (%s)", tmpl.name), 'product.template', tmpl))
        return items

    def _texts(self, session):
        return {
            'objective': _("Purchasing found a new vendor, Wood Corner, for office furniture. Put their Large Desk "
                           "in our catalog so we can buy and sell it."),
            'briefing': _("Boss, purchasing found a new vendor. Can you add their Large Desk to our catalog?"),
            'chat': [
                {'who': 'bot', 'text': _("Hi boss! I'm OdooBot. Purchasing just visited Wood Corner, a new vendor of office furniture. Here is their Large Desk.")},
                {'who': 'ceo', 'text': _("How much do they cost?")},
                {'who': 'bot', 'text': _("$140 each, but $100 if we order a minimum of 10 desks. We can sell them at $220.")},
                {'who': 'ceo', 'text': _("Sounds good! I'll create the product in our catalog.")},
            ],
            'hints': {
                'create': [
                    _("Where does Odoo keep everything you buy and sell?"),
                    _("Click the computer on your desk and create a new product named Large Desk."),
                ],
                'details': [
                    _("A desk is a physical thing you keep in stock. What are its price and cost?"),
                    _("Goods, Track Inventory ticked, sales price $220, cost $140."),
                ],
                'vendor': [
                    _("Odoo can remember who supplies a product and at which price."),
                    _("In the Purchase tab add Wood Corner: quantity 10, unit price $100."),
                ],
            },
            'recap': [
                _("A product is the master record every document refers to (quotes, orders, transfers, invoices)."),
                _("The vendor line on the Purchase tab pre-fills the price on future purchase orders."),
            ],
        }


class BsPurchase(models.AbstractModel):
    _name = 'scale.up.game.scenario.bs_purchase'
    _inherit = 'scale.up.game.scenario'
    _description = 'Buy & Sell 2: Purchase large desks'

    def _steps(self):
        return [
            ('create', _("Create a request for quotation")),
            ('details', _("Set vendor, product, quantity and price")),
            ('confirm', _("Confirm the order")),
        ]

    def _check(self, po):
        issues = []
        if po.partner_id != self._vendor():
            issues.append(_("The vendor should be Wood Corner."))
        lines = po.order_line.filtered(lambda l: self._is_desk(l.product_id))
        if not lines:
            issues.append(_("The order has no Large Desk line."))
        else:
            if not any(self._eq(l.product_qty, 10.0) for l in lines):
                issues.append(_("The sales team expects 9 to 12 sales a month: order 10 desks."))
            if not any(self._eq(l.price_unit, 100.0) for l in lines):
                issues.append(_("The agreed price for 10 desks is $100 each."))
        return issues

    def _evaluate(self, session):
        pos = self._player_records(session, 'purchase.order', [('state', '!=', 'cancel')])
        po, issues, ok = self._best(pos, self._check, rank=lambda p: p.state in ('purchase', 'done'))
        if not po:
            return {'stage': 'none', 'flags': [False] * 3, 'issues': []}
        confirmed = ok and po.state in ('purchase', 'done')
        stage = 'done' if confirmed else 'ready' if ok else 'draft'
        return {'stage': stage, 'flags': [True, ok, confirmed], 'issues': issues}

    def _terminal(self, session, ev):
        items = [self._item_new(_("New request for quotation"), 'purchase.order')]
        po = self._best(self._player_records(session, 'purchase.order', [('state', '!=', 'cancel')]), self._check)[0]
        if po:
            items.append(self._item_open(_("Open my order (%s)", po.name), 'purchase.order', po))
        return items

    def _texts(self, session):
        return {
            'objective': _("The Large Desk is in the catalog. Order the first batch from Wood Corner "
                           "with a real purchase order."),
            'briefing': _("Boss, we should stock up on Large Desks. Can you order them from Wood Corner?"),
            'chat': [
                {'who': 'bot', 'text': _("Boss, the Large Desk is in the catalog. How many should we order from Wood Corner?")},
                {'who': 'ceo', 'text': _("OdooBot, what are the monthly sales estimates?")},
                {'who': 'bot', 'text': _("The sales team expects between 9 and 12 a month.")},
                {'who': 'ceo', 'text': _("Ok, I'll purchase 10 desks to start with.")},
            ],
            'hints': {
                'create': [
                    _("Which Odoo document asks a vendor for a price and then commits to buy?"),
                    _("Click the computer on your desk and create a new request for quotation."),
                ],
                'details': [
                    _("Who are we buying from, what, how many, at what agreed price?"),
                    _("Vendor Wood Corner, Large Desk x 10, unit price $100."),
                ],
                'confirm': [
                    _("A quotation request is not an order yet. Which button commits?"),
                    _("Click 'Confirm Order'. Odoo then prepares the receipt for the warehouse."),
                ],
            },
            'recap': [
                _("An RFQ becomes a purchase order when confirmed: a commitment toward the vendor."),
                _("Confirming also created a receipt in Inventory, ready for when the goods arrive."),
            ],
        }


class BsReceive(models.AbstractModel):
    _name = 'scale.up.game.scenario.bs_receive'
    _inherit = 'scale.up.game.scenario'
    _description = 'Buy & Sell 3: Receive products'

    def _steps(self):
        return [
            ('check', _("Check the quantity the truck brought")),
            ('validate', _("Validate the receipt")),
        ]

    def _setup(self, session):
        po = self._seed_purchase()
        return {'po': po.id, 'picking': po.picking_ids[:1].id}

    def _picking(self, session):
        return self.env['stock.picking'].sudo().browse((session.data or {}).get('picking'))

    def _evaluate(self, session):
        picking = self._picking(session)
        qty = sum(picking.move_ids.mapped('quantity'))
        issues = []
        if picking.state == 'assigned' and not self._eq(qty, 10.0):
            issues.append(_("The truck brought 10 desks, but the quantity says %s: Odoo will ask about a backorder.", self._fmt(qty)))
        return {
            'stage': {'done': 'done', 'assigned': 'ready'}.get(picking.state, 'draft'),
            'flags': [picking.state in ('assigned', 'done') and self._eq(qty, 10.0), picking.state == 'done'],
            'issues': issues,
        }

    def _terminal(self, session, ev):
        picking = self._picking(session)
        return [self._item_open(_("Open the receipt (%s)", picking.name), 'stock.picking', picking)]

    def _scene(self, session, ev):
        return {**self._scene_stock(), 'truck': 'unloaded' if ev['stage'] == 'done' else 'docked'}

    def _panel(self, session, ev):
        picking = self._picking(session)
        return [{'label': _("Receipt"), 'value': picking.name}, {'label': _("Desks in stock"), 'value': self._fmt(self._desk_on_hand())}]

    def _texts(self, session):
        return {
            'objective': _("A Wood Corner truck is at the dock with the 10 desks you ordered. "
                           "Receive them in the warehouse with the proper document."),
            'briefing': _("Boss, the Wood Corner truck is here! Let's receive the desks."),
            'chat': [
                {'who': 'driver', 'text': _("Hello, I'm the driver from Wood Corner. I'll be at your warehouse in 5 minutes. Can you open a loading dock?")},
                {'who': 'ceo', 'text': _("Ok, go to dock 3. I'll validate the receipt.")},
            ],
            'hints': {
                'check': [
                    _("The order you confirmed already prepared a document for this delivery. Where is it?"),
                    _("Use the terminal to open the receipt. It should say 10 desks."),
                ],
                'validate': [
                    _("Which button tells Odoo the goods really arrived?"),
                    _("Click 'Validate' on the receipt."),
                ],
            },
            'recap': [
                _("Validating the receipt added the desks to the stock of the warehouse."),
                _("If the quantity differs from the demand, Odoo offers a backorder for the rest."),
                _("You can reach the same receipt from the purchase order's Receipt button: that's integration."),
            ],
        }


class BsBill(models.AbstractModel):
    _name = 'scale.up.game.scenario.bs_bill'
    _inherit = 'scale.up.game.scenario'
    _description = 'Buy & Sell 4: Control the bill'

    def _steps(self):
        return [
            ('create', _("Create a vendor bill")),
            ('link', _("Base it on the purchase order")),
            ('post', _("Check it and confirm it")),
        ]

    def _setup(self, session):
        po = self._seed_purchase(receive=True)
        return {'po': po.id}

    def _po(self, session):
        return self.env['purchase.order'].sudo().browse((session.data or {}).get('po'))

    def _check(self, bill, po):
        if bill.line_ids.purchase_line_id.order_id != po:
            return [_("This bill isn't linked to the purchase order of Wood Corner. Odoo can fill it in for you.")]
        return []

    def _bills(self, session):
        return self._player_records(session, 'account.move', [('move_type', '=', 'in_invoice'), ('state', '!=', 'cancel')])

    def _evaluate(self, session):
        po = self._po(session)
        bill, issues, ok = self._best(self._bills(session), lambda b: self._check(b, po), rank=lambda b: b.state == 'posted')
        if not bill:
            return {'stage': 'none', 'flags': [False] * 3, 'issues': []}
        posted = ok and bill.state == 'posted'
        return {'stage': 'done' if posted else 'ready' if ok else 'draft', 'flags': [True, ok, posted], 'issues': issues}

    def _bonus(self, session):
        """Extra star: the player noticed the vendor charged $110 instead of $100."""
        bill = self._best(self._bills(session), lambda b: self._check(b, self._po(session)))[0]
        if not bill:
            return 0
        said = bill.message_ids.filtered(
            lambda m: m.message_type == 'comment' and m.author_id == session.user_id.partner_id)
        credit = self.env['account.move'].sudo().search_count([('reversed_entry_id', '=', bill.id)])
        return 1 if said or credit else 0

    def _terminal(self, session, ev):
        items = [self._item_new(_("New vendor bill"), 'account.move', {'default_move_type': 'in_invoice'})]
        bill = self._best(self._bills(session), lambda b: self._check(b, self._po(session)))[0]
        if bill:
            items.append(self._item_open(_("Open my bill"), 'account.move', bill))
        return items

    def _scene(self, session, ev):
        return {'papers': True}

    def _panel(self, session, ev):
        return [{'label': _("Purchase order"), 'value': self._po(session).name}]

    def _texts(self, session):
        return {
            'objective': _("Wood Corner's invoice is on your desk. Record it in Odoo as a vendor bill "
                           "and check it against what you ordered. No need to pay yet."),
            'briefing': _("Boss, the vendor's invoice is on your desk. Can you check it?"),
            'chat': [
                {'who': 'paul', 'text': _("Hi! We've received a bill from the vendor today.")},
                {'who': 'paul', 'text': _("I've put it on your desk, can you create, check and validate it? No need to pay it right now, the due date is in 2 months.")},
                {'who': 'doc', 'text': _("Large Desk, 10 x $110.00 = $1,100.00 + tax 15% $165.00. Total $1,265.00.")},
            ],
            'hints': {
                'create': [
                    _("Vendor invoices live in Accounting, under Vendors."),
                    _("Use the terminal to create a new vendor bill."),
                ],
                'link': [
                    _("You don't have to retype the order: the bill can pick it up."),
                    _("Select Wood Corner, then use 'Auto-Complete' to choose the purchase order."),
                ],
                'post': [
                    _("Compare the bill Odoo prepared with the paper invoice. Anything different? Then confirm."),
                    _("Click 'Confirm'. Bonus star: tell the vendor about any price difference you noticed."),
                ],
            },
            'recap': [
                _("The bill was filled from the purchase order, so quantity and price match what was agreed."),
                _("The paper invoice charges $110, not $100: the right move is to ask Wood Corner for a credit note "
                  "(a message on the bill is enough for the bonus star)."),
            ],
        }


class BsSell(models.AbstractModel):
    _name = 'scale.up.game.scenario.bs_sell'
    _inherit = 'scale.up.game.scenario'
    _description = 'Buy & Sell 5: Sell products'

    def _steps(self):
        return [
            ('create', _("Create a quotation")),
            ('details', _("Set customer, product, quantity and price")),
            ('send', _("Send it to the customer")),
            ('confirm', _("Confirm the order once the customer accepts")),
        ]

    def _check(self, so):
        issues = []
        if not self._is_customer(so.partner_id):
            issues.append(_("The quotation is for Brandon from Azure Interior."))
        lines = so.order_line.filtered(lambda l: self._is_desk(l.product_id))
        if not lines:
            issues.append(_("The quotation has no Large Desk line."))
        else:
            if not any(self._eq(l.product_uom_qty, 3.0) for l in lines):
                issues.append(_("Brandon asked for 3 desks."))
            if not any(self._eq(l.price_unit, 220.0) for l in lines):
                issues.append(_("We sell the desk at $220."))
        return issues

    def _evaluate(self, session):
        sos = self._player_records(session, 'sale.order', [('state', '!=', 'cancel')])
        so, issues, ok = self._best(sos, self._check, rank=lambda s: s.state in ('sent', 'sale'))
        if not so:
            return {'stage': 'none', 'flags': [False] * 4, 'issues': []}
        sent = ok and so.state in ('sent', 'sale')
        confirmed = ok and so.state == 'sale'
        stage = 'done' if confirmed else 'ready' if sent else 'draft'
        return {'stage': stage, 'flags': [True, ok, sent, confirmed], 'issues': issues}

    def _terminal(self, session, ev):
        items = [self._item_new(_("New quotation"), 'sale.order')]
        so = self._best(self._player_records(session, 'sale.order', [('state', '!=', 'cancel')]), self._check)[0]
        if so:
            items.append(self._item_open(_("Open my quotation (%s)", so.name), 'sale.order', so))
        return items

    def _scene(self, session, ev):
        return self._scene_stock()

    def _texts(self, session):
        return {
            'objective': _("A customer, Brandon from Azure Interior, wants 3 of your desks. "
                           "Send him a quotation and turn it into an order once he accepts."),
            'briefing': _("Boss, Brandon from Azure Interior wants to buy desks!"),
            'chat': [
                {'who': 'brandon', 'text': _("Hi, Brandon from Azure Interior speaking.")},
                {'who': 'brandon', 'text': _("I've seen beautiful wooden desks in your catalog. Can you send a quote for 3 desks to brandon@game.odoo.com?")},
                {'who': 'ceo', 'text': _("You'll get it by email right now!")},
                {'who': 'brandon', 'text': _("(1 hour later) Hello, this is Brandon. I confirm the quote and look forward to the delivery!")},
            ],
            'hints': {
                'create': [
                    _("Before an order, a customer gets a quotation. Which app handles sales?"),
                    _("Use the terminal to create a new quotation."),
                ],
                'details': [
                    _("Who is the customer, what does he want and at which price?"),
                    _("Customer Azure Interior, Brandon; Large Desk x 3 at $220."),
                ],
                'send': [
                    _("The customer must receive the quotation. Which button sends it?"),
                    _("Click 'Send' and confirm the email."),
                ],
                'confirm': [
                    _("Brandon accepted. Which button turns the quotation into a sales order?"),
                    _("Click 'Confirm'. A delivery order is created for the warehouse."),
                ],
            },
            'recap': [
                _("A quotation is an offer; confirming it makes it a sales order, a commitment with the customer."),
                _("Confirming also created a delivery order in Inventory."),
            ],
        }


class BsDeliver(models.AbstractModel):
    _name = 'scale.up.game.scenario.bs_deliver'
    _inherit = 'scale.up.game.scenario'
    _description = 'Buy & Sell 6: Deliver to customer'

    def _steps(self):
        return [
            ('check', _("Find the delivery of Azure Interior")),
            ('validate', _("Validate the delivery")),
        ]

    def _setup(self, session):
        self._seed_purchase(receive=True)
        so = self._seed_sale()
        return {'so': so.id, 'picking': so.picking_ids[:1].id}

    def _picking(self, session):
        return self.env['stock.picking'].sudo().browse((session.data or {}).get('picking'))

    def _evaluate(self, session):
        picking = self._picking(session)
        issues = []
        if picking.state in ('confirmed', 'waiting'):
            issues.append(_("There isn't enough stock reserved. You can force the transfer, but the stock may become negative."))
        return {
            'stage': {'done': 'done', 'assigned': 'ready'}.get(picking.state, 'draft'),
            'flags': [picking.state in ('assigned', 'done'), picking.state == 'done'],
            'issues': issues,
        }

    def _terminal(self, session, ev):
        picking = self._picking(session)
        return [self._item_open(_("Open the delivery (%s)", picking.name), 'stock.picking', picking)]

    def _scene(self, session, ev):
        return {**self._scene_stock(), 'truck': 'loaded' if ev['stage'] == 'done' else 'docked_out'}

    def _panel(self, session, ev):
        return [{'label': _("Delivery"), 'value': self._picking(session).name},
                {'label': _("Desks in stock"), 'value': self._fmt(self._desk_on_hand())}]

    def _texts(self, session):
        return {
            'objective': _("Azure Interior's order is ready to be shipped. Process the delivery order so the desks leave the warehouse."),
            'briefing': _("Boss, Roger is in a meeting. Can you ship Azure Interior's desks?"),
            'chat': [
                {'who': 'roger', 'text': _("I'm in a meeting this morning.")},
                {'who': 'roger', 'text': _("Can you process and validate the delivery orders that are ready to be shipped today? Make sure that the one from Azure Interior is shipped.")},
                {'who': 'ceo', 'text': _("Okay, I'll check this right away!")},
            ],
            'hints': {
                'check': [
                    _("Which Inventory document represents goods leaving for a customer?"),
                    _("Use the terminal to open the delivery order of Azure Interior."),
                ],
                'validate': [
                    _("Which button confirms the goods really left the warehouse?"),
                    _("Click 'Validate' on the delivery order."),
                ],
            },
            'recap': [
                _("Validating the delivery removed 3 desks from stock and marked them as delivered on the sales order."),
                _("Odoo reserves stock by quantity on hand; you can force a transfer without stock, but the stock goes negative."),
            ],
        }


class BsInvoice(models.AbstractModel):
    _name = 'scale.up.game.scenario.bs_invoice'
    _inherit = 'scale.up.game.scenario'
    _description = 'Buy & Sell 7: Invoice customer'

    def _steps(self):
        return [
            ('create', _("Create the invoice from the sales order")),
            ('post', _("Confirm the invoice")),
        ]

    def _setup(self, session):
        self._seed_purchase(receive=True)
        so = self._seed_sale(deliver=True)
        return {'so': so.id}

    def _so(self, session):
        return self.env['sale.order'].sudo().browse((session.data or {}).get('so'))

    def _invoices(self, session):
        return self._so(session).invoice_ids.filtered(lambda i: i.move_type == 'out_invoice' and i.state != 'cancel')

    def _evaluate(self, session):
        invoices = self._invoices(session)
        if not invoices:
            return {'stage': 'none', 'flags': [False, False], 'issues': []}
        posted = invoices.filtered(lambda i: i.state == 'posted')
        issues = []
        if not posted:
            issues.append(_("The invoice is still a draft: nothing is recorded in the books yet."))
        return {'stage': 'done' if posted else 'draft', 'flags': [True, bool(posted)], 'issues': issues}

    def _terminal(self, session, ev):
        so = self._so(session)
        return [self._item_open(_("Open the sales order (%s)", so.name), 'sale.order', so)]

    def _scene(self, session, ev):
        return self._scene_stock()

    def _panel(self, session, ev):
        return [{'label': _("Sales order"), 'value': self._so(session).name}]

    def _texts(self, session):
        return {
            'objective': _("The desks were delivered. Bill Azure Interior for the sales order."),
            'briefing': _("Boss, Anita wants every delivered order invoiced before month end."),
            'chat': [
                {'who': 'anita', 'text': _("Can you invoice the sales orders we have delivered? I'd like to invoice everything before the end of the month.")},
                {'who': 'ceo', 'text': _("I'm on it!")},
            ],
            'hints': {
                'create': [
                    _("The invoice can be created straight from the order it bills."),
                    _("Open the sales order, click 'Create Invoice', choose a regular invoice."),
                ],
                'post': [
                    _("A draft invoice isn't recorded yet. Which button posts it?"),
                    _("Click 'Confirm' on the invoice."),
                ],
            },
            'recap': [
                _("The posted invoice recorded revenue and the amount the customer owes (receivable)."),
                _("Down-payment options allow invoicing only part of an order."),
            ],
        }


class BsPayment(models.AbstractModel):
    _name = 'scale.up.game.scenario.bs_payment'
    _inherit = 'scale.up.game.scenario'
    _description = 'Buy & Sell 8: Record payment'

    def _steps(self):
        return [('pay', _("Register the payment on the invoice"))]

    def _setup(self, session):
        self._seed_purchase(receive=True)
        so = self._seed_sale(deliver=True, invoice=True)
        return {'so': so.id, 'invoice': so.invoice_ids[:1].id}

    def _invoice(self, session):
        return self.env['account.move'].sudo().browse((session.data or {}).get('invoice'))

    def _evaluate(self, session):
        inv = self._invoice(session)
        paid = inv.payment_state in ('paid', 'in_payment')
        issues = [_("Only part of the invoice is paid.")] if inv.payment_state == 'partial' else []
        return {'stage': 'done' if paid else 'ready', 'flags': [paid], 'issues': issues}

    def _terminal(self, session, ev):
        inv = self._invoice(session)
        return [self._item_open(_("Open the invoice (%s)", inv.name), 'account.move', inv)]

    def _scene(self, session, ev):
        return self._scene_stock()

    def _panel(self, session, ev):
        inv = self._invoice(session)
        return [{'label': _("Invoice"), 'value': inv.name}, {'label': _("Total"), 'value': "%.2f" % inv.amount_total}]

    def _texts(self, session):
        inv = self._invoice(session)
        return {
            'objective': _("Azure Interior's bank transfer just arrived. Record the payment on their invoice."),
            'briefing': _("Boss, a payment notification just came in!"),
            'chat': [
                {'who': 'mail', 'text': _("PAYMENT NOTIFICATION: $%(total).2f from Azure Interior. Communication: %(name)s - 3 large desks", total=inv.amount_total, name=inv.name or '')},
                {'who': 'ceo', 'text': _("Let's register this payment on the invoice.")},
            ],
            'hints': {
                'pay': [
                    _("Don't go hunting in the Accounting menus: the invoice itself can register the payment."),
                    _("Open the invoice, click 'Pay', check journal Bank and the amount, then 'Create Payment'."),
                ],
            },
            'recap': [
                _("The invoice is now paid (or 'In Payment' until the bank statement confirms it)."),
                _("Instead of recording payments by hand, you can synchronize your bank with Odoo."),
            ],
        }


class BsProfit(models.AbstractModel):
    _name = 'scale.up.game.scenario.bs_profit'
    _inherit = 'scale.up.game.scenario'
    _description = 'Buy & Sell 9: Analyze profits'
    answer_label = "Net profit"

    def _steps(self):
        return [('answer', _("Find the net profit and tell Anita"))]

    def _setup(self, session):
        self._seed_purchase(receive=True, bill=True)
        self._seed_sale(deliver=True, invoice=True, pay=True)
        return {}

    def _net_profit(self):
        lines = self.env['account.move.line'].sudo().search([
            ('parent_state', '=', 'posted'),
            ('account_id.internal_group', 'in', ('income', 'expense')),
        ])
        return -sum(lines.mapped('balance'))

    def _evaluate(self, session):
        done = bool((session.data or {}).get('answered'))
        return {'stage': 'done' if done else 'ready', 'flags': [done], 'issues': (session.data or {}).get('issues', [])}

    def _submit(self, session, value):
        try:
            answer = float(str(value).replace(',', '.').replace('$', '').replace(' ', ''))
        except ValueError:
            raise UserError(_("Type a number, for example -340."))
        net = self._net_profit()
        data = dict(session.data or {})
        if self._eq(answer, net):
            data.update(answered=True, issues=[])
        else:
            data['issues'] = [_("That's not what the books say. Look at the Net Profit: revenue minus expenses.")]
        session.sudo().data = data

    def _terminal(self, session, ev):
        action = {
            'type': 'ir.actions.act_window', 'name': _("Profit and Loss (posted entries)"),
            'res_model': 'account.move.line', 'views': [[False, 'list']], 'target': 'new',
            'domain': [('parent_state', '=', 'posted'), ('account_id.internal_group', 'in', ['income', 'expense'])],
            'context': {'group_by': ['account_id']},
        }
        return [{'label': _("Open the books (income & expenses)"), 'alt': False, 'action': action}]

    def _scene(self, session, ev):
        return {**self._scene_stock(), 'profit': self._net_profit() if session.state == 'completed' else None}

    def _texts(self, session):
        return {
            'objective': _("The board meets tomorrow. Find this year's net profit in your books "
                           "(income minus expenses) and tell Anita."),
            'briefing': _("Boss, the board wants our net profit. What do the books say?"),
            'chat': [
                {'who': 'ceo', 'text': _("Can you tell me the net profit for this year? I need it for a board meeting tomorrow.")},
                {'who': 'anita', 'text': _("Let me check the Profit & Loss report.")},
            ],
            'hints': {
                'answer': [
                    _("Which numbers do you need: what you earned and what you spent?"),
                    _("Open the books from the terminal: net profit = income - expenses (a negative number is a loss)."),
                ],
            },
            'recap': [
                _("Net profit = revenue - expenses. Selling 3 desks earned $660 but we paid for 10 desks: a temporary loss."),
                _("Depending on the accounting method, the cost is booked at purchase (continental) or when the goods are sold (Anglo-Saxon)."),
            ],
        }
