# Third-Party Licenses & Attributions

本プロジェクト（WASM Clip Kit / Clip-Kit-for-WASM）では、以下のオープンソースライブラリ、WebAssembly バイナリ、フォント、およびビルドツールを利用しています。

## 1. @ffmpeg/ffmpeg
- **Version**: `0.12.15`
- **License**: MIT License
- **Repository**: https://github.com/ffmpegwasm/ffmpeg.wasm
- **Usage**: ブラウザ上で FFmpeg WebAssembly ワーカーを制御する JavaScript ラッパー

## 2. @ffmpeg/util
- **Version**: `0.12.2`
- **License**: MIT License
- **Repository**: https://github.com/ffmpegwasm/ffmpeg.wasm
- **Usage**: メディアデータの読み込み・Blob URL 変換ユーティリティ

## 3. @ffmpeg/core / @ffmpeg/core-mt (FFmpeg WebAssembly Core)
- **Version**: `0.12.10`
- **License**: GNU General Public License v2.0 or later (`GPL-2.0-or-later`)
- **Repository**: https://github.com/ffmpegwasm/ffmpeg.wasm-core / https://ffmpeg.org/
- **Usage**: 動画・音声のデコード、フィルタ処理、エンコード、静止画書き出しを行う WebAssembly バイナリ（`public/vendor/ffmpeg-core/` / COOP+COEP 環境では `@ffmpeg/core-mt` を自動利用）
- **Included Codecs & Libraries**:
  - `libx264` (GPL-2.0-or-later)
  - `libx265` (GPL-2.0-or-later)
  - `libvpx` / `libvpx-vp9` (BSD-3-Clause)
  - `libmp3lame` (LGPL-2.0-or-later)
  - `libtheora` (BSD-3-Clause)
  - `libvorbis` (BSD-3-Clause)
  - `libopus` (BSD-3-Clause)
  - `libwebp` (BSD-3-Clause)
  - `libfreetype` (FTL / GPL-2.0-or-later)
  - `libfribidi` (LGPL-2.1-or-later)
  - `libass` (ISC)
  - `libzimg` (WTFPL)
  - `zlib` (Zlib)
  - FFmpeg 内蔵コーデック: `aac`, `flac`, `pcm_*`, `png`, `mjpeg`, `gif` 等

## 4. React & React DOM
- **Version**: `18.3.1`
- **License**: MIT License
- **Repository**: https://github.com/facebook/react
- **Usage**: レスポンシブ UI コンポーネントのレンダリング

## 5. Zustand
- **Version**: `5.0.3`
- **License**: MIT License
- **Repository**: https://github.com/pmndrs/zustand
- **Usage**: 編集設定・タイムライン・再生・ジョブ進捗の状態管理ストア

## 6. Google Fonts (Inter / Noto Sans JP / JetBrains Mono)
- **License**: SIL Open Font License 1.1 (`OFL-1.1`)
- **Source**: https://fonts.google.com/
- **Usage**: UI および等幅タイムコード／コマンド表示フォント

## 7. Build & Development Tooling（ビルド・型検査・テスト時のみ利用）
- **Vite** (`6.x`) — MIT License (https://github.com/vitejs/vite)
- **@vitejs/plugin-react** (`4.x`) — MIT License (https://github.com/vitejs/vite-plugin-react)
- **TypeScript** (`5.7.x`) — Apache License 2.0 (https://github.com/microsoft/TypeScript)
- **Vitest** (`3.x`) — MIT License (https://github.com/vitest-dev/vitest)
- **@types/react / @types/react-dom** — MIT License (https://github.com/DefinitelyTyped/DefinitelyTyped)
