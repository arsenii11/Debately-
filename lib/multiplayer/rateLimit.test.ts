import { afterEach, describe, expect, it } from "vitest";
import { VISITOR_COOKIE_NAME } from "@/lib/visitorIdentity";
import { getClientKey } from "./rateLimit";

function requestWithHeaders(headers: HeadersInit): Request {
  return new Request("https://debately.test/api/multiplayer/sessions", {
    method: "POST",
    headers,
  });
}

describe("multiplayer create-session rate limit key", () => {
  afterEach(() => {
    delete process.env.MULTIPLAYER_TRUST_PROXY_HEADERS;
  });

  it("uses the stable visitor cookie when present", () => {
    const req = requestWithHeaders({
      cookie: `${VISITOR_COOKIE_NAME}=visitor-12345678`,
      "x-forwarded-for": "203.0.113.1",
    });
    expect(getClientKey(req)).toBe("visitor:visitor-12345678");
  });

  it("does not trust proxy headers unless explicitly enabled", () => {
    const req = requestWithHeaders({ "x-forwarded-for": "203.0.113.1" });
    expect(getClientKey(req)).toBe("ip:unknown");
  });

  it("can trust proxy headers behind a configured reverse proxy", () => {
    process.env.MULTIPLAYER_TRUST_PROXY_HEADERS = "true";
    const req = requestWithHeaders({ "x-forwarded-for": "203.0.113.1" });
    expect(getClientKey(req)).toBe("ip:203.0.113.1");
  });
});
