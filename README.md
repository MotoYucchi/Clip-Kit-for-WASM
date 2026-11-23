# WASM Clip Kit (Clip-Kit-for-WASM)

ブラウザ上の WebAssembly (`FFmpeg.wasm`) のみで完結する、PC・タブレット・スマホ対応の多機能動画加工ツールです。動画・音声ファイルは外部サーバーへ一切送信されず、すべてお使いの端末内で処理されます。

> **現在の実装状況: Phase 1〜3 全機能実装完了**
> 動画編集・多トラック音声・エフェクト・字幕・GIF/アニメWebP・一括処理・PWA オフラインキャッシュまでブラウザ完結で利用できます。

---

## 主な機能（Phase 1〜3）

- **幅広いフォーマット読込 & 詳細メタデータ表示**
  - MP4 / MOV (iPhone) / WebM / MKV / AVI / MPG / FLV / 3GP / M4V / TS / 音声ファイル等
  - 解像度、FPS（VFR 兆候）、コーデック、長さ、サイズ、音声トラック数、回転メタデータ、HDR/SDR を表示
  - iPhone 等の回転メタデータ付き動画をプレビューと出力で向きが一致するよう自動正規化
- **タイムライン編集（複数区間・分割・並べ替え・複数ファイル連結・波形表示）**
  - タッチ対応の大きめトリムハンドル、ズーム（1x〜6x）、Web Audio API 波形表示、フレーム送り (`-1f` / `+1f`)
  - 現在位置でのクリップ分割、複製、削除、並べ替え、別動画ファイルの追加連結（解像度・FPS・音声を自動統一）
  - **高速カット**（`-c copy`）と **正確なカット**（再エンコード）を選択可能
- **多トラック音声（BGM 追加・マイク録音・ミックス / 多音声トラック保持）**
  - 複数音声ファイルの追加、ブラウザからの直接マイク録音（MediaRecorder → FFmpeg 統一変換）
  - トラック別の音量・開始オフセット・トリム・フェードイン/アウト・ループ・波形位置合わせ
  - 元音声の扱い（残す / 置き換え / ミックス）、出力方式（1本ミックス / MP4・MKV 別トラック保持）、`loudnorm` 音量正規化
- **形式・コーデック変換・用途別プリセット・2パス圧縮・GIF / アニメ WebP**
  - 出力コンテナ: MP4 / WebM / MKV / MOV / **GIF アニメ（高品質パレット生成）** / **アニメ WebP（`libwebp_anim`）**
  - 映像: H.264 / H.265 / VP9 / コピー（コンテナ非互換の組み合わせは自動補正＋通知）
  - 音声: AAC / MP3 / Opus / コピー
  - 圧縮制御: 4段階プリセット / CRF スライダー / 映像ビットレート直接指定 / **目標サイズ指定（2パス）**
  - **用途別プリセット**: YouTube / TikTok / Instagram Reels・1:1 / X / **Discord (10MB / 25MB 制限)**（目標サイズからビットレート自動算出）＋変換前推定サイズ表示
- **解像度 & 画面比率変更（3モード）**
  - 4K / 1080p / 720p / 480p / 360p / 任意倍率（25%〜400%）/ 幅×高さ指定（縦横比固定・bicubic / lanczos）
  - 16:9 / 9:16 / 1:1 / 4:3 / 21:9 / カスタム比率
  - **引き延ばし** / **レターボックス（任意色）** / **ブラー背景（強度・明るさ調整可）**
- **映像エフェクト・合成・字幕・トランジション**
  - 映像フェードイン / アウト、色補正（明るさ・コントラスト・彩度、ライブプレビュー対応）
  - **テキスト（テロップ）焼き込み**（Canvas 透過 PNG レンダリングにより日本語・絵文字・複数行をフォント欠損なしで合成）
  - **画像オーバーレイ（ウォーターマーク）**（配置5種・サイズ・不透明度調整、ライブプレビュー対応）
  - **字幕（SRT / ASS）**: 保持 / 削除 / 外部字幕トラック埋め込み / 映像焼き込み（任意 `.ttf`/`.otf` フォント指定可）
  - **クリップ間トランジション**: クロスフェード / ディゾルブ / ワイプ / スライド（`xfade` + `acrossfade`）
- **速度変更・逆再生・フレームレート & 修復互換**
  - 0.25x〜4x プリセット＆カスタム（全体 / 選択クリップ対象）、`atempo` 多段連結ピッチ維持、逆再生
  - FPS 変更、**VFR → CFR 変換**（`-vsync cfr`）、**HDR → SDR トーンマッピング**（`zscale` + `tonemap=hable`）、**インターレース解除（`yadif`）**、**映像/音声ノイズ除去（`hqdn3d` / `afftdn`）**
