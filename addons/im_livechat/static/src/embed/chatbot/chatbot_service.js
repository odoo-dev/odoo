/* @odoo-module */

import { Chatbot } from "@im_livechat/embed/chatbot/chatbot_model";
import { ChatbotStep } from "@im_livechat/embed/chatbot/chatbot_step_model";
import { SESSION_STATE } from "@im_livechat/embed/core/livechat_service";

import { EventBus, markup, reactive } from "@odoo/owl";

import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { debounce } from "@web/core/utils/timing";

const MESSAGE_DELAY = 1500;
// Time between two messages coming from the bot.
const STEP_DELAY = 500;
// Time to wait without user input before considering a multi line
// step as completed.
const MULTILINE_STEP_DEBOUNCE_DELAY = 10000;

export class ChatBotService {
    /** @type {import("@im_livechat/embed/chatbot/chatbot_model").Chatbot} */
    chatbot;
    /** @type {import("@im_livechat/embed/chatbot/chatbot_step_model").ChatbotStep} */
    currentStep;
    /** @type {number} */
    nextStepTimeout;
    shouldRestore = false;
    isTyping = false;

    constructor(env, services) {
        const self = reactive(this);
        self.setup(env, services);
        return self;
    }

    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {{
     * "im_livechat.livechat": import("@im_livechat/embed/core/livechat_service").LivechatService,
     * "mail.message": import("@mail/core/common/message_service").MessageService,
     * "mail.store": import("@mail/core/common/store_service").Store,
     * rpc: typeof import("@web/core/network/rpc_service").rpcService.start,
     * }} services
     */
    setup(env, services) {
        this.env = env;
        this.bus = new EventBus();
        this.livechatService = services["im_livechat.livechat"];
        this.messageService = services["mail.message"];
        this.store = services["mail.store"];
        this.rpc = services.rpc;

        this.debouncedProcessUserAnswer = debounce(
            this._processUserAnswer.bind(this),
            MULTILINE_STEP_DEBOUNCE_DELAY
        );
        this.livechatService.initializedDeferred.then(() => {
            this.chatbot = this.livechatService.rule?.chatbot
                ? new Chatbot(this.livechatService.rule.chatbot)
                : undefined;
            this.shouldRestore = Boolean(
                localStorage.getItem(
                    `im_livechat.chatbot.state.uuid_${this.livechatService.sessionCookie?.uuid}`
                )
            );
        });
        this.bus.addEventListener("MESSAGE_POST", ({ detail: message }) => {
            if (this.currentStep?.type === "free_input_multi") {
                this.debouncedProcessUserAnswer(message);
            } else {
                this._processUserAnswer(message);
            }
        });
    }

    /**
     * Start the chatbot script.
     */
    start() {
        if (this.shouldRestore && this.livechatService.state !== SESSION_STATE.PERSISTED) {
            // We need to repost the welcome steps as they were not saved.
            this.chatbot.welcomeStepIndex = 0;
            this.currentStep = null;
        }
        if (!this.currentStep?.expectAnswer) {
            this._triggerNextStep();
        } else if (this.livechatService.thread?.isLastMessageFromCustomer) {
            // Answer was posted but is yet to be processed.
            this._processUserAnswer(this.livechatService.thread.newestMessage);
        }
    }

    /**
     * Stop the chatbot script.
     */
    stop() {
        this.clear();
        clearTimeout(this.nextStepTimeout);
    }

    /**
     * Restart the chatbot script if it was completed and post the
     * restart message.
     */
    async restart() {
        if (!this.completed || !this.livechatService.thread) {
            return;
        }
        const message = await this.rpc("/chatbot/restart", {
            channel_uuid: this.livechatService.thread.uuid,
            chatbot_script_id: this.chatbot.scriptId,
        });
        this.livechatService.thread?.messages.push(
            this.messageService.insert({ ...message, body: markup(message.body) })
        );
        this.currentStep = null;
        this.start();
    }

