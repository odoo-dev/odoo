# Dropdown Component

## Overview

As dropdowns are common in Odoo, we decided to make a generic dropdown component.

It contains all the logic you can usually expect a dropdown to behave.

We made the choice to develop this simple component with as little style as possible, therefore it is your responsibility to make yours look awesome 😎!

### Features

- Toggle the list on click
- Direct siblings dropdowns: when one is open, toggle others on hover
- Close on outside click
- Close the list when an item is selected
- Emits an event to inform which list item is clicked
- Infinite multi-level support
- SIY: style it yourself

## API

### Behind the scenes

A `<Dropdown/>` component is simply a `<div class="o_dropdown"/>` having a `<button/>` next to an unordered list (`<ul/>`). The button is responsible for the list being present in the DOM or not.

A `<DropdownItem/>` is simply a list item (`<li/>`). On click, you can ask this item to return you a payload (which you'll receive back in a custom `dropdown-item-selected` event). This payload is an object, so feel free to put anything you want in it. Most likely, you will use ids as payloads to know which item was clicked.

Illustration of what the final DOM could look like:

```html
<div class="o_dropdown">
  <button>Click me to toggle the dropdown menu !</button>
  <!-- following <ul/> list will or won't appear in the DOM depending on the state controlled by the button -->
  <ul>
    <li>Menu Item 1</li>
    <li>Menu Item 2</li>
  </ul>
</div>
```

#### Slots

In order to properly use a `<Dropdown/>` component, you need to populate two [OWL slots](https://github.com/odoo/owl/blob/master/doc/reference/slots.md):

<dl>
  <dt><strong>The <code>default</code> slot</strong></dt>
  <dd>It contains the <strong>toggler elements of your dropdown</strong> and will take place inside your dropdown <code>&lt;button/></code> element.</dd>
  <dt><strong>The <code>menu</code> slot</strong></dt>
  <dd>
    It contains the <strong>elements of the dropdown menu itself</strong> and will take place inside your dropdown <code>&lt;ul/></code> element.<br/>
    Although it is not mandatory, you will usually place at least one <code>&lt;DropdownItem/></code> element in the <code>menu</code> slot.
  </dd>
</dl>

#### Manage items selection

When a `<DropdownItem/>` gets selected, it emits a custom `dropdown-item-selected` event containing its payload. (see [OWL Business Events](https://github.com/odoo/owl/blob/master/doc/reference/event_handling.md#business-dom-events))

If you want to react when a `<DropdownItem/>` gets selected, you need to define two things:

<dl>
  <dt>The <code>dropdown-item-selected</code> event listener</dt>
  <dd>It will receive the payload of the selected item.</dd>
  <dt>A <code>payload</code> for each <code>&lt;DropdownItem/></code> element</dt>
  <dd>They are just JS objects you declare the way you want. If a payload is not specified, it defaults to <code>null</code>.</dd>
</dl>

### Direct Siblings Dropdowns

When many dropdowns share **_a single parent in the DOM_**, they will automatically notify each other about their state changes.

Doing so, **_when one sibling dropdown is open_**, the others will **_automatically open themselves on hover_**.

### Available Properties

#### `<Dropdown/>` props

| Prop name      | Default Value | Value type | Description                                      |
| -------------- | ------------- | ---------- | ------------------------------------------------ |
| `startOpen`    | `false`       | boolean    | initial dropdown open state                      |
| `menuClass`    | /             | string     | could be used to style the dropdown menu `<ul/>` |
| `togglerClass` | /             | string     | could be used to style the toggler `<button/>`   |

#### `<DropdownItem/>` props

| Prop name           | Default Value | Value type                   | Description                                                                            |
| ------------------- | ------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| `payload`           | null          | Object                       | item payload that will be part of the `dropdown-item-selected` event                   |
| `parentClosingMode` | `all`         | `none` \| `closest` \| `all` | when item clicked, control which parent dropdown will get closed: none, closest or all |

## Usage

### Step 1: make it appear on your app

So in your qweb template, you would write something like that:

```xml
<Dropdown>
    <!-- "default" slot content should be defined here -->
    Click me to toggle the dropdown menu !
    <t t-set-slot="menu">
      <!-- "dropdown" slot content should be defined here-->
      <DropdownItem>Menu Item 1</DropdownItem>
      <DropdownItem>Menu Item 2</DropdownItem>
    </t>
</Dropdown>
```

And in the DOM it would get translated similarly to:

```xml
<div class="o_dropdown">
  <button>
    <!-- "default" slot content will take place here -->
    Click me to toggle the dropdown menu !
  </button>

  <ul>
    <!-- "dropdown" slot content will take place here -->
    <li>Menu Item 1</li>
    <li>Menu Item 2</li>
  </ul>
</div>
```

### Step 2: make it react to clicks

So in your qweb template you would write something like that:

```xml
<Dropdown t-on-dropdown-item-selected="onItemSelected">
  …
  <t t-set-slot="menu">
    …
    <DropdownItem payload="{a:15}">Menu Item</DropdownItem>
    …
  </t>
</Dropdown>
```

And in your JS file, when an item is selected, you would receive the payload back like that:

```js
itemSelected(event) {
  const eventDetail = event.detail;
  const itemPayload = eventDetail.payload;
  console.log(itemPayload.a === 15);
}
```

In this case, if you click on this menu item, the console will print « true ».

### Step 3: make it shine

Now that you understand the basics of the Dropdown Component, all you need to do is style it the way you want.

✨ Are you ready to make it shine? ✨

- `<Dropdown class="my_class"/>` will become
  ```xml
  <div class="o_dropdown my_class">...</div>
  ```
- `<Dropdown togglerClass="my_class"/>` will become
  ```xml
  <div class="o_dropdown">
    <button class="my_class">...</button>
    ...
  </div>
  ```
- `<Dropdown menuClass="my_class"/>` will become
  ```xml
  <div class="o_dropdown">
    <button>...</button>
    <ul class="my_class">...</ul>
  </div>
  ```
- `<DropdownItem class="my_class"/>` will become
  ```xml
  <li class="my_class" />
  ```

## More Examples

### Direct Siblings Dropdown

When one dropdown toggler is clicked (**File**, **Edit** or **About**), the others will open themselves on hover.

This example uses the dropdown components without added style.

```xml
<div t-on-dropdown-item-selected="onItemSelected">
  <Dropdown>
    <span>File</span>
    <t t-set-slot="menu">
      <DropdownItem payload="'file-open'">Open</DropdownItem>
      <DropdownItem payload="'file-new-document'">New Document</DropdownItem>
      <DropdownItem payload="'file-new-spreadsheet'">New Spreadsheet</DropdownItem>
    </t>
  </Dropdown>
  <Dropdown>
    <span>Edit</span>
    <t t-set-slot="menu">
      <DropdownItem payload="'edit-undo'">Undo</DropdownItem>
      <DropdownItem payload="'edit-redo'">Redo</DropdownItem>
      <DropdownItem payload="'edit-find'">Search</DropdownItem>
    </t>
  </Dropdown>
  <Dropdown>
    <span>About</span>
    <t t-set-slot="menu">
      <DropdownItem payload="'about-help'">Help</DropdownItem>
      <DropdownItem payload="'about-update'">Check update</DropdownItem>
    </t>
  </Dropdown>
</div>
```

### Multi-level Dropdown

This example uses the dropdown components without added style.

#### Flat version

```xml
<Dropdown t-on-dropdown-item-selected="onItemSelected" owl="1">
  <span>File</span>
  <t t-set-slot="menu">
    <DropdownItem payload="'file-open'">Open</DropdownItem>
    <t t-call="addon.Dropdown.File.New"/>
    <DropdownItem payload="'file-save'">Save</DropdownItem>
    <t t-call="addon.Dropdown.File.Save.As"/>
  </t>
</Dropdown>

<Dropdown t-name="addon.Dropdown.File.New" owl="1">
  <span>New</span>
  <t t-set-slot="menu">
    <DropdownItem payload="'file-new-document'">Document</DropdownItem>
    <DropdownItem payload="'file-new-spreadsheet'">Spreadsheet</DropdownItem>
  </t>
</Dropdown>

<Dropdown t-name="addon.Dropdown.File.Save.As" owl="1">
  <span>Save as...</span>
  <t t-set-slot="menu">
    <DropdownItem payload="'file-save-as-csv'">CSV</DropdownItem>
    <DropdownItem payload="'file-save-as-pdf'">PDF</DropdownItem>
  </t>
</Dropdown>
```

#### Nested version

```xml
<Dropdown t-on-dropdown-item-selected="onItemSelected" owl="1">
  <span>File</span>
  <t t-set-slot="menu">
    <DropdownItem payload="'file-open'">Open</DropdownItem>
    <Dropdown>
      <span>New</span>
      <t t-set-slot="menu">
        <DropdownItem payload="'file-new-document'">Document</DropdownItem>
        <DropdownItem payload="'file-new-spreadsheet'">Spreadsheet</DropdownItem>
      </t>
    </Dropdown>
    <DropdownItem payload="'file-save'">Save</DropdownItem>
    <Dropdown>
      <span>Save as...</span>
      <t t-set-slot="menu">
        <DropdownItem payload="'file-save-as-csv'">CSV</DropdownItem>
        <DropdownItem payload="'file-save-as-pdf'">PDF</DropdownItem>
      </t>
    </Dropdown>
  </t>
</Dropdown>
```

### Recursive Multi-level Dropdown

This example make use of inline style.

```xml
<div t-name="addon.MainTemplate" t-on-dropdown-item-selected="onItemSelected">
  <t t-call="addon.RecursiveDropdown">
    <t t-set="name" t-value="'Main Menu'" />
    <t t-set="items" t-value="state.menuItems" />
  </t>
</div>

<Dropdown t-name="addon.RecursiveDropdown" owl="1">
  <div style="display: inline-flex; color:white; background-color: red; padding: 2px; border: 1px white solid; opacity: 50%">
    <t t-esc="name" />
  </div>

  <t t-set-slot="menu">
    <t t-foreach="items" t-as="item" t-key="item.id">
      <t t-if="!item.childrenTree.length">
        <!-- If this item has no child: make it a <DropdownItem/> -->
        <DropdownItem payload="item">
          <div style="display: inline-flex; color:white; background-color: blue; padding: 2px;border: 1px white solid;  opacity: 50%;">
            <t t-esc="item.name" />
          </div>
        </DropdownItem>
      </t>

      <!-- Else: recursively call the current dropdown template. -->
      <t t-else="" t-call="addon.RecursiveDropdown">
        <t t-set="name" t-value="item.name" />
        <t t-set="items" t-value="item.childrenTree" />
      </t>
    </t>
  </t>
</Dropdown>
```
