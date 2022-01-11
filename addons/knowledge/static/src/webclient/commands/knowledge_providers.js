/** @odoo-module */


import { _lt } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { HotkeyCommandItem } from "@web/core/commands/default_providers";

const { Component } = owl;
const { xml } = owl.tags;

class KnowledgeCommand extends Component {}
KnowledgeCommand.template = xml`
    <div class="o_command_left">
        <icon t-att-class="'pr-2 fa ' + props.icon_string"/>
        <span t-esc="props.name" class="pr-2"/>
        <icon t-if="props.isFavourite" class="fa fa-star o_favorite pr-2"/>
        <span t-if="props.parentName" t-esc="'— '" class="text-muted small pr-2" />
        <span t-if="props.parentName" t-esc="props.parentName" class="text-muted small" />
    </div>
`;

class Knowledge404Command extends Component {}
Knowledge404Command.template = xml`
    <div class="o_command_hotkey">
        <span>
            No Article found. <span class="text-primary">Create "<u t-esc="props.articleName"/>"</span>
        </span>
    </div>
`;

class KnowledgeExtraCommand extends HotkeyCommandItem {}
KnowledgeExtraCommand.template = xml`
    <div class="o_command_hotkey">
        <span>
            <icon class="fa fa-arrows-alt pr-2" />
            <t t-esc="props.name" />
        </span>
        <span>
            <t t-foreach="getKeysToPress(props)" t-as="key">
                <kbd t-esc="key" />
                <span t-if="!key_last"> + </span>
            </t>
        </span>
    </div>
`;
const commandSetupRegistry = registry.category("command_setup");
commandSetupRegistry.add("?", {
    emptyMessage: _lt("No article found."),
    name: _lt("articles"),
});

const commandProviderRegistry = registry.category("command_provider");
commandProviderRegistry.add("knowledge", {
    namespace: "?",
    async provide(newEnv, options) {
        const domain = ["|",
            ["name", "ilike", options.searchValue],
            ["parent_id.name", "ilike", options.searchValue],
        ];
        const fields = ['id', 'name', 'is_user_favourite', 'parent_id', 'icon'];
        const limit = 10;
        const articlesData = await Component.env.services.rpc({
            model: "knowledge.article",
            method: "search_read",
            kwargs: {
                domain,
                fields,
                limit,
            },
        });
        if (articlesData.length === 0) {
            const canCreate = await Component.env.services.rpc({
                model: "knowledge.article",
                method: "check_access_rights",
                kwargs: {
                    operation: "create",
                    raise_exception: false,
                },
            });
            if (canCreate) {
                return [{
                    Component: Knowledge404Command,
                    async action() {
                        const article = await Component.env.services.rpc({
                            route: `/knowledge/article/create`,
                            params: {
                                title: options.searchValue,
                            }
                        });
                        newEnv.services.action.doAction('knowledge.action_show_article', {
                            additionalContext: {
                                res_id: article.id,
                            }
                        });
                    },
                    name: "No Article found. Create \"" + options.searchValue + "\"",
                    props: {
                        articleName: options.searchValue,
                    },
                }];
            }
        }
        let result =  articlesData.map((article) => ({
            Component: KnowledgeCommand,
            action() {
                newEnv.services.action.doAction('knowledge.action_show_article', {
                    additionalContext: {
                        res_id: article.id,
                    }
                });

            },
            category: "knowledge_articles",
            name: article.name,
            props: {
                isFavourite: article.is_user_favourite,
                parentName: article.parent_id[1],
                icon_string: article.icon,
            },
        }));
        result.push({
            Component: KnowledgeExtraCommand,
            action() {
                newEnv.services.action.doAction({
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