- **一括処理・プロジェクト保存・PWA 完成・モバイル最適化**
  - **一括処理（Batch）**: 複数ファイルへ現在の加工設定を順次適用＋依存ゼロの UTF-8 ZIP 一括ダウンロード
  - 回転・反転・クロップ、MP3/AAC/WAV/FLAC/Opus 音声抽出、ミュート、PNG/JPEG 静止画書き出し、メタデータ削除
  - JSON 設定保存/読込、Undo/Redo、PC ショートカット、PWA インストール案内＆オフライン動作（アプリシェル + WASM コアキャッシュ）

---

## ローカル開発・ビルド手順

```bash
# 1. 依存関係のインストール
npm install

# 2. FFmpeg WASM コアを public/vendor/ へ同期（dev/build 時に自動実行されます）
npm run sync-vendor

# 3. 開発サーバー起動（COOP/COEP ヘッダー自動付与 → マルチスレッド動作確認可）
npm run dev

# 4. ユニットテスト実行
npm test

# 5. 本番ビルド（dist/ に静的サイト生成）
npm run build
```

---

## デプロイ手順 & COOP/COEP ヘッダー設定

### GitHub Pages（標準・自動デプロイ対応）
`.github/workflows/main.yml` を同梱しています。リポジトリの **Settings → Pages → Source** を **GitHub Actions** に設定して `main` ブランチへ push するだけで自動ビルド＆公開されます。

- GitHub Pages ではカスタム HTTP ヘッダー（COOP/COEP）が設定できないため、自動的に **シングルスレッド版（`@ffmpeg/core`）** へフォールバックして安定動作します。

### Cloudflare Pages / Netlify（マルチスレッド高速化対応）
`public/_headers` を同梱しているため、Cloudflare Pages 等へ `dist/` をデプロイすると以下のヘッダーが自動適用され、`SharedArrayBuffer` 経由で **マルチスレッド版（`@ffmpeg/core-mt`）** が自動有効化されます。

```text
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: cross-origin
```

---

## デバイス別の目安制限（`src/config/deviceLimits.ts`）

| 区分 | 保証内容 | 警告目安 / 推奨上限 | 制限・注意事項 |
| --- | --- | --- | --- |
| **PC** | 全機能 | 1.5GB 警告 / 4GB 目安 | 4K まで対応（メモリ 4GB 以下端末は警告） |
| **タブレット** | 全機能（重い処理は警告付き） | 500MB 警告 / 1GB 目安 | 1080p 推奨 |
| **スマホ** | 基本機能を実用レベルで保証 | 200MB 警告 / 500MB 目安 | 4K・2パス・H.265・AV1 は非対応理由を表示 |

---

## 関連ドキュメント

- 機能ごとの FFmpeg コマンド一覧: [docs/ffmpeg-commands.md](docs/ffmpeg-commands.md)
- 実機検証チェックリスト: [docs/device-test-checklist.md](docs/device-test-checklist.md)

---

## ライセンス・使用ライブラリ

本プロジェクトのソースコードは [MIT License](LICENSE) のもとで公開されています。また、以下のオープンソースライブラリ・フォントを利用しています（詳細は [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) およびサイト内の [licenses.html](licenses.html) をご参照ください）。

| コンポーネント | バージョン | ライセンス | 用途 |
| --- | --- | --- | --- |
| `@ffmpeg/ffmpeg` | `0.12.15` | MIT | FFmpeg WASM ワーカー制御 |
| `@ffmpeg/util` | `0.12.2` | MIT | メディア読込・Blob URL ユーティリティ |
| `@ffmpeg/core` / `@ffmpeg/core-mt` (FFmpeg) | `0.12.10` | GPL-2.0-or-later | 動画・音声・静止画処理 WASM コア |
| `react` / `react-dom` | `18.3.1` | MIT | UI レンダリング |
| `zustand` | `5.0.3` | MIT | 状態管理ストア |
| Google Fonts (`Inter`, `Noto Sans JP`, `JetBrains Mono`) | - | SIL OFL 1.1 | UI / 等幅フォント |
| `vite` / `@vitejs/plugin-react` / `vitest` / `typescript` | `6.x` / `4.x` / `3.x` / `5.7.x` | MIT / Apache-2.0 | ビルド・型検査・テストツール |
