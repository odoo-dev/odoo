import { test, expect } from "@odoo/hoot";
import { getFilledOrder, setupPosEnv } from "../utils";
import { definePosModels } from "../data/generate_model_definitions";

definePosModels();

test("Preparation ticket: order note behavior and change detection", async () => {
    const store = await setupPosEnv();
    const order = await getFilledOrder(store);
    const categoryIds = new Set(store.models["pos.category"].map((category) => category.id));

    const generatePreparationChanges = (currentOrder) => {
        const generator = store.ticketPrinter.getGenerator({
            models: store.models,
            order: currentOrder,
        });
        return generator.generatePreparationData(categoryIds, {});
    };
    // Case 1: Adding a general customer note should create a NEW ticket
    {
        order.general_customer_note = "Cute Customer";
        const changes = generatePreparationChanges(order);
        expect(changes).toHaveLength(1);
        expect(changes[0].extra_data.general_customer_note).toBe("Cute Customer");
        expect(changes[0].changes.title).toBe("NEW");
    }
    // Case 2: Updating the general customer note should not mark it as NEW
    {
        order.updateLastOrderChange();
        order.general_customer_note = "Now not so cute";
        const changes = generatePreparationChanges(order);
        expect(changes).toHaveLength(1);
        expect(changes[0].extra_data.general_customer_note).toBe("Now not so cute");
        expect(changes[0].changes).toMatchObject({
            data: [],
            title: "",
        });
    }
    // Case 3: Updating internal note should trigger NOTE UPDATE
    {
        order.updateLastOrderChange();
        order.internal_note = "Hey chef, can you hurry please?";
        order.lines[0].customer_note = "Order level customer note";
        const changes = generatePreparationChanges(order);
        expect(changes).toHaveLength(1);
        expect(changes[0].extra_data.internal_note).toBe("Hey chef, can you hurry please?");
        expect(changes[0].changes.title).toBe("NOTE UPDATE");
    }
});
