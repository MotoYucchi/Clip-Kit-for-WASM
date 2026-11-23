# 機能ごとの FFmpeg コマンド一覧（Phase 1: MVP）

WASM Clip Kit では、ユーザーが選択した複数加工を `src/engine/filterGraphBuilder.ts` および `src/engine/commandBuilder.ts` によって **1回のエンコードコマンド** に自動統合して実行します。

## 1. 高速カット（無劣化・キーフレーム単位）
```bash
ffmpeg -ss 5.000 -to 20.000 -i input.mp4 \
  -map 0:v:0 -map 0:a:0? \
  -c:v copy -c:a copy \
  -movflags +faststart -map_metadata -1 -map_chapters -1 \
  -y output.mp4
```

## 2. 正確なカット + 圧縮プリセット（標準 CRF 23 / H.264 + AAC）
```bash
ffmpeg -i input.mp4 -ss 5.000 -to 20.000 \
  -map 0:v:0 -map 0:a:0? \
  -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  -movflags +faststart -map_metadata -1 -map_chapters -1 \
  -y output.mp4
```

## 3. 解像度変更（720p・Lanczos 拡大/縮小）
```bash
ffmpeg -i input.mp4 \
  -map 0:v:0 -map 0:a:0? \
  -vf "scale=1280:720:flags=lanczos" \
  -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  -movflags +faststart -map_metadata -1 -y output.mp4
```

## 4. 画面比率変更（3モード）

### 4-1. 引き延ばし（例: 16:9）
```bash
-vf "scale=1920:1080:flags=lanczos,setsar=1"
```

### 4-2. レターボックス（任意色余白）
```bash
-vf "scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x000000,setsar=1"
```

### 4-3. ブラー背景（`split -> scale+crop+boxblur -> overlay`）
```bash
-filter_complex "[0:v]split=2[bg_src][fg_src];[bg_src]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,boxblur=18:2,eq=brightness=-0.12:saturation=0.92[bg];[fg_src]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[vout]" -map "[vout]"
```

## 5. 速度変更（ピッチ維持 `atempo` 多段化）& 逆再生
- 0.25倍速:
  ```bash
  -vf "setpts=4.00000*PTS" -af "atempo=0.5,atempo=0.5"
  ```
- 4倍速:
  ```bash
  -vf "setpts=0.25000*PTS" -af "atempo=2.0,atempo=2.0"
  ```
- 逆再生:
  ```bash
  -vf "reverse" -af "areverse"
  ```

## 6. 回転・反転・クロップ（iPhone 回転メタデータ正規化含む）
```bash
-vf "crop=trunc(iw*0.8/2)*2:trunc(ih*0.8/2)*2:trunc(iw*0.1):trunc(ih*0.1),transpose=1,hflip" \
-metadata:s:v:0 rotate=0
```

## 7. 音声抽出（トラック指定・MP3 / AAC / WAV / FLAC / Opus）
```bash
ffmpeg -i input.mkv -vn -map 0:a:0 -c:a libmp3lame -b:a 192k -map_metadata -1 -y extracted.mp3
ffmpeg -i input.mkv -vn -map 0:a:1 -c:a flac -map_metadata -1 -y extracted.flac
```

## 8. ミュート（全体 / 指定区間 / 特定トラック削除）
- 全体ミュート: `-an`
- 区間ミュート（3.0秒〜8.5秒）: `-af "volume=enable='between(t,3.000,8.500)':volume=0"`
- 特定トラック削除: 残すトラックのみ `-map 0:a:0` 等で明示マップ

## 9. 静止画書き出し（PNG / JPEG）
```bash
ffmpeg -ss 12.500 -i input.mp4 -frames:v 1 -map_metadata -1 -y snapshot.png
ffmpeg -ss 12.500 -i input.mp4 -frames:v 1 -q:v 2 -map_metadata -1 -y snapshot.jpg
```
