import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { BuilderAction } from "@html_builder/core/builder_action";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

// ============================================================================
// HELPERS CIBLÉS POUR L'ARCHITECTURE ODOO
// ============================================================================

/**
 * Met à jour le branding dans le DOM en respectant la structure QWeb d'Odoo.
 */
function updateOdooBrandingDOM(targetDoc, newName, oldName, titleService) {
    if (!targetDoc || !newName) {
        return;
    }

    const brands = targetDoc.querySelectorAll(".navbar-brand");
    for (const brand of brands) {
        const logoImg = brand.querySelector("img, svg");
        if (logoImg) {
            // Preview visuelle du alt/title
            logoImg.setAttribute("alt", newName);
            logoImg.setAttribute("title", newName);
        } else {
            const qwebField = brand.querySelector(
                '[data-oe-field="name"], [data-oe-expression="website.name"]'
            );
            if (qwebField) {
                qwebField.textContent = newName;
            } else {
                // Cas de fallback extrême
                brand.textContent = newName;
            }
        }
    }

    // Mise à jour de l'onglet
    syncDocumentTitle(targetDoc, newName, oldName, titleService);
}

function syncDocumentTitle(targetDoc, newName, oldName, titleService) {
    if (!titleService?.getParts || !titleService?.setParts || !newName || !oldName) {
        return;
    }

    const currentActionTitle = titleService.getParts().action;

    if (typeof currentActionTitle === "string") {
        const lastIndex = currentActionTitle.lastIndexOf(oldName);

        if (lastIndex !== -1) {
            // On découpe la string juste avant et juste après la dernière occurrence de l'ancien nom
            const updatedTitle =
                currentActionTitle.substring(0, lastIndex) +
                newName +
                currentActionTitle.substring(lastIndex + oldName.length);

            titleService.setParts({ action: updatedTitle });
        }
        targetDoc.title = newName;
    }
} // ============================================================================
// ACTION & OPTION (Couche UI Builder)
// ============================================================================

export class SetWebsiteNameAction extends BuilderAction {
    static id = "setWebsiteName";
    static dependencies = ["websiteBrandingPlugin"];

    getValue() {
        return this.services.website?.currentWebsite?.name || "";
    }

    apply({ value }) {
        // L'action n'a plus besoin d'extraire ni de passer le document
        this.dependencies.websiteBrandingPlugin.stageWebsiteName(value);
    }
}

export class ThemeWebsiteIdentificationOption extends BaseOptionComponent {
    static template = "website.ThemeWebsiteIdentificationOption";
    static selector = "header, .navbar-brand";
}

// ============================================================================
// PLUGIN (Orchestration State & ORM)
// ============================================================================

// export class WebsiteBrandingPlugin extends Plugin {
//     static id = "websiteBrandingPlugin";
//     static shared = ["stageWebsiteName"];

//     setup() {
//         this.stagedName = null;
//         // Document résolu une seule fois via l'environnement de l'éditeur
//         this.editorDoc = this.document || this.editable?.ownerDocument || document;
//     }

//     /**
//      * Preview immédiate sans toucher aux mécanismes de sauvegarde
//      */
//     stageWebsiteName(value) {
//         this.stagedName = value;
//         updateOdooBrandingDOM(this.editorDoc, value, this.services.title);
//     }

//     /**
//      * Persistance : uniquement ORM et état OWL (aucun touch DOM ici)
//      */
//     async onWillSave() {
//         if (!this.stagedName) {
//             return;
//         }

//         const currentWebsite = this.services.website?.currentWebsite;
//         if (currentWebsite) {
//             // 1. Sauvegarde réelle en base de données
//             await this.services.orm.write("website", [currentWebsite.id], {
//                 name: this.stagedName,
//             });

//             // 2. Synchronisation de la réactivité OWL
//             currentWebsite.name = this.stagedName;
//         }

//         this.stagedName = null;
//     }

//     resources = {
//         builder_options: [ThemeWebsiteIdentificationOption],
//         builder_actions: {
//             SetWebsiteNameAction,
//         },
//         on_will_save_handlers: this.onWillSave.bind(this),
//     };
// }

export class WebsiteBrandingPlugin extends Plugin {
    static id = "websiteBrandingPlugin";
    static shared = ["stageWebsiteName"];

    setup() {
        this.stagedName = null;
        this.editorDoc = this.document || this.editable?.ownerDocument || document;

        // On mémorise le nom officiel actuel (celui en base de données)
        this.originalWebsiteName = this.services.website?.currentWebsite?.name || "";
    }

    stageWebsiteName(value) {
        this.stagedName = value;
        // On met à jour le DOM visuellement
        updateOdooBrandingDOM(this.editorDoc, value, this.originalWebsiteName, this.services.title);
    }

    async onWillSave() {
        if (!this.stagedName || this.stagedName === this.originalWebsiteName) {
            return;
        }

        const currentWebsite = this.services.website?.currentWebsite;

        // 1. ROLLBACK DOM : On remet l'ancien nom dans le DOM pour que l'éditeur
        // sauvegarde le QWeb d'origine sans l'écraser avec une valeur hardcodée.
        updateOdooBrandingDOM(this.editorDoc, this.originalWebsiteName, this.stagedName, null);

        if (currentWebsite) {
            // 2. Sauvegarde propre en base de données
            await this.services.orm.write("website", [currentWebsite.id], {
                name: this.stagedName,
            });

            // 3. Mise à jour de l'état
            currentWebsite.name = this.stagedName;
            this.originalWebsiteName = this.stagedName; // Le nouveau nom devient l'officiel
        }

        this.stagedName = null;
    }

    resources = {
        builder_options: [ThemeWebsiteIdentificationOption],
        builder_actions: {
            SetWebsiteNameAction,
        },
        on_will_save_handlers: this.onWillSave.bind(this),
    };
}

registry.category("website-plugins").add(WebsiteBrandingPlugin.id, WebsiteBrandingPlugin);
