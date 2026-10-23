import { describe, expect, it } from "vitest"
import {
  findEnglishCategoryMatches,
  parseTransactionFilters,
} from "@/lib/transaction-filters"

describe("transaction filter inputs", () => {
  it("accepts an inclusive period and a destination account filter", () => {
    expect(
      parseTransactionFilters(
        new URLSearchParams(
          "type=transfer&account=2&from=2026-10-01&to=2026-10-31&search=rent",
        ),
      ),
    ).toEqual({
      search: "rent",
      category: "",
      subcategory: "",
      type: "transfer",
      accountId: 2,
      from: "2026-10-01",
      to: "2026-10-31",
      groupName: null,
      ungrouped: false,
    })
  })
  it("rejects a reversed range instead of silently showing no records", () => {
    expect(
      parseTransactionFilters(
        new URLSearchParams("from=2026-10-31&to=2026-10-01"),
      ),
    ).toBeNull()
  })
  it.each(["from=2026-02-30", "type=unknown", "account=-1", "account=1.5"])(
    "rejects invalid filters: %s",
    (query) => {
      expect(parseTransactionFilters(new URLSearchParams(query))).toBeNull()
    },
  )
  it("searches all records when filters are cleared", () => {
    expect(parseTransactionFilters(new URLSearchParams())).toEqual({
      search: "",
      category: "",
      subcategory: "",
      type: "all",
      accountId: null,
      from: "",
      to: "",
      groupName: null,
      ungrouped: false,
    })
  })
  it("filters an exact group name, including names matching UI options", () => {
    expect(parseTransactionFilters(new URLSearchParams("group=all")))
      .toMatchObject({ groupName: "all", ungrouped: false })
    expect(parseTransactionFilters(new URLSearchParams("ungrouped=true")))
      .toMatchObject({ groupName: null, ungrouped: true })
  })
  it.each(["group=Trip&ungrouped=true", "ungrouped=yes", "group=" + "x".repeat(101)])(
    "rejects ambiguous or invalid group filters: %s", (query) => {
      expect(parseTransactionFilters(new URLSearchParams(query))).toBeNull()
    },
  )
  it("matches English category labels without rewriting stored categories", () => {
    expect(findEnglishCategoryMatches(" FOOD ")).toEqual(["Makanan"])
    expect(findEnglishCategoryMatches("bill")).toEqual(["Tagihan"])
    expect(findEnglishCategoryMatches("")).toEqual([])
    expect(findEnglishCategoryMatches("custom note")).toEqual([])
    expect(findEnglishCategoryMatches("coffee")).toEqual(["Kopi"])
    expect(findEnglishCategoryMatches("drinks")).toEqual(["Minuman"])
  })
  it("keeps exact category and subcategory filters and rejects unscoped subcategories", () => {
    expect(parseTransactionFilters(new URLSearchParams("category=Minuman&subcategory=Kopi")))
      .toMatchObject({ category: "Minuman", subcategory: "Kopi" })
    expect(parseTransactionFilters(new URLSearchParams("subcategory=Kopi"))).toBeNull()
    expect(parseTransactionFilters(new URLSearchParams({ category: "x".repeat(121) }))).toBeNull()
  })
})
