import * as assert from "assert";
import * as mixhive from "../services/mixhive";

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
let fetchResponse: Response | null = null;

suite("MixHive service", () => {
  setup(() => {
    fetchCalls = [];
    fetchResponse = null;
    (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      if (fetchResponse) {
        return fetchResponse;
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  });

  teardown(() => {
    (globalThis as any).fetch = undefined;
  });

  test("isConfigured returns false when env vars missing", () => {
    assert.strictEqual(mixhive.isConfigured(), false);
  });

  test("signIn posts to Supabase auth", async () => {
    fetchResponse = new Response(
      JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { email: "a@b.com" } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

    await mixhive.signIn("a@b.com", "pw");
    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes("/auth/v1/token?grant_type=password"));
    assert.strictEqual(fetchCalls[0].init?.method, "POST");
  });

  test("publishTrack fails without session", async () => {
    await mixhive.signOut();
    try {
      await mixhive.publishTrack({ title: "T", bpm: 140 }, Buffer.from([]));
      assert.fail("expected error");
    } catch (err: any) {
      assert.ok(err.message.includes("Sign in"));
    }
  });

  test("listTracks returns empty when not configured", async () => {
    const result = await mixhive.listTracks();
    assert.deepStrictEqual(result, { tracks: [], total: 0 });
  });
});
