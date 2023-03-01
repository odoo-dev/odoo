/** @odoo-module **/

import { attr, clear, Patch } from '@mail/model';

const { DateTime } = luxon;
const urlRegExp = /http(s)?:\/\/(www\.)?[a-zA-Z0-9@:%_+~#=~#?&/=\-;!.]{3,2000}/g;

Patch({
    name: 'ActivityMenuView',
    recordMethods: {
        /**
         * @override
         */
        close() {
            this.update({
                addingNoteDoFocus: clear(),
                isAddingNote: false,
            });
            this._super();
        },
        /**
         * @param {MouseEvent} ev
         */
        onClickAddNote(ev) {
            this.update({
                addingNoteDoFocus: true,
                isAddingNote: true,
            });
        },
        /**
         * @param {MouseEvent} ev
         */
        onClickSaveNote(ev) {
            this.saveNote();
        },
        onComponentUpdate() {
            if (this.addingNoteDoFocus && this.noteInputRef.el) {
                this.noteInputRef.el.focus();
                this.update({ addingNoteDoFocus: clear() });
            }
        },
        /**
         * @param {DateTime|string} date
         */
        onDateTimeChanged(date) {
            this.update({ addingNoteDate: date ? date : clear() });
        },
        /**
         * @param {KeyboardEvent} ev
         */
        onKeydownNoteInput(ev) {
            if (ev.key === 'Enter') {
                this.saveNote();
            } else if (ev.key === 'Escape') {
                this.update({
                    addingNoteDoFocus: clear(),
                    isAddingNote: false,
                });
            }
        },
        async saveNote() {
            const note = this.noteInputRef.el.value.replace(urlRegExp, '<a href="$&">$&</a>').trim();
            if (!note) {
                return;
            }
            this.update({ isAddingNote: false });
            await this.messaging.rpc({
                route: '/note/new',
                params: {
                    'note': note,
                    'date_deadline': this.addingNoteDate ? this.addingNoteDate : new DateTime.local(),
                },
            });
            this.fetchData();
        },
        /**
         * @override
         */
        _onClickCaptureGlobal(ev) {
            if (ev.target.closest('.bootstrap-datetimepicker-widget')) {
                return;
            }
            this._super(ev);
        },
    },
    fields: {
        activityGroups: {
            sort() {
                return [
                    ['truthy-first', 'isNote'],
                    ...this._super,
                ];
            },
        },
        addingNoteDate: attr(),
        addingNoteDatePlaceholder: attr({
            compute() {
                return this.env._t("Today");
            },
        }),
        addingNoteDoFocus: attr({
            default: false,
        }),
        isAddingNote: attr({
            default: false,
        }),
        noteInputRef: attr(),
    },
});
