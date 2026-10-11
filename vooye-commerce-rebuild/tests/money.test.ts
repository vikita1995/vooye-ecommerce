import {describe,it,expect} from "vitest";
import {rupees} from "@/lib/money";
describe("rupees",()=>{it("formats paise as Indian rupees",()=>{expect(rupees(649900)).toContain("6,499")});it("handles zero",()=>{expect(rupees(0)).toContain("0")})});
