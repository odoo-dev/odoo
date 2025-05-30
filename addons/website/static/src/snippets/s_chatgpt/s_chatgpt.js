import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class ChatGPTInteraction extends Interaction {
    static selector = ".s_chatgpt";

    setup() {
        this.el.querySelector('.chatgpt-send').addEventListener('click', async () => {
            debugger
            const input = this.el.querySelector('.chatgpt-input').value;
            // Call your backend or ChatGPT API here
            this.el.querySelector('.chatgpt-response').textContent = "Response from ChatGPT: " + input;
        });
    }
}

registry.category("public.interactions").add("website.chatgpt", ChatGPTInteraction);
