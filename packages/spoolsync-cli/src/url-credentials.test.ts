import { expect, test } from "bun:test";

import { redactUrl, urlCredential } from "./url-credentials";

test("finds credentials in userinfo and secret-looking query parameters only", () => {
  expect(urlCredential(new URL("http://u:p@h/"))).toContain("user name");
  expect(urlCredential(new URL("http://h/?API_KEY=1"))).toContain("API_KEY");
  expect(urlCredential(new URL("http://h/?page=2"))).toBeUndefined();
});

test("redaction hides the secret and leaves other URLs untouched", () => {
  expect(redactUrl("http://h/?token=SECRET&page=2")).not.toContain("SECRET");
  expect(redactUrl("http://h/?token=SECRET&page=2")).toContain("page=2");
  expect(redactUrl("http://u:SECRET@h/")).not.toContain("SECRET");
  expect(redactUrl("http://h/path")).toBe("http://h/path");
  expect(redactUrl("not a url")).toBe("not a url");
});
