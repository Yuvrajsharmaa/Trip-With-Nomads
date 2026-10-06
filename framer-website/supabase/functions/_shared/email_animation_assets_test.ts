import {
  assert,
  assertEquals,
  assertLess,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const assetDirectory = new URL(
  "../../../email-previews/assets/",
  import.meta.url,
);

function littleEndian16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

for (const assetName of ["payment-success.gif", "payment-failed.gif"]) {
  Deno.test(`email animation ${assetName} is a compact GIF with a static first frame`, async () => {
    const bytes = await Deno.readFile(new URL(assetName, assetDirectory));
    const header = new TextDecoder().decode(bytes.slice(0, 6));

    assertEquals(header, "GIF89a");
    assertEquals(littleEndian16(bytes, 6), 240);
    assertEquals(littleEndian16(bytes, 8), 240);
    assert(bytes.length > 1_000);
    assertLess(bytes.length, 250_000);
  });
}
