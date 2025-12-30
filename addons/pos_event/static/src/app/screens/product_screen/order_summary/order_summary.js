import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { patch } from "@web/core/utils/patch";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { EventRegistrationPopup } from "@pos_event/app/components/popup/event_registration_popup/event_registration_popup";

patch(OrderSummary.prototype, {
    async onOrderlineLongPress(ev, orderline) {
        if (!orderline.event_ticket_id) {
            return super.onOrderlineLongPress(ev, orderline);
        }

        const event = orderline.event_ticket_id.event_id;
        const registrationJson = orderline.event_registration_ids.map((reg) => ({
            id: reg.id,
            name: reg.name,
            email: reg.email,
            phone: reg.phone,
            company_name: reg.company_name,
            registration_answer_ids: reg.registration_answer_ids,
            registration_answer_choice_ids: reg.registration_answer_choice_ids,
        }));

        const result = await makeAwaitable(this.dialog, EventRegistrationPopup, {
            event,
            data: [
                {
                    product_id: orderline.product_id,
                    qty: orderline.qty,
                    ticket_id: orderline.event_ticket_id,
                    registration_ids: registrationJson,
                },
            ],
        });

        if (!result) {
            return result;
        }
        for (const [ticketId, data] of Object.entries(result.byRegistration)) {
            for (let idx = 0; idx < data.length; idx++) {
                const answers = data[idx];
                const originalReg = orderline.event_registration_ids[idx];

                if (!originalReg) {
                    continue;
                }

                const userData = {
                    name: originalReg.name,
                    email: originalReg.email,
                    phone: originalReg.phone,
                    company_name: originalReg.company_name,
                    registration_answer_ids: originalReg.registration_answer_ids,
                    registration_answer_choice_ids: originalReg.registration_answer_choice_ids,
                };

                const textBoxCommands = [];
                const simpleChoiceCommands = [];
                for (const [questionId, answer] of Object.entries(answers)) {
                    const q = this.pos.models["event.question"].get(parseInt(questionId));
                    if (!q) {
                        continue;
                    }

                    switch (q.question_type) {
                        case "email":
                            userData.email = answer;
                            break;
                        case "phone":
                            userData.phone = answer;
                            break;
                        case "name":
                            userData.name = answer;
                            break;
                        case "company_name":
                            userData.company_name = answer;
                            break;
                        case "text_box":
                            // eslint-disable-next-line no-case-declarations
                            const existing = originalReg.registration_answer_ids.find(
                                (rec) => rec.question_id.id == q.id
                            );
                            if (existing) {
                                existing.value_text_box = answer;
                                textBoxCommands.push([1, existing.id, { value_text_box: answer }]);
                                // textBoxCommands.push(existing.question_id.id);
                            } else {
                                textBoxCommands.push([
                                    0,
                                    0,
                                    {
                                        question_id: q.id,
                                        value_text_box: answer,
                                    },
                                ]);
                            }
                            break;
                        case "simple_choice":
                            // eslint-disable-next-line no-case-declarations
                            const existingChoice = originalReg.registration_answer_choice_ids.find(
                                (rec) => rec.question_id.id == q.id
                            );
                            if (existingChoice) {
                                existingChoice.value_answer_id = { id: parseInt(answer) };
                                simpleChoiceCommands.push([
                                    1,
                                    existingChoice.id,
                                    { value_answer_id: parseInt(answer) },
                                ]);
                            } else {
                                simpleChoiceCommands.push([
                                    0,
                                    0,
                                    {
                                        question_id: q.id,
                                        value_answer_id: parseInt(answer),
                                    },
                                ]);
                            }
                            break;
                    }
                }
                originalReg.update({
                    ...userData,
                    registration_answer_ids: textBoxCommands,
                    registration_answer_choice_ids: simpleChoiceCommands,
                });
            }
        }
    },
});
