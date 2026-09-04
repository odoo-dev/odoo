# Inheriting views

Anchor a view inheritance on a **stable, identifying attribute** — an
element's `name` — never on document position.

```xml
<!-- good — the shorthand: a field locator matches by name alone -->
<field name="partner_id" position="after">
    <field name="delivery_instructions"/>
</field>

<!-- good — xpath when the shorthand can't express the match -->
<xpath expr="//page[@name='other_information']//field[@name='user_id']" position="attributes">
    <attribute name="readonly">1</attribute>
</xpath>

<!-- bad — breaks as soon as the parent view inserts or reorders anything -->
<xpath expr="//group[2]/field[3]" position="after">
    <field name="delivery_instructions"/>
</xpath>
```

Shorthand matching is asymmetric: a `field` element matches the first field
with the same `name` — in document order at **any** depth (use xpath when the
name recurs in an embedded subview), other locator attributes ignored. Any
**other** tag matches the first node with the same tag carrying all the
locator's attributes with equal values (`position` excepted); extra attributes
on the target are fine.

## Why

- The parent view belongs to another module that changes it freely; a
  positional match silently lands the change on the wrong element or raises
  at install on every parent reorganization.
- The shorthand form reads as "this element, changed", and fails loudly if
  the anchor disappears.

## Record conventions

- An inheriting view reuses the **same xml id** as the original record; its
  `name` carries an `.inherit.<details>` suffix.
- A new **primary** view (a variant, not an extension) sets `mode="primary"`
  and needs no inherit suffix.
- Don't re-add fields the parent view already renders.
