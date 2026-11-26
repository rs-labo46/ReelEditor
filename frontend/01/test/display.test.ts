import { describe, expect, it } from "vitest";
import { displaySeconds } from "../src/editor/display";
import { seconds, toUs } from "../src/editor/edit";

describe("タイムラインの秒数表示", () => {
  it("9.916667秒を9.9秒と表示する", () => {
    expect(displaySeconds(9_916_667)).toBe("9.9");
  });

  it("15秒は最大編集時間のまま15.0秒と表示する", () => {
    expect(displaySeconds(15_000_000)).toBe("15.0");
  });

  it("表示の丸めが編集の時間精度に影響しない", () => {
    expect(seconds(9_916_667)).toBe("9.916667");
    expect(toUs("9.916667")).toBe(9_916_667);
  });

  it("不正な負数や小数のマイクロ秒を拒否する", () => {
    expect(() => displaySeconds(-1)).toThrow();
    expect(() => displaySeconds(1.25)).toThrow();
  });
});
