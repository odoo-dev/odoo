/** @odoo-module */

import Class from 'web.Class';
import core from 'web.core';
import Dialog from "web.Dialog";
const _t = core._t;

/**
 * Behavior to be injected through @see FieldHtmlInjector to @see OdooEditor
 * blocks which have specific classes calling for such behaviors.
 *
 * A typical usage could be the following:
 * - An @see OdooEditor block like /template has the generic class:
 *   @see o_knowledge_behavior_anchor to signify that it needs to have a
 *   behavior injected.
 * - This block also has the specific class:
 *   @see o_knowledge_behavior_type_[behaviorType] which specifies the type of
 *   behavior that needs to be injected. @see FieldHtmlInjector has a dictionary
 *   mapping those classes to the correct behavior class.
 *
 * The @see KnowledgeBehavior is a basic behavior intended to be overriden for
 * more complex implementations
 */
const KnowledgeBehavior = Class.extend({
    /**
     * @param {Widget} handler @see FieldHtmlInjector which has access to
     *                         widget specific functions
     * @param {Element} anchor dom node to apply the behavior to
     * @param {string} mode edit/readonly
     */
    init: function (handler, anchor, mode) {
        this.handler = handler;
        this.anchor = anchor;
        this.mode = mode;
        if (this.handler.editor) {
            this.handler.editor.observerUnactive('knowledge_attributes');
        }
        this.applyAttributes();
        if (this.handler.editor) {
            this.handler.editor.observerActive('knowledge_attributes');
        }
        this.applyBehaviors();
    },
    /**
     * Add specific attributes related to this behavior to this.anchor
     */
    applyAttributes: function () {},
    /**
     * Add specific listeners related to this behavior to this.anchor
     */
    applyBehaviors: function () {},
});

/**
 * A behavior to set a block as uneditable. Such a block can have children
 * marked as @see o_knowledge_content which are set as editable
 */
const ContentsContainerBehavior = KnowledgeBehavior.extend({
    /**
     * @override
     */
    applyAttributes: function () {
        this._super.apply(this, arguments);
        if (this.mode === 'edit') {
            this.anchor.querySelectorAll('.o_knowledge_content').forEach(element => {
                element.setAttribute('contenteditable', 'true');
            });
            this.anchor.setAttribute('contenteditable', 'false');
        }
    },
});
/**
 * A behavior for the /article command @see Wysiwyg
 */
const ArticleBehavior = KnowledgeBehavior.extend({
    /**
     * @override
     */
    init: function () {
        this.busy = false;
        this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    applyAttributes: function () {
        this._super.apply(this, arguments);
        if (this.mode === 'edit') {
            this.anchor.setAttribute('contenteditable', 'false');
        }
    },
    /**
     * @override
     */
    applyBehaviors: function () {
        this._super.apply(this, arguments);
        this.anchor.addEventListener("click", async function (ev) {
            if (this.busy) {
                ev.preventDefault();
                ev.stopPropagation();
            } else {
                this.busy = true;
                await this._onLinkClick(ev);
                this.busy = false;
            }
        }.bind(this));
        this.anchor.addEventListener("dblclick", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
        });
    },
    /**
     * When the user clicks on an article link, we can directly open the
     * article in the current view without having to reload the page.
     *
     * @param {Event} event
     */
    _onLinkClick: async function (event) {
        const res_id = parseInt(event.currentTarget.dataset.res_id);
        if (res_id) {
            event.stopPropagation();
            event.preventDefault();
            const actionPromise = this.handler.do_action('knowledge.action_home_page', {
                additional_context: {
                    res_id: res_id
                }
            });
            await actionPromise.catch(() => {
                Dialog.alert(this,
                    _t("This article was deleted."), {
                    title: _t('Error'),
                });
            });
        }
    },
});

export {
    KnowledgeBehavior,
    ContentsContainerBehavior,
    ArticleBehavior,
};
