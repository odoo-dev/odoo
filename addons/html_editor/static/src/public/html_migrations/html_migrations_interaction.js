import { registry } from "@web/core/registry";
import { Interaction } from "@web/public/interaction";
import { VERSION_SELECTOR } from "@html_editor/html_migrations/html_migrations_utils";
import { HtmlUpgradeManager } from "@html_editor/html_migrations/html_upgrade_manager";

const upgradeElements = new Set();

export class HtmlMigrationsInteraction extends Interaction {
    static selector = `${VERSION_SELECTOR}, .o_knowledge_behavior_anchor`;

    setup() {
        const parentElement = this.el.parentElement;
        // Avoid handling an upgrade that is already being handled.
        if (!parentElement || upgradeElements.has(parentElement)) {
            this.isComplete = true;
            return;
        }
        for (const el of upgradeElements) {
            if (el.contains(parentElement)) {
                this.isComplete = true;
                return;
            }
        }
        this.editable = parentElement;
        upgradeElements.add(this.editable);
    }

    start() {
        if (this.isComplete || this.isUpgrading || !this.editable) {
            // Ensure that an upgrade can only be attempted once, even if
            // interactions are restarted.
            return;
        }
        this.isUpgrading = true;
        this.services["public.interactions"].stopInteractions(this.editable);
        const htmlUpgradeManager = new HtmlUpgradeManager();
        const initialValue = this.editable.innerHTML;
        const upgradedValue = htmlUpgradeManager.processForUpgrade(initialValue);
        if (initialValue !== upgradedValue) {
            this.editable.innerHTML = upgradedValue;
        }
        for (const el of this.editable.querySelectorAll(VERSION_SELECTOR)) {
            delete el.dataset.oeVersion;
        }
        this.services["public.interactions"].startInteractions(this.editable);
        this.isUpgrading = false;
        this.isComplete = true;
    }

    destroy() {
        if (this.isComplete) {
            // Ensure that the editable reference is kept during the upgrade
            // so that no other upgrade can start in the same Element while this
            // one is still ongoing.
            upgradeElements.delete(this.editable);
        }
    }
}

registry
    .category("public.interactions")
    .add("html_editor.html_migrations", HtmlMigrationsInteraction);
