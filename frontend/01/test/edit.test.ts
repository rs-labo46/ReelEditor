// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  EMPTY,
  addClip,
  addSource,
  checkEdit,
  cropRect,
  moveClip,
  removeClip,
  seconds,
  splitClip,
  toUs,
  trimClip,
} from "../src/editor/edit";
import type { EditState, LocalSource, MediaInfo } from "../src/editor/types";

const info: MediaInfo = {
  durationUs: 10_000_000,
  width: 720,
  height: 1280,
  rotation: 0,
  hasAudio: true,
  sizeBytes: 5,
  fpsNum: 30,
  fpsDen: 1,
  videoOriginUs: 0,
  audioOffsetUs: 0,
  audioLayout: "stereo",
  videoCodec: "h264",
  audioCodec: "aac",
  sampleAspectRatio: { num: 1, den: 1 },
};
function source(): LocalSource {
  return {
    localId: "source-1",
    file: new File(["video"], "test.mp4", { type: "video/mp4" }),
    url: "blob:test",
    info: { ...info },
  };
}
function prepared(): EditState {
  const s = addSource(EMPTY, source());
  return addClip(s, "source-1", "clip-1");
}

describe("editor/edit", () => {
  it("元動画とクリップを追加し、元Stateを変更しない", () => {
    const s = prepared();
    expect(s.sources).toHaveLength(1);
    expect(s.clips).toHaveLength(1);
    expect(s.revision).toBe(2);
    expect(EMPTY.sources).toHaveLength(0);
  });
  it("10秒の動画を4秒で分割する", () => {
    const s = prepared();
    const next = splitClip(s, "clip-1", 4_000_000, "clip-2");
    expect(next.clips).toHaveLength(2);
    expect(next.clips[0]).toMatchObject({ startUs: 0, endUs: 4_000_000 });
    expect(next.clips[1]).toMatchObject({
      startUs: 4_000_000,
      endUs: 10_000_000,
    });
    expect(s.clips).toHaveLength(1);
  });
  it("分割は開始・終了点や同じIDを拒否する", () => {
    const s = prepared();
    expect(() => splitClip(s, "clip-1", 0, "clip-2")).toThrow();
    expect(() => splitClip(s, "clip-1", 10_000_000, "clip-2")).toThrow();
    expect(() => splitClip(s, "clip-1", 2_000_000, "clip-1")).toThrow();
  });
  it("切り出し・削除・並べ替えが正しい", () => {
    const s = prepared();
    const split = splitClip(s, "clip-1", 4_000_000, "clip-2");
    const trimmed = trimClip(split, "clip-2", 5_000_000, 9_000_000);
    expect(trimmed.clips[1].startUs).toBe(5_000_000);
    const moved = moveClip(trimmed, "clip-2", 0);
    expect(moved.clips.map((c) => c.id)).toEqual(["clip-2", "clip-1"]);
    const removed = removeClip(moved, "clip-1");
    expect(removed.clips.map((c) => c.id)).toEqual(["clip-2"]);
    checkEdit(removed, false);
  });
  it("15秒を超える合計時間を拒否する", () => {
    const s = prepared();
    const second = addClip(s, "source-1", "clip-2");
    expect(() => checkEdit(second, false)).toThrow("1〜15秒");
  });
  it("再生時間が不正な元動画はクリップにできない", () => {
    const src = source();
    src.info.durationUs = 0;
    const s = addSource(EMPTY, src);
    expect(() => addClip(s, src.localId, "clip-1")).toThrow("再生時間");
  });
  it("時刻変換と不正値の拒否", () => {
    expect(seconds(1_250_000)).toBe("1.25");
    expect(toUs("1.25")).toBe(1_250_000);
    expect(() => seconds(Number.NaN)).toThrow();
    expect(() => toUs("-1")).toThrow();
  });
  it("9:16計算は有効な値を返し、不正なメタデータを拒否する", () => {
    expect(cropRect(720, 1280, 0, 1, 5000, 5000)).toMatchObject({
      fullW: 720,
      fullH: 1280,
      x: 0,
      y: 0,
    });
    expect(() => cropRect(0, 1280, 0, 1, 5000, 5000)).toThrow();
    expect(() => cropRect(720, 1280, 0, 0, 5000, 5000)).toThrow();
    expect(() => cropRect(720, 1280, 0, 1, 10001, 5000)).toThrow();
  });
});
