# Action Manager Service

| Technical name   | Dependencies |
| ---------------- | ------------ |
| `action_manager` | `rpc`        |

## Overview

The action manager handles every [`ir.actions.actions`](https://www.odoo.com/documentation/14.0/reference/actions.html) triggered by user interaction.
Clicking on a menu item, on a button, or changing of view type are all examples of
interactions handled by the action manager.

The action manager gives priority to the most recent user request, and will drop
a request if another one comes after. The second request obviously takes the state
of the action manager as it was before the first request. When possible, unnecessary RPC
and rendering must be canceled if another request is made by the user.

## API

The action_manager service currently exports only one method `doAction` whose signature is:

```ts
doAction(action: ActionRequest, options: ActionOptions): void;
```

An `ActionRequest` can be either its full XML id, its postgres id, the tag of the client action. It will handle a basic object containing the few necessary keys for immediate execution in the future.
`ActionOptions` is .......

## Technical notes

The action manager service tells the world that a rendering is necessary by triggering the
event `action_manager:update` on the [main bus](/bus.md). Its payload is an array of descriptors of the next interface.
To allow managing for interrupting a request to do another, the action manager service listens on the event `action_manager:finalize` on the main bus. It will commit the state of the interface when it is rendered.
**This event should not be triggered by anything else than the dedicated Component `ActionContainer` and at any other moment than after it is patched.**