    /**
     * Save the welcome steps on the server.
     */
    async postWelcomeSteps() {
        const rawMessages = await this.rpc("/chatbot/post_welcome_steps", {
            channel_uuid: this.livechatService.thread.uuid,
            chatbot_script_id: this.chatbot.scriptId,
        });
        for (const rawMessage of rawMessages) {
            const message = this.messageService.insert({
                ...rawMessage,
                body: markup(rawMessage.body),
            });
            if (!this.livechatService.thread?.hasMessage(message)) {
                this.livechatService.thread?.messages.push(message);
            }
        }
    }

    // =============================================================================
    // SCRIPT PROCESSING
    // =============================================================================

    /**
     * Trigger the next step of the script recursivly until the script
     * is completed or the current step expects an answer from the user.
     */
    _triggerNextStep() {
        if (this.completed) {
            return;
        }
        this.isTyping = true;
        this.nextStepTimeout = browser.setTimeout(async () => {
            const { step, stepMessage } = await this._getNextStep();
            this.isTyping = false;
            if (!step && this.currentStep) {
                this.currentStep.isLast = true;
                return;
            }
            if (stepMessage) {
                const message = this.messageService.insert({
                    ...stepMessage,
                    body: markup(stepMessage.body),
                });
                if (!this.livechatService.thread?.hasMessage(message)) {
                    this.livechatService.thread?.messages.push(message);
                }
            }
            this.currentStep = step;
            if (
                this.currentStep?.type === "question_email" &&
                this.livechatService.thread.isLastMessageFromCustomer
            ) {
                await this.validateEmail();
            }
            this.save();
            if (this.currentStep.expectAnswer) {
                return;
            }
            browser.setTimeout(() => this._triggerNextStep(), this.stepDelay);
        }, this.messageDelay);
    }

    /**
     * Get the next step to process as well as the message posted by the
     * step if any.
     *
     * @returns {Promise<{ step: ChatbotStep?, stepMessage: object?}>}
     */
    async _getNextStep() {
        if (this.currentStep?.expectAnswer) {
            return { step: this.currentStep };
        }
        if (!this.chatbot.welcomeCompleted) {
            const welcomeStep = this.chatbot.nextWelcomeStep;
            return {
                step: new ChatbotStep(welcomeStep),
                stepMessage: {
                    chatbotStep: welcomeStep,
                    id: this.store.Message.getNextTemporaryId(),
                    body: welcomeStep.message,
                    res_id: this.livechatService.thread.id,
                    model: this.livechatService.thread.model,
                    author: this.livechatService.thread.operator,
                },
            };
        }
        const nextStepData = await this.rpc("/chatbot/step/trigger", {
            channel_uuid: this.livechatService.thread.uuid,
            chatbot_script_id: this.chatbot.scriptId,
        });
        const { chatbot_posted_message, chatbot_step } = nextStepData ?? {};
        return {
            step: chatbot_step ? new ChatbotStep(chatbot_step) : null,
            stepMessage: chatbot_posted_message,
        };
    }

    /**
     * Process the user answer and trigger the next step.
     *
     * @param {import("@mail/core/common/message_model").Message} message
     */
    async _processUserAnswer(message) {
        if (
            !this.active ||
            !message.originThread?.eq(this.livechatService.thread) ||
            !this.currentStep?.expectAnswer
        ) {
            return;
        }
        const answer = this.currentStep.answers.find(({ label }) => message.body.includes(label));
        const stepMessage = message.originThread.messages.findLast(({ chatbotStep }) =>
            chatbotStep?.eq(this.currentStep)
        );
        if (stepMessage) {
            stepMessage.chatbotStep.hasAnswer = true;
        }
        this.currentStep.hasAnswer = true;
        this.save();
        if (answer) {
            await this.rpc("/chatbot/answer/save", {
                channel_uuid: this.livechatService.thread.uuid,
                message_id: stepMessage.id,
                selected_answer_id: answer.id,
            });
        }
        if (answer?.redirectLink) {
            browser.location.assign(answer.redirectLink);
            return;
        }
        this._triggerNextStep();
    }

