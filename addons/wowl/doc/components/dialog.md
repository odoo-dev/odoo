# Dialog

## Overview

The Dialog component is one of the main bricks of the web client.

Here are its props

| Name           | Type    | Default    | Description                                                       |
| -------------- | ------- | ---------- | ----------------------------------------------------------------- |
| `fullscreen`   | boolean | false      | a class `o_modal_full` is added on the element "div.modal"        |
| `renderFooter` | boolean | true       | the footer contains a slot `buttons` and a default button `Ok`    |
| `renderHeader` | boolean | true       | the header contains a title and a button `x` for "closing" dialog |
| `size`         | string  | "modal-lg" | used to set the dialog size (available suffix: "xl", "lg", "sm")  |
| `title`        | string  | "Odoo"     |                                                                   |

## Slots

Beside the props, the configuration of a dialog is done via two slots:

The `default` slot should be used to define the main content of the dialog (display some text or subcomponents).

The slot `buttons` can be used to add custom buttons in the dialog footer.
If the footer is displayed and that slot is not used, a default button `Ok` is added to the footer.
A click on that button triggers the event `dialog-closed` via the method `_close` (see section below).

So typically, the parent template could look like to

```xml
    <div>
        <!-- parent main content -->
        <Dialog t-if="state.displayDialog" t-on-dialog-closed="_onDialogClosed">
            <SubComponent t-on-subcomponent-clicked="_onSubcomponentClicked"/>
            <t t-set="buttons">
                <button t-on-click="onConfirmClick">Confirm</button>
                <button t-on-click="onDiscardClick">Discard</button>
            </t>
        </Dialog>
        <!-- ... -->
    </div>
```

## Communication with parent

The dialog never closes itself. The dialog parent is responsible of opening/closing the dialog.
When the user click on the button `x` (in the header) or `Ok` (default button in the footer),
a custom event `dialog-closed` is triggered, allowing the parent to take action or not.

## Location in the dom

The Dialog class uses a portal to locate itself in a div with class `o_dialog_container` but the
communication with the parent goes as usual: via props or custom/dom events.
