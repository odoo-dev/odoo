# Level 1 — "Buy & Sell"

Source: `scale-up.pdf`, case "Buy & Sell" (pp. 3–22: intro card, 9 cards, each with a story front and a solution back). The PDF screenshots are Odoo 19; every field/button below must be re-verified on Odoo 20 before implementation.

> **Implementation notes (supersede the text below where they differ).** Level 1 is a *group* of 9 independent sub-levels (one per card), each playable alone from the menu; each seeds its own prerequisites (PO, receipt, SO, invoice…) with OdooBot, so replays never need a reset. Decisions: taxes are not hardcoded (amounts are checked against the database's taxes); the card-4 bonus star is given for a chatter message or a credit note on the bill; card 9 is a typed answer checked against the books; sub-level 1 gives no product to later sub-levels (they use the fixture "Standing Desk"). Stars: 2, minus 1 if a level-2 hint was used, plus the bonus. The product is **Standing Desk** instead of the PDF's Large Desk: Odoo's demo data already has a Large Desk. Each attempt start keeps a single active Standing Desk (none in sub-level 1), and the vendor/customer fixtures reuse demo partners of the same name.

## 1. Objective (story)

You are the CEO of MyOffice Inc., a furniture retailer. Buy large desks from a new vendor (Wood Corner), receive and pay-control them, sell 3 to a customer (Azure Interior, Brandon), deliver, invoice, collect the payment, and finally read the net profit. The player runs the whole **procure-to-pay + order-to-cash** loop with real Odoo documents across Inventory, Purchase, Sales and Accounting.

Characters (chat bubbles in the mission card): Marc (Purchase Mgr), Sophia (Sales Mgr), Paul (Secretary), Brandon (customer), Roger (Inventory Mgr), Anita (Accountant), the Wood Corner driver.

## 2. Cards (stages) and documents the player must create

Each card = one stage. Player creates real Odoo records; the game only observes them. All records are scoped to the **attempt**: created by the player after the attempt started (so replays need no reset).

| # | Card | Story (chat) | Document(s) the player creates | Done when (evaluator) |
|---|------|--------------|-------------------------------|-----------------------|
| 1 | Create a product | Marc: Large Desk from Wood Corner, cost $140, $100 if ≥10, we sell at $220 | `product.template` "Large Desk" | Goods, Track Inventory on, sale price 220, cost in 100–140, vendor line Wood Corner (min qty 10 @ 100; PDF also shows a 1 @ 140 line) |
| 2 | Purchase large desks | Sophia: sales 9–12/month → buy 10 | `purchase.order` (RFQ → Confirm Order) | PO state `purchase`, vendor Wood Corner, 10 × the player's product @ 100 |
| 3 | Receive products | Driver at dock 3, validate the receipt | Validate receipt (`stock.picking` IN, auto-created by PO) | receipt `done`, qty 10 (backorder note: lower qty → backorder wizard) |
| 4 | Control the bill | Paul: bill received, create/check/validate it; due in 2 months | Vendor bill (`account.move` in_invoice) from the PO (Auto-Complete) | bill linked to the PO, posted. **Bonus ★**: vendor charged $110/unit instead of $100 (bill sheet in scene shows $1,100) — noticing it (message to vendor in chatter, or credit note) |
| 5 | Sell products | Brandon (Azure Interior): quote 3 desks | `sale.order` → Send by email → Confirm | SO `sale`, customer Azure Interior, 3 × product @ 220; sub-stage "quotation sent" (`sent`) before confirm |
| 6 | Deliver to customer | Roger: validate the delivery, make sure Azure's is shipped | Validate delivery (`stock.picking` OUT of that SO) | delivery `done` qty 3; must be the Azure one (other ready deliveries, if any, are ignored) |
| 7 | Invoice customer | Anita: invoice delivered orders | Customer invoice from the SO (Create Invoice → Regular → Confirm) | invoice posted, linked to the SO, 3 × 220 (total includes tax; don't hardcode 759, the tax depends on the company country) |
| 8 | Record payment | Bank notification: $759 from Azure | Pay button on the invoice → Create Payment | invoice `paid`/`in_payment`; journal Bank; amount = invoice total |
| 9 | Analyze profits | Anita: Profit & Loss report | (no document) player opens Accounting ▸ Reporting ▸ Profit and Loss and types the **net profit** in a game prompt | typed value equals the report's net profit, computed server-side (PDF accepts −340 continental or +660 Anglo-Saxon; we accept whatever the actual P&L shows) |

Stage vocabulary per card (reused from the POC): `none → draft → ready → done`, mapped per card: e.g. card 2: none / RFQ (draft) / RFQ sent / PO confirmed (done); card 5: none / quotation / sent / sale order.

## 3. Hints (two levels per card)

Level 1 = nudge (which app/document), level 2 = explicit step. Count hints per card. Example:

1. *Create a product* — L1: "Where does Odoo keep the things you buy and sell? Don't forget who supplies it and at what price." L2: "Purchase ▸ Products ▸ New: Large Desk, Goods, Track Inventory, price 220, cost 140; Purchase tab: add Wood Corner 10 @ 100."
2. *Purchase* — L1: "A vendor price for 10 units. Which document asks the vendor, then commits?" L2: "Purchase ▸ New RFQ: Wood Corner, Large Desk × 10 @ 100 → Confirm Order."
3. *Receive* — L1: "Confirming the order already prepared something for the warehouse." L2: "Inventory ▸ Receipts (or the Receipt smart button) ▸ Validate."
4. *Bill* — L1: "The vendor's invoice has its own document; Odoo can prefill it from the order." L2: "Accounting ▸ Vendors ▸ Bills ▸ New, Auto-Complete with the PO, check lines, Confirm."
5. *Sell* — L1: "Before an order there is a quotation the customer can accept." L2: "Sales ▸ New: Azure Interior, Large Desk × 3 → Send → Confirm."
6. *Deliver* — L1: "Confirming the sale prepared a transfer for the warehouse." L2: "Delivery smart button / Inventory ▸ Deliveries ▸ Validate."
7. *Invoice* — L1: "Delivered goods can now be billed." L2: "On the sales order: Create Invoice ▸ Regular ▸ Create Draft ▸ Confirm."
8. *Payment* — L1: "Money arrived: record it where the invoice lives." L2: "On the invoice: Pay ▸ Bank ▸ Create Payment."
9. *Profit* — L1: "Which report compares revenue and expenses?" L2: "Accounting ▸ Reporting ▸ Profit and Loss, read Net Profit."

## 4. "Issues" feedback (never fixes anything)

Per card, compare the player's document with the target and list what looks off, without doing it:
- 1: wrong type ("a desk is something you store: Track Inventory?"), price/cost out of range, missing vendor line or wrong min qty/price.
- 2: wrong vendor/product/qty/price ("the vendor agreed on a different price for 10"), still draft.
- 3: quantity received ≠ 10 (explain backorder), receipt of another vendor.
- 4: bill not linked to the PO, still draft, amount differs from the PO → trigger the bonus-star prompt.
- 5: wrong customer/qty/price; not sent yet (stage hint) vs confirmed.
- 6: delivering a different order's picking; stock not available (note: Odoo lets you force it, stock may go negative).
- 7: invoice not from the SO, wrong qty, still draft.
- 8: amount ≠ invoice total, wrong journal.
- 9: wrong number → "Look at the Net Profit line, and remember accounting method changes expense timing".

## 5. Scene / props needed

One scene, three zones (office · warehouse with dock · bank/laptop corner), reusing the POC's look. Bot (warehouse worker) keeps its living behaviour.

- **Office desk + monitor** (reuse terminal): shows the current card number/document name; click opens the card menu (New / Open my document / App shortcut list).
- **Chat/phone bubbles** for NPC dialogue per card (HTML overlay, not 3D).
- **Product catalog board** (card 1) – shows Large Desk when created.
- **Dock doors 1–5 + truck "Wood Corner"** (new): truck arrives and parks at dock 3 when the PO is confirmed; unloads 10 boxes when the receipt is Done (bot + forklift carry).
- **Racks with desk boxes** (reuse racks/pallets): stock count = real on-hand (10 → 7 after delivery).
- **Customer pickup truck / outbound dock** (new, or reuse truck recolored "Azure Interior") for card 6.
- **Bill/paper stack on the desk** (new) with the $1,100 invoice sheet (card 4).
- **Order board** (reuse): quotation → SO → delivered → invoiced → paid.
- **Bank corner**: laptop with notification when the invoice is posted; cash/coin celebration on payment.
- **P&L board** (card 9): chart/flags wall, filled with real numbers after the player answers.
- Confetti + stars per card; larger celebration at the end.

World reacts to document stages only (confirmed Odoo state), never before.

## 6. Scoring

PDF: 2 ★ per card (card 4 has 3 with the bonus); trophies from total stars across the whole game (16+=5 … 7–9=1). Proposal for Level 1: 2 ★ if solved without hints, 1 ★ if hint level 2 used, bonus ★ on card 4; level trophies by % of max (18 base + 1 bonus). Hints used persisted server-side per card.

## 7. End recap ("the back of the card")

Per card, after completion: steps done (as in the POC) and what Odoo recorded, e.g.: product vendor price → RFQ/PO → receipt (stock +10) → vendor bill (3-way match: PO / receipt / bill) → quotation/SO → delivery (stock −3) → customer invoice → payment (invoice "In Payment"; bank sync idea) → P&L (revenue 660, purchase expense 1,000, net −340 or +660 and why). PDF insights to surface: the "magic of integration" (smart buttons ≈ Inventory app), forcing a transfer can make stock negative, backorders, taxes vary by country, bank synchronization. Final screen: stars, trophy, hints used, "Next: Run a Store / Sell Online / Sell Services / Manufacture" (PDF congratulations card).

## 8. Differences from PROJECT_BRIEF §1 / PDF

- PDF card 0 ("Install the apps / create your database") is **skipped**: the modules are pre-installed with the addon. Say so in the intro.
- PDF tells the player to look at the back only after attempting; our two-level hints and the recap replace it, consistent with principles 2 and 6.
- PDF scores by stars on paper; we count hints (principle 2) and map them to stars.
- No principle is contradicted. Card 9 is the only card without a created document (principle 1): handled with a typed answer checked server-side.

## 9. Environment / data requirements

- Dependencies: `purchase`, `sale_management` (or `sale`), `account`, `stock_account`/`purchase_stock`/`sale_stock` (auto-created receipt and delivery).
- Seeded fixtures: vendor Wood Corner, customer Azure Interior (Brandon), company US with 15 % sale & purchase tax, Bank journal. Product is **not** seeded (player creates it).
- Pre-existing "Large Desk" products from earlier attempts are ignored: evaluators only look at records created by the player since the attempt started.
- Quotation Send needs outgoing mail not to block (mails may simply queue).

## 10. Open questions

1. Bonus ★ (card 4): detect "noticed the price difference" as a chatter message to the vendor **or** a credit note on the bill — or also an explicit "Did you notice?" prompt in the recap?
2. Accounting localisation: fix the company to the US/15 % tax fixtures, or evaluate amounts relative to whatever taxes the DB has (my recommendation: relative)?
3. Card 9: typed answer in the game, or just detect that the P&L report was opened?
