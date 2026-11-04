import { describe, expect, test } from "bun:test";

import { AMAZON_STORES, detectAmazonStore } from "./amazon";
import { AFFILIATE_PROGRAMS, buyLinks, programsOf } from "./index";
import { searchStoreProgram } from "./stores";

const EN = ["en-US"];

describe("Amazon", () => {
  test("links encode every part and never let a name change the query", () => {
    const [link] = buyLinks(
      { brand: "Fiberlogy", material: "PLA", color: 'Red & Blue #1 "x"' },
      EN,
    );
    const url = new URL(link!.url);
    expect(url.origin + url.pathname).toBe("https://www.amazon.com/s");
    expect(url.searchParams.get("k")).toBe('Fiberlogy PLA Red & Blue #1 "x"');
    expect(url.searchParams.get("tag")).toBe("spoolsync-20");
    expect([...url.searchParams.keys()]).toEqual(["k", "tag"]);
    expect(url.hash).toBe("");
    expect(
      new URL(buyLinks({ brand: "Ünïcode 黒", material: "PETG" }, EN)[0]!.url).searchParams.get(
        "k",
      ),
    ).toBe("Ünïcode 黒 PETG");
  });

  test("whitespace is collapsed, empty parts dropped, a lone brand gets a filament hint", () => {
    const url = new URL(
      buyLinks({ brand: "  Prusa\n Research ", material: null, color: "" }, EN)[0]!.url,
    );
    expect(url.searchParams.get("k")).toBe("Prusa Research filament");
    expect(buyLinks({ brand: "", material: null, color: "  " }, EN)).toEqual([]);
    expect(buyLinks({}, EN)).toEqual([]);
  });

  test("the store follows the browser's country, then its language, and defaults to amazon.com", () => {
    expect(detectAmazonStore(["en-GB"])).toBe("co.uk");
    expect(detectAmazonStore(["en-CA", "fr-CA"])).toBe("ca");
    expect(detectAmazonStore(["de-AT"])).toBe("de");
    expect(detectAmazonStore(["sv"])).toBe("se");
    expect(detectAmazonStore(["nl-BE"])).toBe("nl");
    expect(detectAmazonStore(["pl_PL"])).toBe("pl");
    expect(detectAmazonStore(["en"])).toBe("com");
    expect(detectAmazonStore(["fr-CH"])).toBe("fr");
    expect(detectAmazonStore(["ja-JP"])).toBe("com");
    expect(detectAmazonStore([])).toBe("com");
  });

  test("every store builds a tagged search on its own host", () => {
    for (const store of AMAZON_STORES) {
      const language =
        store.id === "com"
          ? "en-US"
          : store.id === "co.uk"
            ? "en-GB"
            : store.id === "se"
              ? "sv-SE"
              : `${store.id}-${store.id.toUpperCase()}`;
      const url = new URL(buyLinks({ brand: "Prusa", material: "PLA" }, [language])[0]!.url);
      expect(url.host).toBe(store.host);
      expect(url.searchParams.get("tag")).toBe("spoolsync-20");
    }
  });
});

describe("SUNLU", () => {
  test("a SUNLU spool gets the maker's store first, then Amazon, with the coupon", () => {
    const links = buyLinks({ brand: "sunlu", material: "PLA+", color: "Fire Red" }, EN);
    expect(links.map((link) => link.shop)).toEqual(["SUNLU", "Amazon"]);
    const url = new URL(links[0]!.url);
    expect(url.origin + url.pathname).toBe("https://store.sunlu.com/search");
    expect(url.searchParams.get("q")).toBe("PLA+ Fire Red");
    expect(url.searchParams.get("sca_ref")).toBe("12700401.UcCqD96LNe");
    expect(url.searchParams.get("utm_source")).toBe("sunluaffiliate");
    expect(url.searchParams.get("utm_medium")).toBe("sunluaffiliate");
    expect(url.searchParams.get("utm_campaign")).toBe("sunluaffiliate");
    expect(links[0]!.couponCode).toBe("SpoolSync");
    expect(links[0]!.couponOffer).toBe("5% off");
    expect(links[1]!.couponCode).toBeNull();
  });

  test("the brand match ignores case and punctuation, and other brands get Amazon only", () => {
    expect(buyLinks({ brand: " SUN-LU ", material: "PLA" }, EN)[0]!.shop).toBe("SUNLU");
    expect(buyLinks({ brand: "Sunluxe", material: "PLA" }, EN).map((l) => l.shop)).toEqual([
      "Amazon",
    ]);
  });

  test("a brand-only link goes to the store's search for filament", () => {
    const url = new URL(buyLinks({ brand: "SUNLU", material: "filament" }, EN)[0]!.url);
    expect(url.searchParams.get("q")).toBe("filament");
  });
});

