import type { MediaInfo } from "../editor/types";

//FFmpegが読み込めるメモリ量やファイルの参照方法を制限する
export const inputOptions = [
  "-max_alloc",
  "67108864",
  "-protocol_whitelist",
  "file",
  "-f",
  "mov",
  "-enable_drefs",
  "0",
];

//不明なデータが、キーと値を持つオブジェクトか確認する
export function record(value: unknown): Record<string, unknown> {
  //null・配列・文字列・数値などは受け付けない
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("情報の形式を確認できません");

  //検証済みの値をオブジェクト型として返す
  return value as Record<string, unknown>;
}

//不明な値が指定した範囲内の安全な整数か確認する
export function integer(v: unknown, lo: number, hi: number): number {
  //数値以外・小数・範囲外の値を拒否する
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < lo || v > hi)
    throw new Error("数値の範囲を確認できません");

  //条件を満たした値を返す
  return v;
}

//動画の時刻を表す文字列をマイクロ秒の整数へ変換する
function micros(v: unknown): number {
  //数字以外や不正な小数形式の文字列を拒否する
  if (typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v))
    throw new Error("動画の時刻を読み取れません");

  //秒をマイクロ秒へ変換し、+-300秒の範囲か検証する
  return integer(Math.round(Number(v) * 1_000_000), -300_000_000, 300_000_000);
}

//"30/1"や"1:1"などの比率を分子と分母の配列へ変換する
function fraction(v: unknown, sep: string): [number, number] {
  //文字列以外の値は受け付けない
  if (typeof v !== "string") throw new Error("動画の比率を読み取れません");

  //指定した区切り文字で分子と分母に分ける
  const p = v.split(sep);

  //分子と分母が数字だけの2項目になっているか確認する
  if (p.length !== 2 || p.some((x) => !/^\d+$/.test(x)))
    throw new Error("動画の比率を読み取れません");

  //分子と分母を正の整数として検証して返す
  return [
    integer(Number(p[0]), 1, 2147483647),
    integer(Number(p[1]), 1, 2147483647),
  ];
}

//アプリで受け付けるMP4系のファイル識別子を登録する
const brands = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "iso7",
  "iso8",
  "iso9",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "MSNV",
  "dash",
  "cmfc",
  "cmfs",
]);

