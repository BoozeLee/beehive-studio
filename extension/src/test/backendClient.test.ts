import * as assert from "assert";
import { BackendClient } from "../services/backendClient";

suite("BackendClient", () => {
  test("constructs with gateway and orchestrator URLs", () => {
    const backend = new BackendClient("http://gateway:9000", "http://orchestrator:9876");
    assert.strictEqual(backend.gateway.client.defaults.baseURL, "http://gateway:9000");
    assert.strictEqual(backend.orchestrator.client.defaults.baseURL, "http://orchestrator:9876");
  });

  test("connectProjectEvents returns a WebSocket", () => {
    const backend = new BackendClient("http://gateway:9000", "http://orchestrator:9876");
    const ws = backend.gateway.connectProjectEvents("p1", () => { /* noop */ });
    assert.ok(ws instanceof WebSocket);
    assert.ok(ws.url.includes("/projects/p1/events"));
    ws.close();
  });
});
