import { describe, expect, it } from "vitest";
import { parsePositiveInt, rupees } from "../lib/money";
describe("money helpers",()=>{it("formats paise as INR",()=>expect(rupees(849900)).toContain("8,499"));it("accepts bounded positive quantity",()=>expect(parsePositiveInt(2)).toBe(2));it("rejects invalid quantity",()=>expect(()=>parsePositiveInt(0)).toThrow());});