//FFprobeの解析結果を検証し、編集で使用するMediaInfoへ変換する
export function readProbe(value: unknown, sizeBytes: number): MediaInfo {
  //FFprobeが返したJSON全体をオブジェクトとして取得する
  const p = record(value);

  //動画ファイル全体の形式情報を取得する
  const format = record(p.format);

  //MP4の識別情報などが入ったtagsを取得する
  const tags = record(format.tags);

  //ファイルの識別子と形式情報がMP4として許可されているか確認する
  if (
    typeof tags.major_brand !== "string" ||
    !brands.has(tags.major_brand) ||
    typeof format.format_name !== "string" ||
    !format.format_name.split(",").includes("mp4")
  )
    throw new Error("MP4の実ファイルを選択してください");

  //動画ファイル全体の再生時間が1〜60秒か確認する
  integer(micros(format.duration), 1, 60_000_000);

  //映像1本と音声0〜1本に収まるトラック数か確認する
  if (!Array.isArray(p.streams) || p.streams.length < 1 || p.streams.length > 2)
    throw new Error("映像1本、音声0〜1本のMP4を選択してください");

  //FFprobeが返した映像・音声トラックの一覧を取得する
  const raw: unknown[] = p.streams;

  //各トラックが正しいオブジェクト形式か確認する
  const streams = raw.map(record);

  //映像トラックを取得する
  const v = streams.find((x) => x.codec_type === "video");

  //音声トラックが存在すれば取得する
  const a = streams.find((x) => x.codec_type === "audio");

  //映像はH.264、音声はAACまたは音声なしの構成か確認する
  if (
    !v ||
    v.codec_name !== "h264" ||
    streams.length !== (a ? 2 : 1) ||
    (a && a.codec_name !== "aac") ||
    (v.disposition && record(v.disposition).attached_pic === 1)
  )
    throw new Error(
      "映像H.264、音声AAC（または音声なし）のMP4を選択してください",
    );

  //動画の横幅を1〜1920ピクセルの範囲で取得する
  const width = integer(v.width, 1, 1920);

  //動画の縦幅を1〜1920ピクセルの範囲で取得する
  const height = integer(v.height, 1, 1920);

  //動画の短い辺が1080ピクセル以下か確認する
  if (Math.min(width, height) > 1080)
    throw new Error("短辺1080以下の動画を選択してください");

  //動画内部に記録された横幅を取得する
  const cw = integer(v.coded_width ?? 0, 0, 1920);

  //動画内部に記録された縦幅を取得する
  const ch = integer(v.coded_height ?? 0, 0, 1920);

  //内部の記録サイズも短辺1080ピクセル以下か確認する
  if (Math.min(cw, ch) > 1080)
    throw new Error("動画の記録サイズが上限を超えています");

  //対応外のピクセル形式やHDR関連の色の形式を拒否する
  if (
    (v.pix_fmt !== "yuv420p" && v.pix_fmt !== "yuvj420p") ||
    v.color_transfer === "smpte2084" ||
    v.color_transfer === "arib-std-b67" ||
    v.color_primaries === "bt2020"
  )
    throw new Error("この色形式の動画には対応していません");

  //平均フレームレートの分子と分母を取得する
  const [fpsNum, fpsDen] = fraction(v.avg_frame_rate, "/");

  //1秒あたりのフレーム数が平均30fps以下か確認する
  if (fpsNum > 30 * fpsDen)
    throw new Error("平均30fps以下の動画を選択してください");

  //映像トラックの時刻の計算単位が正しい比率形式か検証する
  fraction(v.time_base, "/");

  //ピクセルの横幅と縦幅の比率を取得し、省略時は1:1とする
  const [num, den] =
    v.sample_aspect_ratio === undefined ||
    v.sample_aspect_ratio === "" ||
    v.sample_aspect_ratio === "N/A"
      ? [1, 1]
      : fraction(v.sample_aspect_ratio, ":");

  //ピクセルの縦横比が8倍を超える極端な形でないか確認する
  if (num > 8 * den || den > 8 * num)
    throw new Error("この画素比には対応していません");

  //動画の回転角度を一時的に保持する
  let rotation: number | undefined;

  //映像トラックに回転情報が含まれているか確認する
  if (Array.isArray(v.side_data_list)) {
    //動画に付属する回転などの追加情報を取得する
    const raw: unknown[] = v.side_data_list;

    //追加情報を順番に確認する
    for (const d of raw.map(record)) {
      //回転情報以外は読み飛ばす
      if (d.side_data_type !== "Display Matrix") continue;

      //回転情報が複数あれば拒否する
      if (rotation !== undefined) throw new Error("動画の向きを確認できません");

      //回転角度を-360〜360度の整数として取得する
      rotation = integer(d.rotation, -360, 360);
    }
  }

  //別の場所に記録された回転角度も取得する
  const tag = v.tags ? record(v.tags).rotate : undefined;

  //タグに回転角度が存在する場合は形式と内容を確認する
  if (tag !== undefined) {
    //回転角度が整数を表す文字列か確認する
    if (typeof tag !== "string" || !/^-?\d+$/.test(tag))
      throw new Error("動画の向きを確認できません");

    //タグの回転角度を数値へ変換する
    const n = integer(Number(tag), -360, 360);

    //2種類の回転情報が存在する場合は整合性を確認する
    if (rotation !== undefined && (rotation - n) % 360 !== 0)
      throw new Error("動画の向きを確認できません");

    //検証済みの回転角度を保持する
    rotation = n;
  }

  //回転角度を0〜359度の範囲にそろえる
  rotation = (((rotation ?? 0) % 360) + 360) % 360;

  //0・90・180・270度以外の回転角度を拒否する
  if (rotation % 90 !== 0)
    throw new Error("この動画の回転角度には対応していません");

  //映像トラックの再生時間をマイクロ秒で取得する
  const durationUs = integer(micros(v.duration), 1, 60_000_000);

  //映像トラックの開始時刻をマイクロ秒で取得する
  const videoOriginUs = micros(v.start_time);

  //映像と音声の開始時刻のずれを保持する
  let audioOffsetUs: number | null = null;

  //音声チャンネルの構成を保持する
  let audioLayout = "";

  //音声が存在する場合だけ音声情報を検証する
  if (a) {
    //音声がモノラルまたはステレオか確認する
    if (
      !(
        (a.channels === 1 && a.channel_layout === "mono") ||
        (a.channels === 2 && a.channel_layout === "stereo")
      )
    )
      throw new Error("この音声配置には対応していません");

    //音声のチャンネル構成を文字列で保存する
    audioLayout = String(a.channel_layout);

    //音声トラックの時刻の計算単位を検証する
    fraction(a.time_base, "/");

    //音声と映像の開始時刻の差を計算する
    audioOffsetUs = micros(a.start_time) - videoOriginUs;
  }

  //検証済みの動画情報をMediaInfo型で返す
  return {
    durationUs,
    width,
    height,
    rotation,
    hasAudio: !!a,
    sizeBytes,
    fpsNum,
    fpsDen,
    videoOriginUs,
    audioOffsetUs,
    audioLayout,
    videoCodec: "h264",
    audioCodec: a ? "aac" : null,
    sampleAspectRatio: { num, den },
  };
}
