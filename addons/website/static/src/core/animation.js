import { Interaction } from "@website/core/interaction";

/*
 * ABSTRACT INTERACTION
 */
export class Animation extends Interaction {

    setup() {
        this.maxFPS = 100;
        this.effects= []
        this.animationEffects = [];
    }

    start() {
        this.prepareEffects();
        this.animationEffects.forEach((effect) => effect.start());
    }

    findTarget(selector) {
        if (selector) {
            if (selector === 'selector') {
                return this.el;
            }
            return this.querySelector(selector);
        }
        return undefined;
    }

    prepareEffects() {
        this.effects.forEach((effect) => {
            this.addEffect(effect.update, effect.startEvents, findTarget(effect.startTarget), {
                getStateCallback: effect.getState,
                endEvents: effect.endEvents || undefined,
                endTarget: findTarget(effect.endTarget),
                maxFPS: this.maxFPS,
                enableInModal: effect.enableInModal || undefined,
            });
        });
    }

    addEffect(updateCallback, startEvents, startTarget, options) {
        this.animationEffects.push(
            new AnimationEffect(this, updateCallback, startEvents, startTarget, options)
        );
    }
}


        