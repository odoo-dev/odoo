// Part of Odoo. See LICENSE file for full copyright and licensing details.
import { Dialog } from "@web/core/dialog/dialog";
import { Component, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { ProductCard } from "@point_of_sale/app/components/product_card/product_card";
import { NumericInput } from "@point_of_sale/app/components/inputs/numeric_input/numeric_input";
import { useService } from "@web/core/utils/hooks";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

export class EventRegistrationPopup extends Component {
    static template = "pos_event.EventRegistrationPopup";
    static props = ["data", "getPayload", "close", "event"];
    static components = {
        Dialog,
        ProductCard,
        NumericInput,
    };
    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
        this.state = useState({
            byRegistration: [],
            byOrder: {},
        });
        this.dataInQty = this.props.data.reduce((acc, data) => {
            for (let i = 0; i < data.qty; i++) {
                acc.push(data);
            }
            return acc;
        }, []);
        for (const [idx, data] of Object.entries(this.dataInQty)) {
            this.state.byRegistration[idx] = {
                ticket_id: data.ticket_id,
                product_id: data.product_id,
                questions: {},
            };
            const QUESTION_TYPE_MAP = {
                name: "name",
                email: "email",
                phone: "phone",
                company_name: "company_name",
                registration_answer_ids: "value_text_box",
                registration_answer_choice_ids: "value_answer_id",
            };
            for (const question of this.questionsByRegistration) {
                if (data.registration_ids) {
                    const registration = data.registration_ids[idx];
                    const answers = this.state.byRegistration[idx].questions;
                    if (!answers[question.id]) {
                        answers[question.id] =
                            registration?.[QUESTION_TYPE_MAP[question.question_type]] || "";
                    }
                    if (question.question_type === "simple_choice") {
                        const choiceAnswer = registration.registration_answer_choice_ids?.find(
                            (ans) =>
                                ans.question_id?.id == question.id && // match the question
                                ans.question_id?.question_type === "simple_choice"
                        );
                        if (choiceAnswer) {
                            answers[question.id] = choiceAnswer.value_answer_id?.id || "";
                        }
                    }
                    if (question.question_type === "text_box") {
                        const textBoxAnswer = registration?.registration_answer_ids?.find(
                            (ans) =>
                                ans.question_id.id === question.id &&
                                ans.question_id.question_type === "text_box"
                        );

                        if (textBoxAnswer) {
                            answers[question.id] = textBoxAnswer.value_text_box || "";
                        }
                    }
                } else {
                    this.state.byRegistration[idx].questions[question.id] = "";
                }
            }
            for (const question of this.questionsOncePerOrder) {
                this.state.byOrder[question.id] = "";
            }

            if (this.props.event.question_ids.length === 0) {
                this.confirm();
            }
        }
    }

    get questionsByRegistration() {
        return this.props.event.question_ids.filter((question) => !question.once_per_order);
    }

    get questionsOncePerOrder() {
        return this.props.event.question_ids.filter((question) => question.once_per_order);
    }

    isQuestionMissingMandatoryAnswer(id, value) {
        const question = this.pos.models["event.question"].get(id);
        return !!(question && question.is_mandatory_answer && !value);
    }

    confirm() {
        const requiredByRegistration = Object.values(this.state.byRegistration).some((data) => {
            for (const [id, value] of Object.entries(data.questions)) {
                if (this.isQuestionMissingMandatoryAnswer(id, value)) {
                    return true;
                }
            }
        });

        const requiredByOrder = Object.entries(this.state.byOrder).some(([id, value]) =>
            this.isQuestionMissingMandatoryAnswer(id, value)
        );

        if (requiredByRegistration || requiredByOrder) {
            this.dialog.add(AlertDialog, {
                title: "Error",
                body: "Please fill in all required fields",
            });
            return;
        }

        const registrationByTickets = this.state.byRegistration.reduce((acc, data) => {
            if (!acc[data.ticket_id.id]) {
                acc[data.ticket_id.id] = [];
            }

            acc[data.ticket_id.id].push(data.questions);
            return acc;
        }, {});

        this.props.getPayload({
            byRegistration: registrationByTickets,
            byOrder: this.state.byOrder,
        });
        this.props.close();
    }
    close() {
        this.props.close();
    }
}
