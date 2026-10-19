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
function updateOdooBrandingDOM(targetDoc, name) {
    if (!targetDoc || !name) {
        return;
    }

    const brands = targetDoc.querySelectorAll(".navbar-brand");
    for (const brand of brands) {
        const logoImg = brand.querySelector("img, svg");
        if (logoImg) {
            // Site avec logo visuel : on ne modifie que les métadonnées pour ne pas casser le layout
            logoImg.setAttribute("alt", name);
            logoImg.setAttribute("title", name);
        } else {
            // Site textuel : recherche en priorité du champ QWeb Odoo
            const qwebField = brand.querySelector(
                '[data-oe-field="name"], [data-oe-expression="website.name"]'
            );
            if (qwebField) {
                qwebField.textContent = name;
            } else {
                brand.textContent = name;
            }
        }
    }

    // Mise à jour de l'onglet de navigation
    updateDocumentTitle(targetDoc, name);
}

function updateDocumentTitle(doc, name) {
    const currentTitle = doc.title || "";
    const parts = currentTitle.split(" | ");

    // Format standard Odoo : "Nom de la page | Nom du site"
    doc.title = parts.length > 1 ? `${parts.slice(0, -1).join(" | ")} | ${name}` : name;

    try {
        if (window.top && window.top.document !== doc) {
            window.top.document.title = doc.title;
        }
    } catch {
        // Protection iframe cross-origin
    }
}

// ============================================================================
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

export class WebsiteBrandingPlugin extends Plugin {
    static id = "websiteBrandingPlugin";
    static shared = ["stageWebsiteName"];

    setup() {
        this.stagedName = null;
        // Document résolu une seule fois via l'environnement de l'éditeur
        this.editorDoc = this.document || this.editable?.ownerDocument || document;
    }

    /**
     * Preview immédiate sans toucher aux mécanismes de sauvegarde
     */
    stageWebsiteName(value) {
        this.stagedName = value;
        updateOdooBrandingDOM(this.editorDoc, value);
    }

    /**
     * Persistance : uniquement ORM et état OWL (aucun touch DOM ici)
     */
    async onWillSave() {
        if (!this.stagedName) {
            return;
        }

        const currentWebsite = this.services.website?.currentWebsite;
        if (currentWebsite) {
            // 1. Sauvegarde réelle en base de données
            await this.services.orm.write("website", [currentWebsite.id], {
                name: this.stagedName,
            });

            // 2. Synchronisation de la réactivité OWL
            currentWebsite.name = this.stagedName;
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
