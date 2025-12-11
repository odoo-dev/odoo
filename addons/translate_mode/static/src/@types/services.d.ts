declare module "services" {
    import { interactiveTranslationServiceFactory } from "@web/core/debug/interactive_translation_service";

    export interface Services {
        interactive_translation: typeof interactiveTranslationServiceFactory;
    }
}
