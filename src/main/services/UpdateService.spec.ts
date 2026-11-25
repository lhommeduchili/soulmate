import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([
      {
        webContents: {
          send: vi.fn(),
        },
      },
    ]),
  },
  app: {
    getVersion: vi.fn().mockReturnValue("1.1.2"),
  },
}));

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: false },
}));

import { UpdateService, UpdateStatus } from "./UpdateService";

describe("UpdateService (Unit)", () => {
  let updateService: UpdateService;

  beforeEach(() => {
    updateService = new UpdateService();
  });

  it("initializes with idle status", () => {
    const status = updateService.getStatus();
    expect(status.status).toBe("idle");
  });

  it("bypasses actual network checks in test/dev environment safely", async () => {
    const status = await updateService.checkForUpdates();
    expect(["idle", "up-to-date"]).toContain(status.status);
  });

  it("updates and broadcasts simulated status for testing UI and notification pills", () => {
    const listener = vi.fn();
    updateService.onStatusChange(listener);

    const targetStatus: UpdateStatus = {
      status: "downloaded",
      version: "1.2.0",
      progress: 100,
    };

    updateService.setSimulatedStatus(targetStatus);

    expect(updateService.getStatus()).toEqual(targetStatus);
    expect(listener).toHaveBeenCalledWith(targetStatus);
  });
});
