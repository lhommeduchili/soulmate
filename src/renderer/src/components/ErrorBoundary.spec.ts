import { describe, it, expect, vi } from "vitest";
import {
  ErrorBoundary,
  createInitialErrorBoundaryState,
  createErrorState,
  resolveErrorFallbackMessage,
} from "./ErrorBoundary";
import { AppError } from "../../../main/utils/AppError";

describe("ErrorBoundary State Transitions and Trigger Helpers", () => {
  it("initializes with hasError: false and no error", () => {
    const state = createInitialErrorBoundaryState();
    expect(state.hasError).toBe(false);
    expect(state.error).toBeUndefined();
  });

  it("transitions to error state via getDerivedStateFromError", () => {
    const error = new Error("Simulated component crash");
    const state = ErrorBoundary.getDerivedStateFromError(error);

    expect(state.hasError).toBe(true);
    expect(state.error).toBe(error);
    expect(state.error?.message).toBe("Simulated component crash");
  });

  it("transitions to error state via createErrorState helper", () => {
    const appErr = new AppError("STORAGE_IO_ERROR", "Failed to access disk");
    const state = createErrorState(appErr);

    expect(state.hasError).toBe(true);
    expect(state.error).toBe(appErr);
    expect((state.error as AppError).code).toBe("STORAGE_IO_ERROR");
  });

  it("resets state and triggers onReset callback when reset() is invoked", () => {
    const onResetMock = vi.fn();
    const boundary = new ErrorBoundary({
      children: null,
      onReset: onResetMock,
    });

    // Simulate error transition
    boundary.state = createErrorState(new Error("Component broke"));
    expect(boundary.state.hasError).toBe(true);

    // Mock setState
    const setStateMock = vi.fn((nextState) => {
      boundary.state = { ...boundary.state, ...nextState };
    });
    boundary.setState = setStateMock;

    boundary.reset();

    expect(onResetMock).toHaveBeenCalledTimes(1);
    expect(setStateMock).toHaveBeenCalledWith({
      hasError: false,
      error: undefined,
    });
  });

  it("triggers onError callback when componentDidCatch is called", () => {
    const onErrorMock = vi.fn();
    const boundary = new ErrorBoundary({
      children: null,
      onError: onErrorMock,
      componentName: "TestComponent",
    });

    const error = new Error("Unhandled render exception");
    const errorInfo = { componentStack: "\n    in TestComponent\n    in App" };

    boundary.componentDidCatch(error, errorInfo);

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledWith(error, errorInfo);
  });

  describe("resolveErrorFallbackMessage helper", () => {
    it("extracts message from standard Error", () => {
      const err = new Error("Connection lost");
      expect(resolveErrorFallbackMessage(err)).toBe("Connection lost");
    });

    it("extracts message from AppError", () => {
      const appErr = new AppError(
        "SEARCH_TIMEOUT",
        "Soulseek search timed out",
      );
      expect(resolveErrorFallbackMessage(appErr)).toBe(
        "Soulseek search timed out",
      );
    });

    it("accepts string errors directly", () => {
      expect(resolveErrorFallbackMessage("Direct error text")).toBe(
        "Direct error text",
      );
    });

    it("extracts message from an error-like object", () => {
      expect(
        resolveErrorFallbackMessage({ message: "Payload schema mismatch" }),
      ).toBe("Payload schema mismatch");
    });

    it("falls back to default fallback text when message is empty or null", () => {
      expect(resolveErrorFallbackMessage(null, "Default fallback")).toBe(
        "Default fallback",
      );
      expect(resolveErrorFallbackMessage(undefined, "Custom fallback")).toBe(
        "Custom fallback",
      );
      expect(resolveErrorFallbackMessage("", "Non-empty fallback")).toBe(
        "Non-empty fallback",
      );
    });
  });
});
