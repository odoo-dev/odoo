
odoo.define('web.owl_dialog_tests', function (require) {
    "use strict";

    const LegacyDialog = require('web.Dialog');
    const makeTestEnvironment = require('web.test_env');
    const Dialog = require('web.OwlDialog');
    const testUtils = require('web.test_utils');

    const { makeLegacyDialogMappingTestEnv } = require('@web/../tests/helpers/legacy_env_utils');
    const { Dialog: WowlDialog } = require("@web/components/dialog/dialog");
    const { getFixture, nextTick, patchWithCleanup } = require("@web/../tests/helpers/utils");

    const { Component, tags, useState, mount } = owl;
    const EscapeKey = { key: 'Escape', keyCode: 27, which: 27 };
    const { xml } = tags;

    QUnit.module('core', {}, function () {
        QUnit.module('OwlDialog');

        QUnit.test("Rendering of all props", async function (assert) {
            assert.expect(35);

            class SubComponent extends Component {
                // Handlers
                _onClick() {
                    assert.step('subcomponent_clicked');
                }
            }
            SubComponent.template = xml`<div class="o_subcomponent" t-esc="props.text" t-on-click="_onClick"/>`;

            class Parent extends Component {
                constructor() {
                    super(...arguments);
                    this.state = useState({ textContent: "sup" });
                }
                // Handlers
                _onButtonClicked(ev) {
                    assert.step('button_clicked');
                }
                _onDialogClosed() {
                    assert.step('dialog_closed');
                }
            }
            Parent.components = { Dialog, SubComponent };
            Parent.env = makeTestEnvironment();
            Parent.template = xml`
                <Dialog
                    backdrop="state.backdrop"
                    contentClass="state.contentClass"
                    fullscreen="state.fullscreen"
                    renderFooter="state.renderFooter"
                    renderHeader="state.renderHeader"
                    size="state.size"
                    subtitle="state.subtitle"
                    technical="state.technical"
                    title="state.title"
                    t-on-dialog-closed="_onDialogClosed"
                    >
                    <SubComponent text="state.textContent"/>
                    <t t-set="buttons">
                        <button class="btn btn-primary" t-on-click="_onButtonClicked">The Button</button>
                    </t>
                </Dialog>`;

            const parent = new Parent();
            await parent.mount(testUtils.prepareTarget());
            const dialog = document.querySelector('.o_dialog');

            // Helper function
            async function changeProps(key, value) {
                parent.state[key] = value;
                await testUtils.nextTick();
            }

            // Basic layout with default properties
            assert.containsOnce(dialog, '.modal.o_technical_modal');
            assert.hasClass(dialog.querySelector('.modal .modal-dialog'), 'modal-lg');
            assert.containsOnce(dialog, '.modal-header > button.close');
            assert.containsOnce(dialog, '.modal-footer > button.btn.btn-primary');
            assert.strictEqual(dialog.querySelector('.modal-body').innerText.trim(), "sup",
                "Subcomponent should match with its given text");

            // Backdrop (default: 'static')
            // Static backdrop click should focus first button
            // => we need to reset that property
            dialog.querySelector('.btn-primary').blur(); // Remove the focus explicitely
            assert.containsNone(document.body, '.modal-backdrop'); // No backdrop *element* for Odoo modal...
            assert.notEqual(window.getComputedStyle(dialog.querySelector('.modal')).backgroundColor, 'rgba(0, 0, 0, 0)'); // ... but a non transparent modal
            await testUtils.dom.click(dialog.querySelector('.modal'));
            assert.strictEqual(document.activeElement, dialog.querySelector('.btn-primary'),
                "Button should be focused when clicking on backdrop");
            assert.verifySteps([]); // Ensure not closed
            dialog.querySelector('.btn-primary').blur(); // Remove the focus explicitely

            await changeProps('backdrop', false);
            assert.containsNone(document.body, '.modal-backdrop'); // No backdrop *element* for Odoo modal...
            assert.strictEqual(window.getComputedStyle(dialog.querySelector('.modal')).backgroundColor, 'rgba(0, 0, 0, 0)');
            await testUtils.dom.click(dialog.querySelector('.modal'));
            assert.notEqual(document.activeElement, dialog.querySelector('.btn-primary'),
                "Button should not be focused when clicking on backdrop 'false'");
            assert.verifySteps([]); // Ensure not closed

            await changeProps('backdrop', true);
            assert.containsNone(document.body, '.modal-backdrop'); // No backdrop *element* for Odoo modal...
            assert.notEqual(window.getComputedStyle(dialog.querySelector('.modal')).backgroundColor, 'rgba(0, 0, 0, 0)'); // ... but a non transparent modal
            await testUtils.dom.click(dialog.querySelector('.modal'));
            assert.notEqual(document.activeElement, dialog.querySelector('.btn-primary'),
                "Button should not be focused when clicking on backdrop 'true'");
            assert.verifySteps(['dialog_closed']);

            // Dialog class (default: '')
            await changeProps('contentClass', 'my_dialog_class');
            assert.hasClass(dialog.querySelector('.modal-content'), 'my_dialog_class');

            // Full screen (default: false)
            assert.doesNotHaveClass(dialog.querySelector('.modal'), 'o_modal_full');
            await changeProps('fullscreen', true);
            assert.hasClass(dialog.querySelector('.modal'), 'o_modal_full');

            // Size class (default: 'large')
            await changeProps('size', 'extra-large');
            assert.strictEqual(dialog.querySelector('.modal-dialog').className, 'modal-dialog modal-xl',
                "Modal should have taken the class modal-xl");
            await changeProps('size', 'medium');
            assert.strictEqual(dialog.querySelector('.modal-dialog').className, 'modal-dialog',
                "Modal should not have any additionnal class with 'medium'");
            await changeProps('size', 'small');
            assert.strictEqual(dialog.querySelector('.modal-dialog').className, 'modal-dialog modal-sm',
                "Modal should have taken the class modal-sm");

            // Subtitle (default: '')
            await changeProps('subtitle', "The Subtitle");
            assert.strictEqual(dialog.querySelector('span.o_subtitle').innerText.trim(), "The Subtitle",
                "Subtitle should match with its given text");

            // Technical (default: true)
            assert.hasClass(dialog.querySelector('.modal'), 'o_technical_modal');
            await changeProps('technical', false);
            assert.doesNotHaveClass(dialog.querySelector('.modal'), 'o_technical_modal');

            // Title (default: 'Odoo')
            assert.strictEqual(dialog.querySelector('h4.modal-title').innerText.trim(), "Odoo" + "The Subtitle",
                "Title should match with its default text");
            await changeProps('title', "The Title");
            assert.strictEqual(dialog.querySelector('h4.modal-title').innerText.trim(), "The Title" + "The Subtitle",
                "Title should match with its given text");

            // Reactivity of buttons
            await testUtils.dom.click(dialog.querySelector('.modal-footer .btn-primary'));

            // Render footer (default: true)
            await changeProps('renderFooter', false);
            assert.containsNone(dialog, '.modal-footer');

            // Render header (default: true)
            await changeProps('renderHeader', false);
            assert.containsNone(dialog, '.header');

            // Reactivity of subcomponents
            await changeProps('textContent', "wassup");
            assert.strictEqual(dialog.querySelector('.o_subcomponent').innerText.trim(), "wassup",
                "Subcomponent should match with its given text");
            await testUtils.dom.click(dialog.querySelector('.o_subcomponent'));

            assert.verifySteps(['button_clicked', 'subcomponent_clicked']);

            parent.destroy();
        });

        QUnit.test("Interactions between multiple dialogs", async function (assert) {
            assert.expect(22);

            const { legacyEnv } = await makeLegacyDialogMappingTestEnv();
            class Parent extends Component {
                constructor() {
                    super(...arguments);
                    this.dialogIds = useState([]);
                }
                // Handlers
                _onDialogClosed(id) {
                    assert.step(`dialog_${id}_closed`);
                    this.dialogIds.splice(this.dialogIds.findIndex(d => d === id), 1);
                }
            }
            Parent.components = { Dialog };
            Parent.env = legacyEnv;
            Parent.template = xml`
                <div>
                    <Dialog t-foreach="dialogIds" t-as="dialogId" t-key="dialogId"
                        contentClass="'dialog_' + dialogId"
                        t-on-dialog-closed="_onDialogClosed(dialogId)"
                    />
                </div>`;

            const parent = new Parent();
            await parent.mount(testUtils.prepareTarget());

            // Dialog 1 : Owl
            parent.dialogIds.push(1);
            await testUtils.nextTick();
            // Dialog 2 : Legacy
            new LegacyDialog(null, {}).open();
            await testUtils.nextTick();
            // Dialog 3 : Legacy
            new LegacyDialog(null, {}).open();
            await testUtils.nextTick();
            // Dialog 4 : Owl
            parent.dialogIds.push(4);
            await testUtils.nextTick();
            // Dialog 5 : Owl
            parent.dialogIds.push(5);
            await testUtils.nextTick();
            // Dialog 6 : Legacy (unopened)
            const unopenedModal = new LegacyDialog(null, {});
            await testUtils.nextTick();

            // Manually closes the last legacy dialog. Should not affect the other
            // existing dialogs (3 owl and 2 legacy).
            unopenedModal.close();

            let modals = document.querySelectorAll('.modal');
            assert.notOk(modals[modals.length - 1].classList.contains('o_inactive_modal'),
                "last dialog should have the active class");
            assert.notOk(modals[modals.length - 1].classList.contains('o_legacy_dialog'),
                "active dialog should not have the legacy class");
            assert.containsN(document.body, '.o_dialog', 3);
            assert.containsN(document.body, '.o_legacy_dialog', 2);

            // Reactivity with owl dialogs
            await testUtils.dom.triggerEvent(modals[modals.length - 1], 'keydown', EscapeKey); // Press Escape

            modals = document.querySelectorAll('.modal');
            assert.notOk(modals[modals.length - 1].classList.contains('o_inactive_modal'),
                "last dialog should have the active class");
            assert.notOk(modals[modals.length - 1].classList.contains('o_legacy_dialog'),
                "active dialog should not have the legacy class");
            assert.containsN(document.body, '.o_dialog', 2);
            assert.containsN(document.body, '.o_legacy_dialog', 2);

            await testUtils.dom.click(modals[modals.length - 1].querySelector('.btn.btn-primary')); // Click on 'Ok' button

            modals = document.querySelectorAll('.modal');
            assert.containsOnce(document.body, '.modal.o_legacy_dialog:not(.o_inactive_modal)',
                "active dialog should have the legacy class");
            assert.containsOnce(document.body, '.o_dialog');
            assert.containsN(document.body, '.o_legacy_dialog', 2);

            // Reactivity with legacy dialogs
            await testUtils.dom.triggerEvent(modals[modals.length - 1], 'keydown', EscapeKey);

            modals = document.querySelectorAll('.modal');
            assert.containsOnce(document.body, '.modal.o_legacy_dialog:not(.o_inactive_modal)',
                "active dialog should have the legacy class");
            assert.containsOnce(document.body, '.o_dialog');
            assert.containsOnce(document.body, '.o_legacy_dialog');

            await testUtils.dom.click(modals[modals.length - 1].querySelector('.close'));

            modals = document.querySelectorAll('.modal');
            assert.notOk(modals[modals.length - 1].classList.contains('o_inactive_modal'),
                "last dialog should have the active class");
            assert.notOk(modals[modals.length - 1].classList.contains('o_legacy_dialog'),
                "active dialog should not have the legacy class");
            assert.containsOnce(document.body, '.o_dialog');
            assert.containsNone(document.body, '.o_legacy_dialog');

            parent.unmount();

            assert.containsNone(document.body, '.modal');
            // dialog 1 is closed through the removal of its parent => no callback
            assert.verifySteps(['dialog_5_closed', 'dialog_4_closed']);

            parent.destroy();
        });

        QUnit.test("Interactions between legacy owl dialogs and new owl dialogs", async function (assert) {
            assert.expect(7);

            const { legacyEnv, env } = await makeLegacyDialogMappingTestEnv();

            // OwlDialog env
            patchWithCleanup(Dialog.prototype, {
                setup() {
                    this.env = legacyEnv;
                    this._super();
                }
            });

            class Parent extends Component {
                setup() {
                    super.setup();
                    this.dialogs = useState([]);
                }
                // Handlers
                _onDialogClosed(id) {
                    assert.step(`dialog_${id}_closed`);
                    this.dialogs.splice(this.dialogs.findIndex(d => d.id === id), 1);
                }
            }
            Parent.template = xml`
                <div>
                    <div class="o_dialog_container"/>
                    <t t-foreach="dialogs" t-as="dialog" t-key="dialog.id" t-component="dialog.class"
                        contentClass="'dialog_' + dialog.id"
                        t-on-dialog-closed="_onDialogClosed(dialog.id)" />
                </div>`;
            const parent = await mount(Parent, { env, target: getFixture() });

            parent.dialogs.push({ id: 1, class: WowlDialog });
            await nextTick();
            parent.dialogs.push({ id: 2, class: Dialog });
            await nextTick();
            parent.dialogs.push({ id: 3, class: WowlDialog });
            await nextTick();

            assert.verifySteps([]);
            await testUtils.dom.triggerEvent(window, 'keydown', EscapeKey); // Press Escape
            assert.verifySteps(['dialog_3_closed']);
            await testUtils.dom.triggerEvent(window, 'keydown', EscapeKey); // Press Escape
            assert.verifySteps(['dialog_2_closed']);
            await testUtils.dom.triggerEvent(window, 'keydown', EscapeKey); // Press Escape
            assert.verifySteps(['dialog_1_closed']);

            parent.unmount();
            parent.destroy();
        });
    });

    QUnit.test("Z-index toggling and interactions", async function (assert) {
        assert.expect(3);

        function createCustomModal(className) {
            const $modal = $(
                `<div role="dialog" class="${className}" tabindex="-1">
                    <div class="modal-dialog medium">
                        <div class="modal-content">
                            <main class="modal-body">The modal body</main>
                        </div>
                    </div>
                </div>`
            ).appendTo('body').modal();
            const modal = $modal[0];
            modal.destroy = function () {
                $modal.modal('hide');
                this.remove();
            };
            return modal;
        }

        class Parent extends Component {
            constructor() {
                super(...arguments);
                this.state = useState({ showSecondDialog: true });
            }
        }
        Parent.components = { Dialog };
        Parent.env = makeTestEnvironment();
        Parent.template = xml`
            <div>
                <Dialog/>
                <Dialog t-if="state.showSecondDialog"/>
            </div>`;

        const parent = new Parent();
        await parent.mount(testUtils.prepareTarget());

        const frontEndModal = createCustomModal('modal');
        const backEndModal = createCustomModal('modal o_technical_modal');

        // querySelector will target the first modal (the static one).
        const owlIndexBefore = getComputedStyle(document.querySelector('.o_dialog .modal')).zIndex;
        const feZIndexBefore = getComputedStyle(frontEndModal).zIndex;
        const beZIndexBefore = getComputedStyle(backEndModal).zIndex;

        parent.state.showSecondDialog = false;
        await testUtils.nextTick();

        assert.ok(owlIndexBefore < getComputedStyle(document.querySelector('.o_dialog .modal')).zIndex,
            "z-index of the owl dialog should be incremented since the active modal was destroyed");
        assert.strictEqual(feZIndexBefore, getComputedStyle(frontEndModal).zIndex,
            "z-index of front-end modals should not be impacted by Owl Dialog activity system");
        assert.strictEqual(beZIndexBefore, getComputedStyle(backEndModal).zIndex,
            "z-index of custom back-end modals should not be impacted by Owl Dialog activity system");

        parent.destroy();
        frontEndModal.destroy();
        backEndModal.destroy();
    });
});
