# Systray

## Overview

The systray is the zone on the right of the navbar that contains various small
components (called _systray items_). These components usually display some sort
of information (like the number of unread message), notifications and/or let the
user interact with them.

## Adding a systray item

Adding a systray item is a two step process: create a component and register it
to the systray registry.

The systray registry takes an object with the following properties:

- `name (string)`: an unique string describing the systray item (technical name,
  usually prefixed by the current module name)
- `Component`: the Component class that will be used to display the item
- `sequence (number, optional)`: if given, this number will be used to order the
  items.
