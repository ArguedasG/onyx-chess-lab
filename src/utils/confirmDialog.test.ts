import { describe, expect, it } from "vitest";
import { answerConfirm, confirmDialog, currentConfirm, subscribeConfirm } from "./confirmDialog";

describe("confirm dialog", () => {
    it("shows one question at a time and resolves each with its own answer", async () => {
        let changes = 0;
        const unsubscribe = subscribeConfirm(() => changes++);

        const first = confirmDialog({ title: "Delete", message: "Delete A?", danger: true });
        const second = confirmDialog({ title: "Replace", message: "Replace B?" });
        expect(currentConfirm()?.message).toBe("Delete A?");

        answerConfirm(currentConfirm()!.id, true);
        await expect(first).resolves.toBe(true);
        expect(currentConfirm()?.message).toBe("Replace B?");

        answerConfirm(currentConfirm()!.id, false);
        await expect(second).resolves.toBe(false);
        expect(currentConfirm()).toBeNull();
        expect(changes).toBe(4);

        unsubscribe();
    });

    it("ignores an answer for a question that is no longer pending", async () => {
        const pending = confirmDialog({ title: "Delete", message: "Delete C?" });
        const { id } = currentConfirm()!;
        answerConfirm(id, false);
        answerConfirm(id, true);
        await expect(pending).resolves.toBe(false);
    });
});
