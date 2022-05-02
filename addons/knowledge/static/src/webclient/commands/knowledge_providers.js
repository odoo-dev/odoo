/** @odoo-module */


import { _lt } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { HotkeyCommandItem } from "@web/core/commands/default_providers";
import { splitCommandName } from "@web/core/commands/command_palette";

const { Component, xml } = owl;

// Articles command
class KnowledgeCommand extends Component {}
KnowledgeCommand.template = xml`
    <div class="o_command_left d-flex align-items-center">
        <span class="pr-2" t-if="props.icon_string" t-out="props.icon_string"/>
        <span class="pr-2" t-else="">📄</span>
        <span class="pr-2"><t t-slot="name"/></span>
        <icon t-if="props.isFavorite" class="fa fa-star o_favorite pr-2 position-static"/>
        <span t-if="props.subjectName" t-out="'— '" class="text-muted small pr-2" />
        <span t-if="props.subjectName" class="o_command_name text-muted small">
            <t t-foreach="props.splitSubjectName" t-as="name" t-key="name_index">
                <b t-if="name_index % 2" t-out="name"/>
                <t t-else="" t-out="name"/>
            </t>
        </span>
    </div>
`;

// "Not found, create one" command
class Knowledge404Command extends Component {}
Knowledge404Command.template = xml`
    <div class="o_command_hotkey">
        <span>
            No Article found. <span class="text-primary">Create "<u t-out="props.articleName"/>"</span>
        </span>
    </div>
`;

// Advanced search command
class KnowledgeExtraCommand extends HotkeyCommandItem {}
KnowledgeExtraCommand.template = xml`
    <div class="o_command_hotkey">
        <span>
            <icon class="fa fa-arrows-alt pr-2" />
            <t t-out="props.name" />
        </span>
        <span>
            <t t-foreach="getKeysToPress(props)" t-as="key" t-key="key_index">
                <kbd t-out="key" />
                <span t-if="!key_last"> + </span>
            </t>
        </span>
    </div>
`;

const commandSetupRegistry = registry.category("command_setup");
commandSetupRegistry.add("?", {
    debounceDelay: 200,
    emptyMessage: _lt("No article found."),
    name: _lt("articles"),
});

const commandProviderRegistry = registry.category("command_provider");
commandProviderRegistry.add("knowledge", {
    debounceDelay: 200,
    namespace: "?",
    async provide(env, options) {
        const articlesData = await Component.env.services.rpc({
            model: "knowledge.article",
            method: "get_user_sorted_articles",
            args: [[]],
            kwargs: {
                search_query: options.searchValue,
            }
        });

        if (articlesData.length === 0) {
            // check if user has enough rights to create a new article
            const canCreate = await Component.env.services.rpc({
                model: "knowledge.article",
                method: "check_access_rights",
                kwargs: {
                    operation: "create",
                    raise_exception: false,
                },
            });
            // only display the "create article" command when there are at least 3 character
            if (canCreate && options.searchValue.length > 2) {
                return [{
                    Component: Knowledge404Command,
                    async action() {
                        const articleId = await Component.env.services.rpc({
                            model: 'knowledge.article',
                            method: 'article_create',
                            args: [[]],
                            kwargs: {
                                title: options.searchValue,
                                is_private: true
                            },
                        });

                        env.services.action.doAction('knowledge.action_home_page', {
                            additionalContext: {
                                res_id: articleId,
                            }
                        });
                    },
                    name: "No Article found. Create \"" + options.searchValue + "\"",
                    props: {
                        articleName: options.searchValue,
                    },
                }];
            }
            else {
                return [];
            }
        }
        // display the articles
        let result =  articlesData.map((article) => ({
            Component: KnowledgeCommand,
            action() {
                env.services.action.doAction('knowledge.action_home_page', {
                    additionalContext: {
                        res_id: article.id,
                    }
                });

            },
            category: "knowledge_articles",
            name: article.name,
            props: {
                isFavorite: article.is_user_favorite,
                subjectName: article.root_article_id[0] != article.id ? article.root_article_id[1] : false,
                splitSubjectName: splitCommandName(article.root_article_id[1], options.searchValue),
                icon_string: article.icon,
            },
        }));
        // add the "advanced search" command
        result.push({
            Component: KnowledgeExtraCommand,
            action() {
                env.services.action.doAction({
                    type: "ir.actions.act_window",
                    res_model: "knowledge.article",
                    search_view_id: [false, "search"],
                    views: [[false, "list"]],
                    target: "current",
                    context: {
                        search_default_name: options.searchValue,
                    },
                    name: "Search Articles",
                })
            },
            category: "knowledge_extra",
            name: "Advanced Search",
            props: {
                hotkey: "alt+B",
            },
        });
        return result;
    },
});
