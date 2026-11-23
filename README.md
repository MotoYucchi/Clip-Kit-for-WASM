# WASM Clip Kit (Clip-Kit-for-WASM)

ブラウザ上の WebAssembly (`FFmpeg.wasm`) のみで完結する、PC・タブレット・スマホ対応の多機能動画加工ツールです。動画・音声ファイルは外部サーバーへ一切送信されず、すべてお使いの端末内で処理されます。

> **現在の実装状況: Phase 1 (MVP) 完了**
> Phase 2（多トラック音声・マイク録音・複数区間編集・2パス・用途別プリセット・HDR→SDR 等）および Phase 3（字幕・テロップ・ウォーターマーク・GIF/WEBP・一括処理等）へ順次拡張可能なアーキテクチャで構築しています。

---

## 主な機能（Phase 1: MVP）

- **幅広いフォーマット読込 & 詳細メタデータ表示**
  - MP4 / MOV (iPhone) / WebM / MKV / AVI / MPG / FLV / 3GP / M4V / TS / 音声ファイル等
  - 解像度、FPS（VFR 兆候）、コーデック、長さ、サイズ、音声トラック数、回転メタデータ、HDR/SDR を表示
  - iPhone 等の回転メタデータ付き動画をプレビューと出力で向きが一致するよう自動正規化
- **単一区間カット（タイムライン）**
  - タッチ対応の大きめトリムハンドル、フレーム送り (`-1f` / `+1f`)、現在時刻から開始/終了設定
  - **高速カット**（`-c copy` / 無劣化・キーフレーム単位）と **正確なカット**（再エンコード）を選択可能
- **形式・コーデック変換 & 容量圧縮**
  - 出力コンテナ: MP4 / WebM / MKV / MOV
  - 映像: H.264 / H.265 / VP9 / コピー（コンテナ非互換の組み合わせは自動補正＋通知）
  - 音声: AAC / MP3 / Opus / コピー
  - 圧縮プリセット（高画質 / 標準 / 小容量 / 最小容量）＋カスタム CRF スライダー＋**変換前の推定サイズ表示**
- **解像度 & 画面比率変更（3モード）**
  - 4K / 1080p / 720p / 480p / 360p / 任意倍率（25%〜400%）/ 幅×高さ指定（縦横比固定・bicubic / lanczos）
  - 16:9 / 9:16 / 1:1 / 4:3 / 21:9 / カスタム比率
  - **引き延ばし** / **レターボックス（任意色）** / **ブラー背景（強度・明るさ調整可）**
- **速度変更 & 逆再生**
  - 0.25x〜4x プリセット＆カスタム、`atempo` 多段連結によるピッチ維持、逆再生
- **回転・反転・クロップ**
  - 90°単位回転、左右・上下反転、任意範囲クロップ（プレビュー上に枠表示）
- **音声抽出 & ミュート**
  - MP3 / AAC (`.m4a`) / WAV / FLAC / Opus への抽出（複数音声トラック選択対応）
  - 全体ミュート / 指定区間ミュート / 特定トラック削除
- **静止画書き出し & プライバシー保護**
  - 現在フレームまたは指定時刻を PNG / JPEG で書き出し
  - メタデータ削除（GPS 位置情報・撮影機器情報など、デフォルト ON）
- **単一エンコード統合 & モバイル最適化**
  - 複数加工を1回の FFmpeg 実行へ統合
  - 端末性能自動検知（PC / タブレット / スマホ）と非対応機能の理由表示（`src/config/deviceLimits.ts` で一元管理）
  - 簡易モード（目的別ウィザード）と詳細モード切替、前後比較プレビュー、進捗・残り時間・キャンセル、Wake Lock API、中断復帰（設定自動保存）、iOS Web Share API 保存、PWA 対応

---

## ローカル開発・ビルド手順

```bash
# 1. 依存関係のインストール
npm install

# 2. FFmpeg WASM コアを public/vendor/ へ同期
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
`.github/workflows/deploy.yml` を同梱しています。リポジトリの **Settings → Pages → Source** を **GitHub Actions** に設定して `main` ブランチへ push するだけで自動ビルド＆公開されます。

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