describe("OVERTURE", () => {
  test("an Overture spool gets the maker's store first, with the affiliate id", () => {
    for (const brand of ["Overture", "OVERTURE", "Overture3D"]) {
      const links = buyLinks({ brand, material: "PLA", color: "Black" }, EN);
      expect(links.map((link) => link.shop)).toEqual(["OVERTURE", "Amazon"]);
    }
    const url = new URL(
      buyLinks({ brand: "Overture", material: "PETG", color: "Blue" }, EN)[0]!.url,
    );
    expect(url.origin + url.pathname).toBe("https://overture3d.com/search");
    expect(url.searchParams.get("q")).toBe("PETG Blue");
    expect(url.searchParams.get("aff")).toBe("306");
    expect(url.searchParams.get("utm_source")).toBe("affiliate");
    expect(url.searchParams.get("utm_medium")).toBe("referral");
    expect(url.searchParams.get("utm_campaign")).toBe("spoolsync");
    expect(buyLinks({ brand: "Overture", material: "PLA" }, EN)[0]!.couponCode).toBeNull();
  });
});

describe("AMOLEN", () => {
  test("an Amolen spool gets the maker's store first, with the referral", () => {
    const links = buyLinks({ brand: "Amolen", material: "PLA", color: "Silk Gold" }, EN);
    expect(links.map((link) => link.shop)).toEqual(["AMOLEN", "Amazon"]);
    const url = new URL(links[0]!.url);
    expect(url.origin + url.pathname).toBe("https://www.amolen.com/search");
    expect(url.searchParams.get("q")).toBe("PLA Silk Gold");
    expect(url.searchParams.get("ref")).toBe("spoolsync");
    expect(url.searchParams.get("type")).toBe("product");
  });

  test("the front page link has the referral but no search-only parameter", () => {
    const url = new URL(amolenFront());
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("ref")).toBe("spoolsync");
    expect(url.searchParams.has("type")).toBe(false);
  });
});

function amolenFront(): string {
  const program = AFFILIATE_PROGRAMS.find((p) => p.id === "amolen")!;
  return program.link({ brand: "AMOLEN", material: "", color: "", languages: EN }) ?? "";
}

describe("the program registry", () => {
  test("a store program without material or color links to its front page", () => {
    const program = searchStoreProgram({
      id: "demo",
      name: "Demo",
      brands: ["Demo"],
      origin: "https://shop.example",
      params: { ref: "abc" },
      disclosure: "x",
    });
    expect(program.link({ brand: "Demo", material: "", color: "", languages: EN })).toBe(
      "https://shop.example/?ref=abc",
    );
  });

  test("new programs plug in through the list, brand stores first", () => {
    const demo = searchStoreProgram({
      id: "demo",
      name: "Demo",
      brands: ["Demo"],
      origin: "https://shop.example",
      params: { ref: "abc" },
      disclosure: "Demo links are affiliate links.",
    });
    const links = buyLinks({ brand: "Demo", material: "PLA" }, EN, [...AFFILIATE_PROGRAMS, demo]);
    expect(links.map((link) => link.shop)).toEqual(["Demo", "Amazon"]);
    expect(programsOf(links, [...AFFILIATE_PROGRAMS, demo]).map((p) => p.disclosure)).toContain(
      "Demo links are affiliate links.",
    );
  });

  test("every program states a disclosure and where its links go", () => {
    for (const program of AFFILIATE_PROGRAMS) {
      expect(program.disclosure.length).toBeGreaterThan(10);
      expect(program.hosts(EN).length).toBeGreaterThan(0);
    }
  });
});
