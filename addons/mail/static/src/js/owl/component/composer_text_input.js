odoo.define('mail.component.ComposerTextInput', function (require) {
'use strict';

const ajax = require('web.ajax');
const utils = require('web.utils');

/**
 * ComposerInput relies on a minimal HTML editor in order to support mentions.
 */
class ComposerInput extends owl.Component {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);

        this.MENTION_THROTTLE = 200;
        this.template = 'mail.component.ComposerTextInput';
        this._editable = undefined;
        this._summernoteContext = undefined;
        this._tribute = undefined; // list of tribute mentions (partner, canned responses, etc.)

        this._searchChannelMentionSuggestions = _.throttle(
            this._searchChannelMentionSuggestions.bind(this),
            this.MENTION_THROTTLE
        );
        this._searchPartnerMentionSuggestions = _.throttle(
            this._searchPartnerMentionSuggestions.bind(this),
            this.MENTION_THROTTLE
        );
    }

    willStart() {
        return ajax.loadLibs({
            jsLibs: ['/web_editor/static/lib/summernote/summernote.js'],
            cssLibs: ['/web_editor/static/lib/summernote/summernote.css'],
        });
    }

    mounted() {
        const {
            editable,
            editablePlaceholder,
            summernoteContext,
        } = this._configSummernote();
        const tribute = this._configTribute({ editable });

        this._editable = editable;
        this._editablePlaceholder = editablePlaceholder;
        this._summernoteContext = summernoteContext;
        this._tribute = tribute;

        this._cleanValue(); // remove initial <p></br></p>
    }

    willUnmount() {
        this._summernoteContext.destroy();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    focus() {
        this._editable.focus();
    }

    focusout() {
        this._editable.blur();
    }

    /**
     * @return {string}
     */
    getValue() {
        return this._editable.innerHTML;
    }

    /**
     * @param {string} content
     */
    insert(content) {
        if (this._summernoteContext.modules.editor.lastRange.sc.nodeType === 3) {
            /**
             * Restore range only if it makes sense, i.e. it targets a text node.
             * This is not the case right after mentioning, in which the cursor
             * position is buggy. Summernote fallbacks by inserting content as
             * child of editor's container, which is very bad... This instead
             * insert text at the default position, which is the beginning of
             * the editor.
             */
            this._summernoteContext.invoke('editor.restoreRange');
        }
        this._summernoteContext.invoke('editor.insertText', content);
    }

    resetValue() {
        this._editable.innerHTML = "";
        this._cleanValue();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _cleanValue() {
        if (this._editable.textContent.length === 0) {
            // placeholder is a bit slow, this makes it update faster
            this._editablePlaceholder.style['display'] = 'block';
            this._editable.innerHTML = "";
            this.trigger('o-notify-is-command', { value: false });
        } else {
            // placeholder is a bit slow, this makes it update faster
            this._editablePlaceholder.style['display'] = 'none';
            if (this._editable.textContent.startsWith('/')) {
                this.trigger('o-notify-is-command', { value: true });
            } else {
                this.trigger('o-notify-is-command', { value: false });
            }
        }
    }

    /**
     * @private
     * @return {Object}
     */
    _configSummernote() {
        const $textarea = $(this.refs.textarea);

        $textarea.summernote({
            callbacks: {
                onPaste(ev) {
                    const bufferText = ((ev.originalEvent || ev).clipboardData ||
                        window.clipboardData).getData('Text');
                    ev.preventDefault();
                    document.execCommand('insertText', false, bufferText);
                },
            },
            disableDragAndDrop: true,
            disableResizeEditor: true,
            placeholder: this.env._t("Write something..."),
            popover: {
                image: [],
                link: [],
                air: [],
            },
            shortcuts: false,
            toolbar: false,
        });

        const editingArea = this.el.querySelector(':scope > .note-editor > .note-editing-area');
        const editable = editingArea.querySelector(':scope .note-editable');
        const editablePlaceholder = editingArea.querySelector(':scope > .note-placeholder');
        const summernoteContext = $textarea.data('summernote');
        summernoteContext.invoke('removeModule', 'autoLink'); // conflict with this summernote module and tribute

        editable.addEventListener('click', ev => this._onClickEditable(ev));
        editable.addEventListener('input', ev => this._onInputEditable(ev));
        editable.addEventListener('keydown', ev => this._onKeydownEditable(ev));
        editable.addEventListener('selectionchange', ev => this._onSelectionChangeEditable(ev));

        return {
            editable,
            editablePlaceholder,
            summernoteContext,
        };
    }

    /**
     * @private
     * @param {Object} param0
     * @param {HTMLElement} param0.editable
     * @return {Object} tribute object
     */
    _configTribute({ editable }) {
        const tribute = new window.Tribute({
            collection: [
                this._configTributeCollectionItemCannedResponse(),
                this._configTributeCollectionItemChannel(),
                this._configTributeCollectionItemCommand(),
                this._configTributeCollectionItemPartner(),
            ],
        });

        tribute.attach(editable);
        return tribute;
    }

    /**
     * @private
     * @return {Object}
     */
    _configTributeCollectionItemCannedResponse() {
        const self = this;
        const collectionItem = {
            lookup: 'source',
            menuItemTemplate(item) {
                return self.env.qweb.renderToString('mail.component.ComposerTextInput.CannedReponseMentionMenuItem', {
                    isMobile: self.props.isMobile,
                    item,
                });
            },
            selectTemplate(item) {
                return item ? item.original.substitution : null;
            },
            trigger: ':',
            values(keyword, callback) {
                const cannedResponses = self._searchCannedResponseSuggestions(keyword);
                callback(cannedResponses);
            },
        };
        return collectionItem;
    }

    /**
     * @private
     * @return {Object}
     */
    _configTributeCollectionItemChannel() {
        const self = this;
        const collectionItem = {
            lookup: 'name',
            menuItemTemplate(item) {
                return self.env.qweb.renderToString('mail.component.ComposerTextInput.ChannelMentionMenuItem', {
                    isMobile: self.props.isMobile,
                    item,
                });
            },
            selectTemplate(item) {
                if (!item) {
                    // no match keeps mentioning state, hence handle no item selection
                    return null;
                }
                return self.env.qweb.renderToString('mail.component.ComposerTextInput.ChannelMentionSelectItem', { item });
            },
            trigger: '#',
            values(keyword, callback) {
                self._searchChannelMentionSuggestions(keyword, channels => callback(channels));
            },
        };
        return collectionItem;
    }

    /**
     * @private
     * @return {Object}
     */
    _configTributeCollectionItemCommand() {
        const self = this;
        const collectionItem = {
            lookup: 'name',
            menuItemTemplate(item) {
                return self.env.qweb.renderToString('mail.component.ComposerTextInput.CommandMentionMenuItem', {
                    isMobile: self.props.isMobile,
                    item,
                });
            },
            selectTemplate(item) {
                return item ? '/' + item.original.name : null;
            },
            trigger: '/',
            values(keyword, callback) {
                const commands = self._searchCommandSuggestions(keyword);
                callback(commands);
            },
        };
        return collectionItem;
    }

    /**
     * @private
     * @return {Object}
     */
    _configTributeCollectionItemPartner() {
        const self = this;
        const collectionItem = {
            lookup: 'name',
            menuItemTemplate(item) {
                return self.env.qweb.renderToString('mail.component.ComposerTextInput.PartnerMentionMenuItem', {
                    isMobile: self.props.isMobile,
                    item,
                    partnerName: self.env.store.getters.partnerName(item.original.localId),
                });
            },
            selectTemplate(item) {
                if (!item) {
                    // no match may keep mentioning state, hence handle no item selection
                    return null;
                }
                return self.env.qweb.renderToString('mail.component.ComposerTextInput.PartnerMentionSelectItem', {
                    item,
                    partnerName: self.env.store.getters.partnerName(item.original.localId),
                });
            },
            trigger: '@',
            values(keyword, callback) {
                self._searchPartnerMentionSuggestions(keyword, partners => callback(partners));
            },
        };
        return collectionItem;
    }

    /**
     * @private
     */
    _saveRange() {
        this._summernoteContext.invoke('editor.saveRange');
    }

    /**
     * @private
     * @param {string} keyword
     * @returns {Object[]}
     */
    _searchCannedResponseSuggestions(keyword) {
        const cannedResponseList = Object.values(this.env.store.state.cannedResponses);
        const matches = fuzzy.filter(
            utils.unaccent(keyword),
            cannedResponseList.map(cannedResponse => cannedResponse.source));
        return matches.slice(0, 10).map(match => cannedResponseList[match.index]);
    }

    /**
     * @private
     * @param {string} keyword
     * @param {function} callback
     */
    async _searchChannelMentionSuggestions(keyword, callback) {
        const suggestions = await this.env.rpc({
            model: 'mail.channel',
            method: 'get_mention_suggestions',
            kwargs: {
                limit: 10,
                search: keyword,
            },
        });
        callback(suggestions);
    }

    /**
     * @private
     * @param {string} keyword
     * @return {Object[]}
     */
    _searchCommandSuggestions(keyword) {
        const selection = window.getSelection();
        if (!selection) {
            return [];
        }
        if (!selection.anchorNode) {
            return [];
        }
        if (!selection.anchorNode.parentNode) {
            return [];
        }

        /**
         * @return {DOMNode}
         */
        function getAnchorParentFirstChildNotEmptyText() {
            return Array.prototype.find.call(selection.anchorNode.parentNode.childNodes, childNode =>
                childNode.nodeType !== 3 || childNode.textContent.trim().length !== 0);
        }

        if (getAnchorParentFirstChildNotEmptyText() !== selection.anchorNode) {
            return [];
        }

        if (this._tribute.current.selectedOffset - 1 !== keyword.length) {
            return [];
        }

        const commandList = Object.values(this.env.store.state.commands);
        const matches = fuzzy.filter(
            utils.unaccent(keyword),
            commandList.map(command => command.name));
        return matches.slice(0, 10).map(match => commandList[match.index]);
    }

    /**
     * @private
     * @param {string} keyword
     * @param {function} callback
     */
    async _searchPartnerMentionSuggestions(keyword, callback) {
        this.env.store.dispatch('searchPartners', {
            callback,
            keyword,
            limit: 10,
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickEditable(ev) {
        this._saveRange();
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onInputEditable(ev) {
        this._cleanValue();
        this._saveRange();
        this.trigger('o-input-composer-text-input');
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownEditable(ev) {
        this._saveRange();
        switch (ev.key) {
            case 'Backspace':
                this._onKeydownEditableBackspace(ev);
                break;
            case 'Enter':
                this._onKeydownEditableEnter(ev);
                break;
            case 'Escape':
                this._onKeydownEditableEscape(ev);
                break;
            default:
                break;
        }
    }

    /**
     * Force deleting contenteditable = 'false' inside editable.
     * It works by default on Chrome and Safari works fine, but not on Firefox
     * due to following bug:
     * https://bugzilla.mozilla.org/show_bug.cgi?id=685452
     *
     * Adapted code from:
     * https://stackoverflow.com/questions/2177958/how-to-delete-an-html-element-inside-a-div-with-attribute-contenteditable/30574622#30574622
     *
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownEditableBackspace(ev) {
        if (this.getValue().length === 0) {
            return;
        }
        const selection = window.getSelection();
        if (!selection.isCollapsed || !selection.rangeCount) {
            return;
        }
        const curRange = selection.getRangeAt(selection.rangeCount - 1);
        if (curRange.commonAncestorContainer.nodeType === 3 && curRange.startOffset > 0) {
            // we are in child selection. The characters of the text node is being deleted
            return;
        }

        const range = document.createRange();
        if (selection.anchorNode !== ev.target) {
            // selection is in character mode. expand it to the whole editable field
            range.selectNodeContents(ev.target);
            range.setEndBefore(selection.anchorNode);
        } else if (selection.anchorOffset > 0) {
            range.setEnd(ev.target, selection.anchorOffset);
        } else {
            // reached the beginning of editable field
            return;
        }
        try {
            range.setStart(ev.target, range.endOffset - 2);
        } catch {
            return;
        }
        const previousNode = range.cloneContents().lastChild;
        if (previousNode) {
            if (previousNode.contentEditable === 'false') {
                range.deleteContents();
                ev.preventDefault();
            }
            /**
             * Prevent cursor bug in Firefox with contenteditable='false'
             * inside contenteditable='true', by having more aggressive delete
             * behaviour:
             * https://bugzilla.mozilla.org/show_bug.cgi?id=685452
             */
            const formerPreviousNode = previousNode.previousSibling;
            if (formerPreviousNode && formerPreviousNode.contentEditable === 'false') {
                range.deleteContents();
                ev.preventDefault();
            }
        }
        this._cleanValue();
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownEditableEnter(ev) {
        if (this._tribute.isActive) {
            return;
        }
        if (ev.shiftKey) {
            return;
        }
        this.trigger('o-keydown-enter');
        ev.preventDefault();
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownEditableEscape(ev) {
        if (this._editable.innerHTML.length !== 0) {
            return;
        }
        this.trigger('o-discard');
        ev.preventDefault();
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onSelectionChangeEditable(ev) {
        this._saveRange();
    }
}

return ComposerInput;

});
