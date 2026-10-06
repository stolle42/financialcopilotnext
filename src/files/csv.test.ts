import { describe, expect, test } from "vitest";
import { decodeFile, tokenise } from "./csv";

// contracts/csv-import.md, pipeline steps 2–3 and encodings; R-09.

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const bytes = (...parts: (number | number[])[]) => new Uint8Array(parts.flat());

describe("decodeFile", () => {
  test("reads 0x80 as € and 0xE4 as ä in Windows-1252", () => {
    expect(decodeFile(bytes(0x80, 0x20, 0xe4), "Windows-1252")).toBe("€ ä");
  });

  test("reads 0xA4 as € in ISO-8859-15", () => {
    expect(decodeFile(bytes(0xa4), "ISO-8859-15")).toBe("€");
  });

  test("reads UTF-8 and ignores a leading byte-order mark", () => {
    expect(decodeFile(bytes(0xef, 0xbb, 0xbf, ascii("Date;"), 0xe2, 0x82, 0xac), "UTF-8")).toBe(
      "Date;€",
    );
    expect(decodeFile(bytes(ascii("Date")), "UTF-8")).toBe("Date");
  });

  test("reads UTF-16LE and ignores a leading byte-order mark", () => {
    expect(decodeFile(bytes(0xff, 0xfe, 0x44, 0x00, 0xac, 0x20), "UTF-16LE")).toBe("D€");
  });

  test("refuses bytes that are invalid in the encoding, naming the encoding", () => {
    // A Windows-1252 file read as UTF-8: "€" and "ä" are not valid UTF-8 on their own.
    expect(decodeFile(bytes(ascii("Fee "), 0x80), "UTF-8")).toEqual({
      code: "import-decoding-failed",
      details: { encoding: "UTF-8" },
    });
    expect(decodeFile(bytes(0xe4, ascii("cker")), "UTF-8")).toMatchObject({
      code: "import-decoding-failed",
    });
    // UTF-16 needs whole pairs of bytes.
    expect(decodeFile(bytes(0x44, 0x00, 0x45), "UTF-16LE")).toMatchObject({
      code: "import-decoding-failed",
    });
  });
});

describe("tokenise", () => {
  test.each([",", ";", "\t", "|"])("detects %j as the delimiter", (delimiter) => {
    const text =
      ["Date", "Payee", "Amount"].join(delimiter) + "\n" + ["1", "Shop", "4"].join(delimiter);
    expect(tokenise(text)).toEqual([
      ["Date", "Payee", "Amount"],
      ["1", "Shop", "4"],
    ]);
  });

  test("prefers ; over the , inside amounts with , decimals", () => {
    const text = "Date;Payee;Amount\n01.08.2026;Shop;-45,20\n02.08.2026;Bakery;-4,50";
    expect(tokenise(text)[1]).toEqual(["01.08.2026", "Shop", "-45,20"]);
  });

  test("keeps a delimiter, a line break and a doubled quote inside a quoted cell", () => {
    const text = 'Payee,Purpose,Amount\n"Shop, Main St","Line one\nline two","Say ""hi"""';
    expect(tokenise(text)).toEqual([
      ["Payee", "Purpose", "Amount"],
      ["Shop, Main St", "Line one\nline two", 'Say "hi"'],
    ]);
  });

  test("keeps blank lines as records, so row numbers match the file", () => {
    expect(tokenise("Date;Amount\n\n1;4\n2;5\n")).toEqual([
      ["Date", "Amount"],
      [""],
      ["1", "4"],
      ["2", "5"],
      [""],
    ]);
  });

  test("reads Windows line endings", () => {
    expect(tokenise("Date;Amount\r\n1;4")).toEqual([
      ["Date", "Amount"],
      ["1", "4"],
    ]);
  });
});
