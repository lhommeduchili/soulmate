import { describe, it, expect } from "vitest";
import { processCellKeyDown, sanitizeCellValue } from "./EditableCell";

describe("EditableCell pure keyboard and value logic", () => {
  describe("processCellKeyDown in view mode", () => {
    it("starts editing when Enter is pressed", () => {
      const result = processCellKeyDown({
        key: "Enter",
        isEditing: false,
        initialValue: "Original Track",
        currentValue: "Original Track",
      });

      expect(result.action).toBe("startEditing");
      expect(result.nextValue).toBe("Original Track");
      expect(result.shouldPreventDefault).toBe(true);
    });

    it("starts editing when Space is pressed", () => {
      const result = processCellKeyDown({
        key: " ",
        isEditing: false,
        initialValue: "Original Track",
        currentValue: "Original Track",
      });

      expect(result.action).toBe("startEditing");
      expect(result.nextValue).toBe("Original Track");
      expect(result.shouldPreventDefault).toBe(true);
    });

    it("does nothing in view mode for other keys (e.g. Tab, ArrowDown)", () => {
      const result = processCellKeyDown({
        key: "Tab",
        isEditing: false,
        initialValue: "Original Track",
        currentValue: "Original Track",
      });

      expect(result.action).toBe("none");
      expect(result.shouldPreventDefault).toBe(false);
    });
  });

  describe("processCellKeyDown in edit mode", () => {
    it("confirms and saves edit when Enter is pressed", () => {
      const result = processCellKeyDown({
        key: "Enter",
        isEditing: true,
        initialValue: "Original Track",
        currentValue: "Updated Track Name",
      });

      expect(result.action).toBe("save");
      expect(result.nextValue).toBe("Updated Track Name");
      expect(result.shouldPreventDefault).toBe(true);
    });

    it("cancels edits and restores initial value when Escape is pressed", () => {
      const result = processCellKeyDown({
        key: "Escape",
        isEditing: true,
        initialValue: "Original Track",
        currentValue: "Accidental Change",
      });

      expect(result.action).toBe("cancel");
      expect(result.nextValue).toBe("Original Track");
      expect(result.shouldPreventDefault).toBe(true);
    });

    it("continues editing for normal typing keys", () => {
      const result = processCellKeyDown({
        key: "a",
        isEditing: true,
        initialValue: "Original Track",
        currentValue: "Original Track a",
      });

      expect(result.action).toBe("none");
      expect(result.nextValue).toBe("Original Track a");
      expect(result.shouldPreventDefault).toBe(false);
    });
  });

  describe("sanitizeCellValue", () => {
    it("trims whitespace from edited values", () => {
      expect(sanitizeCellValue("  New Track Title   ", "Fallback")).toBe(
        "New Track Title",
      );
    });

    it("reverts to fallback value if user enters empty or whitespace-only string", () => {
      expect(sanitizeCellValue("   ", "Original Value")).toBe("Original Value");
      expect(sanitizeCellValue("", "Original Value")).toBe("Original Value");
    });
  });
});
