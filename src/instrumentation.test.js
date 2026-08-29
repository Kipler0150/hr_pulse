import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  edgeInit: vi.fn(),
  serverInit: vi.fn(),
}));

vi.mock("../sentry.edge.config.js", () => {
  mocks.edgeInit();
  return {};
});

vi.mock("../sentry.server.config.js", () => {
  mocks.serverInit();
  return {};
});

describe("Next.js instrumentation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("initializes the server Sentry client in the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");

    const { register } = await import("../instrumentation.js");
    await register();

    expect(mocks.serverInit).toHaveBeenCalledOnce();
    expect(mocks.edgeInit).not.toHaveBeenCalled();
  });

  it("initializes the edge Sentry client in the Edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    const { register } = await import("../instrumentation.js");
    await register();

    expect(mocks.edgeInit).toHaveBeenCalledOnce();
    expect(mocks.serverInit).not.toHaveBeenCalled();
  });
});
