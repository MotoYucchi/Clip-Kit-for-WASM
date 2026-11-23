/**
 * Web Audio API を用いて音声/動画ファイルから正規化済み波形ピーク配列 (0..1) を生成する。
 * メモリ安全のため、ファイルが大きすぎる場合やブラウザ非対応コーデック時は空配列へ安全にフォールバックする。
 */
export async function extractWaveformPeaks(
  file: File,
  barCount = 120,
  maxBytes = 80 * 1024 * 1024
): Promise<{ peaks: number[]; durationSec: number | null }> {
  if (typeof window === 'undefined' || file.size > maxBytes) {
    return { peaks: [], durationSec: null };
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return { peaks: [], durationSec: null };
  }

  const ctx = new AudioCtx();
  try {
    const buffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    if (totalSamples === 0) {
      return { peaks: [], durationSec: audioBuffer.duration || null };
    }

    const blockSize = Math.max(1, Math.floor(totalSamples / barCount));
    const rawPeaks: number[] = [];
    let maxVal = 0.001;

    for (let i = 0; i < barCount; i++) {
      const start = i * blockSize;
      const end = Math.min(totalSamples, start + blockSize);
      let peak = 0;
      // Sample stride for fast decoding on long audio
      const stride = Math.max(1, Math.floor((end - start) / 128));
      for (let j = start; j < end; j += stride) {
        const abs = Math.abs(channelData[j]);
        if (abs > peak) peak = abs;
      }
      rawPeaks.push(peak);
      if (peak > maxVal) maxVal = peak;
    }

    const peaks = rawPeaks.map((p) => Number((p / maxVal).toFixed(3)));
    return { peaks, durationSec: audioBuffer.duration || null };
  } catch {
    return { peaks: [], durationSec: null };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
