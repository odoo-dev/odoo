/** @odoo-module */

import tour from 'web_tour.tour';
import {
    applyCommand,
    createArticle,
    saveArticle,
    searchCommandPaletteArticle,
    selectArticleLink
} from './tour_helper_knowledge';

tour.register('tour_knowledge_main_flow', {
        test: true,
        url: '/web',
    }, [
        tour.stepUtils.showAppsMenuItem(),
        {
            trigger: '.o_app[data-menu-xmlid="knowledge.knowledge_menu_root"]',
            content: 'Open the Knowledge app',
        },
        ...createArticle('testMacros'),
        {
            trigger: '[name="body"] > .odoo-editor-editable > p',
            content: 'create a template',
            run: function () {
                applyCommand(this.$anchor[0], '/template');
            }
        }, {
            trigger: '.o_knowledge_template p',
            content: 'write in the template',
            run: function () {
                const text = document.createTextNode('bonjour');
                this.$anchor[0].replaceChildren(text);
            }
        }, {
            trigger: '.o_knowledge_template:contains(bonjour)',
            content: 'force save, and open the chatter',
            run: async function (helper) {
                saveArticle(function (helper) {
                    helper.click('.btn-chatter');
                }.bind(this, helper));
            }
        }, {
            trigger: '.o_FollowerListMenu_buttonFollowers',
            content: 'open followers dropdown'
        }, {
            trigger: '.o_Follower_details',
            content: 'edit follower',
            run: function (helper) {
                helper.click(this.$anchor.first());
            }
        }, {
            trigger: '.o_notebook:contains(Internal Notes)',
            content: 'check that the page changed',
        },
        ...searchCommandPaletteArticle('testMacros'),
        {
            trigger: '.o_knowledge_toolbar_type_template button[data-call="use_as_description"]',
            content: 'run copy to field_html macro',
            run: 'click',
        }, {
            trigger: '.oe_form_field[name="comment"]:contains(bonjour)',
            content: 'check that the template was copied (macro successful)',
            run: function (helper) {
                helper.click('button[title="Discard record"]');
            },
        },
        ...searchCommandPaletteArticle('testMacros'),
        {
            trigger: '.o_knowledge_toolbar_type_template button[data-call="send_as_message"]',
            content: 'run send as message macro',
            run: 'click',
        }, {
            trigger: 'button[name="action_save_as_template"]',
            content: 'check the modal',
            run: () => {},
        }, {
            trigger: '.oe_form_field[name="body"]:contains(bonjour)',
            content: 'check that the template was copied (macro successful)',
            run: function (helper) {
                helper.click('button[special="cancel"]');
            },
        },
        ...searchCommandPaletteArticle('fileArticle'),
        {
            trigger: '.o_article_active:contains(fileArticle)',
            content: 'switch to the article with a file',
            run: () => {},
        }, {
            trigger: '[name="body"] > .odoo-editor-editable > p',
            content: 'create a file',
            run: function () {
                applyCommand(this.$anchor[0], '/file');
            }
        }, {
            trigger: '.o_existing_attachment_cell:contains(knowledgeFile)',
            content: 'click on the file',
            run: function (helper) {
                saveArticle(function (helper) {
                    helper.click(this.$anchor);
                }.bind(this, helper));
            }
        }, {
            trigger: '.o_knowledge_file:contains(knowledgeFile) .o_knowledge_toolbar_type_file button[data-call="attach_to_message"]',
            content: 'run attach to message macro',
            run: 'click',
        }, {
            trigger: '.o_Composer_coreFooter .o_AttachmentList_attachment:contains(knowledgeFile)',
            content: 'check that the file is attached to the message',
        },
        ...searchCommandPaletteArticle('fileArticle'),
        {
            trigger: '.o_knowledge_file:contains(knowledgeFile) .o_knowledge_toolbar_type_file button[data-call="use_as_attachment"]',
            content: 'run use as attachment macro',
            run: 'click',
        }, {
            trigger: '.o_AttachmentBox .o_AttachmentList_attachment:contains(knowledgeFile)',
            content: 'check and remove the attachment',
            run: function (helper) {
                helper.click(this.$anchor.find('button[title="Remove"]'));
            }
        }, {
            trigger: '.o_AttachmentDeleteConfirm_confirmButton',
            content: 'confirm deletion',
            run: 'click',
        },
        ...searchCommandPaletteArticle('testMacros'),
        {
            trigger: '[name="body"] > .odoo-editor-editable > p.oe-hint',
            content: 'create an article link',
            run: function () {
                applyCommand(this.$anchor[0], '/article');
            }
        }, {
            trigger: 'a:contains(Choose an Article)',
            content: 'open the selection',
            run: async function (helper) {
                selectArticleLink('fileArticle', helper, this.$anchor);
            }
        }, {
            trigger: '.select2-chosen:contains(fileArticle)',
            content: 'confirm the selection',
            run: function (helper) {
                helper.click($('button:contains(Ok)'));
            },
        }, {
            trigger: '[name="body"] > .odoo-editor-editable:has(a:contains(fileArticle))',
            content: 'click on the article link',
            run: function (helper) {
                helper.click(this.$anchor.find('a:contains(fileArticle)'));
            }
        }, {
            trigger: '.o_knowledge_file:contains(knowledgeFile)',
            content: 'success',
        },
        {
            trigger: '[name="body"] > .odoo-editor-editable > p',
            content: 'create an article link',
            run: function () {
                applyCommand(this.$anchor[0], '/tableofcontent');
            }
        },
        {
            trigger: '.o_knowledge_toc_content:contains(No heading found)',
            content: 'check that no heading was found',
        },
        {
            trigger: '[name="body"] > .odoo-editor-editable > p',
            content: 'insert a heading',
            run: function () {
                this.$anchor[0].insertBefore(document.createElement('h1'), this.$anchor[0].firstChild);
            }
        }, {
            trigger: '.o_knowledge_toc_content:contains(No heading found)',
            content: 'check that no heading was found',
        },
        {
            // write in h1
            trigger: '[name="body"] > .odoo-editor-editable > h1',
            content: 'write in h1',
            run: function () {
                this.$anchor[0].innerText = 'test';
            }
        }, {
            trigger: '.o_knowledge_toc_content:contains(test)',
            content: 'check that the heading was found',
        },
    ]
);
