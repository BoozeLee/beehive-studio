import { describe, it, expect, vi, beforeEach } from "vitest";
import { publishTrack, BridgeError } from "../api/mixhiveBridge";

describe("mixhiveBridge.publishTrack", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs the track to /api/tracks and returns the published id + url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ track_id: "trk_123", url: "/m/trk_123", status: "published" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishTrack({
      title: "Dark Ritual",
      artist: "ÆNIMAL",
      genre: "techno",
      bpm: 142,
      tags: ["acid", "hypnotic"],
      audioData: "BASE64AUDIO",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/tracks$/);
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.title).toBe("Dark Ritual");
    expect(body.bpm).toBe(142);
    expect(body.audioData).toBe("BASE64AUDIO");
    expect(result.track_id).toBe("trk_123");
    expect(result.url).toBe("/m/trk_123");
  });

  it("throws BridgeError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" })
    );
    await expect(publishTrack({ title: "x", artist: "y", tags: [] })).rejects.toBeInstanceOf(BridgeError);
  });
});
