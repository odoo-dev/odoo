import { Component, t, useProps } from "@odoo/owl";

/**
 * A moment that deserves the learner's full attention (a lesson starts or
 * ends, a new skill is unlocked): a card in the middle of the screen.
 */
export class KeyMomentCard extends Component {
    static template = "learning.KeyMomentCard";
    props = useProps({
        title: t.string(),
        icon: t.string().optional("💡"),
        slots: t.object({
            default: t.object(),
            actions: t.object(),
        }),
    });
}
