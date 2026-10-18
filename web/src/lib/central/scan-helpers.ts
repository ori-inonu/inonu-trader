// Helpers shared by the tests that guard the /central feature. They are not imported by any page or component.
//
// The forbidden tokens are assembled from parts so that this file does not contain them itself; the tests scan every file
// of the feature, this one included.

const join = (...parts: string[]) => parts.join("");

/** Wallet access, signing, sending, network and storage APIs that the read only page must never use. */
export const FORBIDDEN_TOKENS: readonly string[] = [
  join("window.", "okx", "wallet"),
  join("okx", "wallet"),
  join("eth_", "sendTransaction"),
  join("wallet_", "sendCalls"),
  join("eth_", "sign"),
  join("personal_", "sign"),
  join("eth_", "requestAccounts"),
  join("fet", "ch("),
  join("XMLHttp", "Request"),
  join("Web", "Socket"),
  join("local", "Storage"),
  join("session", "Storage"),
  join("indexed", "DB"),
  join("send", "Beacon"),
  join("Event", "Source"),
];

export interface BannedMark {
  name: string;
  bytes: number[];
}

/** UTF-8 byte sequences of the marks the project forbids in rendered text (CLAUDE.md), plus look alikes. */
export const BANNED_MARKS: readonly BannedMark[] = [
  { name: "travessao (U+2014)", bytes: [0xe2, 0x80, 0x94] },
  { name: "meia-risca (U+2013)", bytes: [0xe2, 0x80, 0x93] },
  { name: "barra horizontal (U+2015)", bytes: [0xe2, 0x80, 0x95] },
  { name: "ponto mediano (U+00B7)", bytes: [0xc2, 0xb7] },
  { name: "sinal de menos (U+2212)", bytes: [0xe2, 0x88, 0x92] },
  { name: "marcador (U+2022)", bytes: [0xe2, 0x80, 0xa2] },
  { name: "operador ponto (U+22C5)", bytes: [0xe2, 0x8b, 0x85] },
  { name: "operador bullet (U+2219)", bytes: [0xe2, 0x88, 0x99] },
  { name: "ponto de hifenizacao (U+2027)", bytes: [0xe2, 0x80, 0xa7] },
  { name: "ponto katakana (U+30FB)", bytes: [0xe3, 0x83, 0xbb] },
];

/** Byte level search, so that no decoding step can hide a mark. Returns the names of the marks found. */
export function findBannedMarks(bytes: Uint8Array): string[] {
  const found: string[] = [];
  for (const mark of BANNED_MARKS) {
    outer: for (let start = 0; start + mark.bytes.length <= bytes.length; start += 1) {
      for (let offset = 0; offset < mark.bytes.length; offset += 1) {
        if (bytes[start + offset] !== mark.bytes[offset]) continue outer;
      }
      found.push(mark.name);
      break;
    }
  }
  return found;
}

/** Entities and escape sequences that would render a banned mark although the source bytes are plain ASCII. */
export const ESCAPE_PATTERN = new RegExp(
  [
    "&(?:mdash|ndash|middot|bull|minus|horbar);",
    "&#(?:8212|8211|8213|183|8226|8722|8729|8901);",
    "&#x(?:2014|2013|2015|b7|00b7|2022|2212|2219|22c5);",
    `${"\\\\"}u(?:2014|2013|2015|00b7|2022|2212|2219|22c5)`,
    `${"\\\\"}u\\{(?:2014|2013|2015|b7|00b7|2022|2212|2219|22c5)\\}`,
  ].join("|"),
  "i",
);

/** Text that must never be visible: a formatting accident. */
export const ACCIDENT_PATTERN = /NaN|undefined|\[object|Infinity|null</;

/** Convenience for rendered HTML. */
export function bannedMarksInText(text: string): string[] {
  return findBannedMarks(new TextEncoder().encode(text));
}
