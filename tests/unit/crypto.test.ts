import { describe, it, expect } from "vitest";
import { encrypt, decrypt, hashEmail } from "@/lib/crypto";

describe("crypto", () => {
  it("round-trips text", () => {
    expect(decrypt(encrypt("Priya Sharma"))).toBe("Priya Sharma");
  });

  it("produces different ciphertext for the same input", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects tampered ciphertext", () => {
    const [iv, tag, data] = encrypt("secret").split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decrypt([iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });

  it("hashes emails case- and whitespace-insensitively", () => {
    expect(hashEmail("A@x.com ")).toBe(hashEmail("a@x.com"));
    expect(hashEmail("a@x.com")).not.toBe(hashEmail("b@x.com"));
  });
});