    /**
     * Validate an email step and post the validation message to the
     * thread.
     */
    async validateEmail() {
        const { success, posted_message: msg } = await this.rpc("/chatbot/step/validate_email", {
            channel_uuid: this.livechatService.thread.uuid,
        });
        this.currentStep.isEmailValid = success;
        if (msg && !this.livechatService.thread.messages.some((m) => m.id === msg.id)) {
            this.livechatService.thread.messages.push(
                this.messageService.insert({ ...msg, body: markup(msg.body) })
            );
        }
    }

    /**
     * @param {import("@mail/core/common/thread_model").Thread} thread
     */
    isChatbotThread(thread) {
        return thread?.operator.id === this.chatbot?.partnerId;
    }

    // =============================================================================
    // STATE MANAGEMENT
    // =============================================================================

    /**
     * Restore the chatbot from the state saved in the local storage and
     * clear outdated storage.
     */
    async restore() {
        const chatbotStorageKey = `im_livechat.chatbot.state.uuid_${this.livechatService.sessionCookie?.uuid}`;
        const { _chatbotCurrentStep, _chatbot } = JSON.parse(
            browser.localStorage.getItem(chatbotStorageKey) ?? "{}"
        );
        this.currentStep = _chatbotCurrentStep ? new ChatbotStep(_chatbotCurrentStep) : undefined;
        this.chatbot = _chatbot ? new Chatbot(_chatbot) : undefined;
    }

    /**
     * Clear outdated storage.
     */
    async clear() {
        const chatbotStorageKey = this.livechatService.sessionCookie
            ? `im_livechat.chatbot.state.uuid_${this.livechatService.sessionCookie.uuid}`
            : "";
        for (let i = 0; i < browser.localStorage.length; i++) {
            const key = browser.localStorage.key(i);
            if (key !== chatbotStorageKey && key.includes("im_livechat.chatbot.state.uuid_")) {
                browser.localStorage.removeItem(key);
            }
        }
    }

    /**
     * Save the chatbot state in the local storage.
     */
    async save() {
        browser.localStorage.setItem(
            `im_livechat.chatbot.state.uuid_${this.livechatService.thread.uuid}`,
            JSON.stringify({
                _chatbot: this.chatbot,
                _chatbotCurrentStep: this.currentStep,
            })
        );
    }

    // =============================================================================
    // GETTERS
    // =============================================================================

    get stepDelay() {
        return (this.shouldRestore && !this.chatbot.welcomeCompleted) ||
            this.livechatService.thread?.isLastMessageFromCustomer
            ? 0
            : STEP_DELAY;
    }

    get messageDelay() {
        return (this.shouldRestore && !this.chatbot.welcomeCompleted) || !this.currentStep
            ? 0
            : MESSAGE_DELAY;
    }

    get active() {
        return this.available && this.isChatbotThread(this.livechatService.thread);
    }

    get available() {
        return Boolean(this.chatbot);
    }

    get completed() {
        return (
            this.currentStep?.operatorFound ||
            (this.currentStep?.isLast && !this.currentStep?.expectAnswer)
        );
    }

    get canRestart() {
        return (
            this.livechatService.state !== SESSION_STATE.CLOSED &&
            this.completed &&
            !this.currentStep?.operatorFound
        );
    }

    get inputEnabled() {
        if (!this.active || this.currentStep?.operatorFound) {
            return true;
        }
        return (
            !this.isTyping &&
            this.currentStep?.expectAnswer &&
            this.currentStep?.answers.length === 0
        );
    }

    get inputDisabledText() {
        if (this.inputEnabled) {
            return "";
        }
        if (this.completed) {
            return _t("Conversation ended...");
        }
        switch (this.currentStep?.type) {
            case "question_selection":
                return _t("Select an option above");
            default:
                return _t("Say something");
        }
    }
}

export const chatBotService = {
    dependencies: ["im_livechat.livechat", "mail.message", "mail.store", "rpc"],
    start(env, services) {
        return new ChatBotService(env, services);
    },
};
registry.category("services").add("im_livechat.chatbot", chatBotService);
