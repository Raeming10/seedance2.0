import { describe, expect, it } from "vitest";
import {
  createSignedMediaUrl,
  signMediaPath,
  verifyMediaSignature,
} from "../src/media-signing";

const SECRET = "test-signing-secret-that-is-long-enough";

describe("signed media URLs", () => {
  it("accepts an untampered signature before expiry", async () => {
    const expires = 1_900_000_000;
    const signature = await signMediaPath("uploads/reference.mp4", expires, SECRET);

    await expect(
      verifyMediaSignature("uploads/reference.mp4", expires, signature, SECRET, expires - 1),
    ).resolves.toBe(true);
  });

  it("rejects a signature when the object key is changed", async () => {
    const expires = 1_900_000_000;
    const signature = await signMediaPath("uploads/reference.mp4", expires, SECRET);

    await expect(
      verifyMediaSignature("uploads/other.mp4", expires, signature, SECRET, expires - 1),
    ).resolves.toBe(false);
  });

  it("rejects expired and malformed signatures", async () => {
    const expires = 1_900_000_000;
    const signature = await signMediaPath("uploads/reference.mp4", expires, SECRET);

    await expect(
      verifyMediaSignature("uploads/reference.mp4", expires, signature, SECRET, expires),
    ).resolves.toBe(false);
    await expect(
      verifyMediaSignature("uploads/reference.mp4", expires, "short", SECRET, expires - 1),
    ).resolves.toBe(false);
  });

  it("builds a URL without exposing the signing secret", async () => {
    const url = new URL(await createSignedMediaUrl(
      "https://media.example.test/",
      "uploads/reference image.jpg",
      1_900_000_000,
      SECRET,
    ));

    expect(url.origin).toBe("https://media.example.test");
    expect(url.pathname).toBe("/media/uploads/reference%20image.jpg");
    expect(url.searchParams.get("expires")).toBe("1900000000");
    expect(url.searchParams.get("signature")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.href).not.toContain(SECRET);
  });
});
