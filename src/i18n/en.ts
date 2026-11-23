import type { TranslationKey } from './ja';

export const en: Record<TranslationKey, string> = {
  // Brand & Header
  'brand.title': 'WASM Clip Kit',
  'brand.subtitle': '100% Client-Side Video Processing Studio',
  'brand.licensesTitle': 'Licenses & Usage Notices',
  'header.clientOnly': '100% Local · No Upload',
  'header.modeSimple': 'Simple',
  'header.modeAdvanced': 'Advanced',
  'header.themeDark': 'Dark',
  'header.themeLight': 'Light',
  'header.backToApp': 'Back to Clip Kit',
  'header.resetConfig': 'Reset Settings',
  'header.changeFile': 'Open Another File',

  // WASM Status
  'wasm.idle': 'WASM Idle',
  'wasm.loading': 'Loading WASM...',
  'wasm.ready': 'WASM Ready',
  'wasm.running': 'Processing...',
  'wasm.error': 'WASM Error',
  'wasm.modeMt': 'Multi-Thread',
  'wasm.modeSt': 'Single-Thread',

  // Device tiers & warnings
  'device.pc': 'PC',
  'device.tablet': 'Tablet',
  'device.mobile': 'Mobile',
  'device.warnLargeFile': 'This file ({size}) exceeds the recommended size ({limit} MB) for {tier}. Lower the resolution or trim shorter segments if memory runs low.',
  'device.warnLongDuration': 'Duration exceeds the recommended guideline ({mins} min) for {tier}. Processing may take a while.',
  'device.warnHevcPreview': 'This browser cannot directly preview HEVC/this codec, but FFmpeg.wasm can still decode and convert it to H.264.',
  'device.warnHdr': 'HDR video detected. Colors may appear washed out on SDR displays (HDR→SDR tone mapping arrives in Phase 2).',
  'device.warnVfr': 'Variable Frame Rate (VFR) suspected (common on smartphone videos). Re-encode in Advanced mode if audio sync drifts.',
  'device.warnRotated': 'Rotation metadata ({deg}°) detected. Output orientation is automatically normalized to match preview.',

  // Capabilities
  'cap.av1NotInCore': 'AV1 encoding is currently unavailable in the bundled standard FFmpeg.wasm core',
  'cap.mobileNo4k': '4K export is disabled on mobile devices to prevent out-of-memory crashes (1080p or lower recommended)',
  'cap.mobileNoTwoPass': '2-pass encoding is disabled on mobile devices due to memory and CPU limits',
  'cap.mobileNoH265': 'H.265 encoding is disabled on mobile devices due to high CPU/memory usage (please use H.264)',
  'cap.mobileNoHeavyAudio': 'Heavy multi-track audio mixing is disabled on mobile devices',
  'cap.deviceNotSupported': 'Unavailable on this device due to browser or memory limitations',
  'cap.lowMemoryWarn': 'Device memory (~{mem}GB) is limited; heavy jobs may crash the browser tab',
  'cap.warn4kHeavy': '4K export requires substantial processing time and memory',
  'cap.warnH265Slow': 'H.265 encoding in WASM is significantly slower than H.264',
  'cap.warnBlurHeavy': 'Blur background is compute-intensive and may be slow on mobile for long videos',
  'cap.warnReverseMemory': 'Reverse buffers the entire range in memory; keep clips short (under ~{sec}s)',
  'cap.heavyProcessWarn': 'This operation is heavy on device resources',

  // Dropzone
  'drop.title': 'Drop a video or audio file here, or select',
  'drop.subtitle': 'Supports MP4, MOV (iPhone), WebM, MKV, AVI, MPG, FLV, 3GP, TS, and audio files',
  'drop.privacyNote': 'Files never leave your device — all processing runs locally via FFmpeg.wasm',
  'drop.selectBtn': 'Select File / Photo Library',
  'drop.supportedNote': 'Optimized for PC, Tablet, and Mobile (essential editing tools guaranteed on smartphones)',

  // Recovery Banner
  'recovery.message': 'Previous editing settings ({fileName}) were found. Restore them?',
  'recovery.restore': 'Restore',
  'recovery.dismiss': 'Dismiss',

  // Metadata Bar
  'meta.resolution': 'Resolution',
  'meta.fps': 'FPS',
  'meta.codec': 'Codec',
  'meta.duration': 'Duration',
  'meta.size': 'Size',
  'meta.audioTracks': 'Audio Tracks',
  'meta.rotation': 'Rotation',
  'meta.hdr': 'HDR',
  'meta.sdr': 'SDR',
  'meta.probing': 'Analyzing...',
  'meta.audioOnly': 'Audio Only',
  'meta.tracksUnit': '{count} track(s)',

  // Preview & Compare
  'preview.original': 'Before',
  'preview.output': 'After',
  'preview.compare': 'Compare',
  'preview.play': 'Play',
  'preview.pause': 'Pause',
  'preview.prevFrame': 'Previous Frame',
  'preview.nextFrame': 'Next Frame',
  'preview.setStart': 'Set In',
  'preview.setEnd': 'Set Out',
  'preview.setSnapshot': 'Use for Snapshot',
  'preview.noVideoPreview': 'Browser preview unavailable for this codec, but FFmpeg.wasm can still convert it',

  // Timeline
  'timeline.title': 'Timeline (Single-Range Trim)',
  'timeline.enableTrim': 'Enable Trim / Cut',
  'timeline.start': 'Start',
  'timeline.end': 'End',
  'timeline.selectedDuration': 'Selected',
  'timeline.cutMode': 'Cut Mode',
  'timeline.cutFast': 'Fast Cut (Stream Copy)',
  'timeline.cutFastHint': 'Instant keyframe-level cut without re-encoding (when no other filters are active)',
  'timeline.cutAccurate': 'Accurate Cut (Re-encode)',
  'timeline.cutAccurateHint': 'Frame-accurate cut combined into a single encode pass',

  // Quick Wizard
  'wizard.title': 'Choose What You Want to Do (Simple Mode)',
  'wizard.subtitle': 'Apply recommended presets in one tap. Switch to Advanced mode anytime for full control.',
  'wizard.compress': 'Compress File Size',
  'wizard.compressDesc': 'Shrink file size while keeping quality',
  'wizard.trim': 'Trim / Cut Video',
  'wizard.trimDesc': 'Select start and end points',
  'wizard.aspect': 'Change Aspect Ratio',
  'wizard.aspectDesc': '9:16 vertical, 1:1 square, blur background',
  'wizard.resize': 'Change Resolution',
  'wizard.resizeDesc': 'Resize to 1080p, 720p, 480p, etc.',
  'wizard.speed': 'Speed / Reverse',
  'wizard.speedDesc': '0.5x–4x speed change or reverse playback',
  'wizard.rotate': 'Rotate / Flip / Crop',
  'wizard.rotateDesc': '90° rotation, mirror flip, custom crop',
  'wizard.extractAudio': 'Extract Audio',
  'wizard.extractAudioDesc': 'Export as MP3, AAC, WAV, FLAC, or Opus',
  'wizard.mute': 'Mute Audio',
  'wizard.muteDesc': 'Remove all audio or mute a specific range',
  'wizard.snapshot': 'Export Frame Snapshot',
  'wizard.snapshotDesc': 'Save current frame as PNG or JPEG',

  // Tabs
  'tab.output': 'Format & Compress',
  'tab.trim': 'Trim',
  'tab.resize': 'Resize & Ratio',
  'tab.speed': 'Speed',
  'tab.transform': 'Rotate & Crop',
  'tab.audio': 'Audio & Mute',
  'tab.snapshot': 'Snapshot',

  // Output & Compression
  'output.taskType': 'Export Task',
  'output.taskVideo': 'Export Video',
  'output.taskAudio': 'Extract Audio',
  'output.taskSnapshot': 'Export Still Frame',
  'output.container': 'Output Container',
  'output.videoCodec': 'Video Codec',
  'output.audioCodec': 'Audio Codec',
  'output.codecCopy': 'Copy (No Re-encode)',
  'output.compression': 'Compression Preset',
  'compress.high': 'High Quality',
  'compress.highDesc': 'Minimal quality loss (~CRF 19)',
  'compress.standard': 'Standard',
  'compress.standardDesc': 'Balanced quality & size (~CRF 23)',
  'compress.small': 'Small Size',
  'compress.smallDesc': 'Compact for sharing (~CRF 28)',
  'compress.minimal': 'Minimum Size',
  'compress.minimalDesc': 'Maximum compression (~CRF 33)',
  'output.customCrf': 'Manual CRF Control',
  'output.crfHint': 'Lower value = higher quality & larger size (typical: 18–32)',
  'output.audioBitrate': 'Audio Bitrate',
  'output.stripMetadata': 'Strip Metadata (GPS location, camera model, etc.)',
  'output.stripMetadataHint': 'Enabled by default for privacy',

  // Compatibility warnings
  'compat.videoAutoAdjusted': 'Incompatible video codec was automatically adjusted for this container',
  'compat.audioAutoAdjusted': 'Incompatible audio codec was automatically adjusted for this container',
  'compat.copyOverriddenByFilter': 'Video codec switched to re-encode because visual filters are active',

  // Resize & Aspect
  'resize.heading': 'Resolution',
  'resize.preset': 'Resolution Preset',
  'resize.original': 'Original',
  'resize.scaleOption': 'Scale Percentage (%)',
  'resize.customOption': 'Custom Width × Height',
  'resize.scalePercent': 'Scale (25%–400%)',
  'resize.width': 'Width (px)',
  'resize.height': 'Height (px)',
  'resize.keepAspect': 'Lock Aspect Ratio',
  'resize.algorithm': 'Scaling Algorithm',
  'resize.resultSize': 'Target Output Resolution',

  'aspect.heading': 'Aspect Ratio',
  'aspect.preset': 'Target Aspect Ratio',
  'aspect.original': 'Original',
  'aspect.custom': 'Custom Ratio',
  'aspect.mode': 'Fit Mode (3 Modes)',
  'aspect.modeStretch': 'Stretch',
  'aspect.modeLetterbox': 'Letterbox (Solid Padding)',
  'aspect.modeBlur': 'Blur Background',
  'aspect.letterboxColor': 'Padding Color',
  'aspect.blurStrength': 'Blur Strength',
  'aspect.blurBrightness': 'Background Brightness',
  'aspect.blurDarker': 'Darker',
  'aspect.blurNormal': 'Original',

  // Speed
  'speed.heading': 'Playback Speed & Reverse',
  'speed.presets': 'Speed Presets',
  'speed.custom': 'Custom Speed (0.25x–4.0x)',
  'speed.pitchNote': 'Audio pitch is preserved automatically via chained atempo filters.',
  'speed.reverse': 'Enable Reverse Playback',
  'speed.reverseHint': 'Reverses video and audio. Keep ranges short to conserve memory.',

  // Transform
  'transform.heading': 'Rotate, Flip & Crop',
  'transform.rotation': 'Rotation (Clockwise)',
  'transform.flipH': 'Flip Horizontal',
  'transform.flipV': 'Flip Vertical',
  'transform.cropEnable': 'Enable Custom Crop',
  'transform.cropX': 'Left (%)',
  'transform.cropY': 'Top (%)',
  'transform.cropW': 'Width (%)',
  'transform.cropH': 'Height (%)',
  'transform.cropReset': 'Reset Crop',

  // Audio & Mute
  'audio.muteHeading': 'Mute & Audio Tracks',
  'audio.muteNone': 'Keep Audio',
  'audio.muteAll': 'Mute All (Remove Audio)',
  'audio.muteRange': 'Mute Selected Time Range',
  'audio.muteRemoveTrack': 'Remove Specific Track(s)',
  'audio.rangeStart': 'Mute Start (sec)',
  'audio.rangeEnd': 'Mute End (sec)',
  'audio.noMultiTrack': 'Input file has only a single audio track.',
  'audio.extractHeading': 'Audio Extraction Mode',
  'audio.extractSwitch': 'Switch to Audio Extraction',
  'audio.extractFormat': 'Output Audio Format',
  'audio.extractTrack': 'Source Audio Track',
  'audio.extractBitrate': 'Bitrate',

  // Snapshot
  'snapshot.heading': 'Still Frame Export',
  'snapshot.switch': 'Switch to Snapshot Mode',
  'snapshot.format': 'Image Format',
  'snapshot.time': 'Capture Time (sec)',
  'snapshot.useCurrent': 'Use Current Preview Time',
  'snapshot.jpegQuality': 'JPEG Quality (lower = higher quality)',

  // Export CTA & Estimate
  'export.estimatedSize': 'Estimated Output Size',
  'export.singlePass': 'Combined into a single encode pass',
  'export.fastCopy': 'Lossless stream copy (fast)',
  'export.runBtn': 'Process Video',
  'export.runAudioBtn': 'Extract Audio',
  'export.runSnapshotBtn': 'Export Snapshot',
  'export.showCommand': 'Show FFmpeg Command',
  'export.resultReady': 'Export Complete',
  'export.saveBtn': 'Save File',
  'export.shareBtn': 'Share / Save to Photos',
  'export.downloadBtn': 'Download',
  'export.elapsed': 'Elapsed: {sec}s',

  // Progress Modal
  'progress.title': 'Processing locally on your device...',
  'progress.loadingWasm': 'Loading FFmpeg.wasm engine (~31MB on first run)...',
  'progress.keepOpen': 'Please keep this screen open and awake during processing',
  'progress.wakeLockOn': 'Screen Wake Lock active',
  'progress.eta': 'About {eta} remaining',
  'progress.etaCalculating': 'Estimating remaining time...',
  'progress.cancel': 'Cancel',
  'progress.logsToggle': 'Show FFmpeg Logs',

  // Notice & Footer
  'notice.badge': 'No Tracking',
  'notice.text':
    'Zero video/audio uploads and zero analytics cookies (local storage is used only for language and session recovery). Roughly 31MB of WASM engine loads on first use, and all processing runs on your device CPU/memory.',
  'notice.link': 'Details & Licenses →',
  'footer.privacy': '100% Client-Side / No Analytics Cookies',
  'footer.licenses': 'Licenses & Notices',

  // Licenses Page
  'licenses.privacyHeading': 'Privacy & Storage Policy',
  'licenses.privacy1':
    '<strong>Zero Tracking Cookies</strong>: This site uses no analytics, advertising, or user-tracking cookies or web beacons.',
  'licenses.privacy2':
    '<strong>Functional Browser Storage</strong>: Browser <code>localStorage</code> is used solely to remember your display language, theme, and session-recovery preferences. Nothing is transmitted externally.',
  'licenses.privacy3':
    '<strong>100% Client-Side Processing</strong>: Selected video/audio files, snapshots, and converted outputs are never uploaded to or stored on any external server.',
  'licenses.privacy4':
    '<strong>Automatic Cleanup</strong>: Media buffers exist only in temporary browser memory (Blob URLs / WebAssembly virtual FS) and are cleared after processing or when closing the tab.',
  'licenses.noticeHeading': 'WASM Processing & Device Notices',
  'licenses.notice1':
    '<strong>Initial Download Size</strong>: On first run, the browser downloads the WebAssembly core (<code>ffmpeg-core.wasm</code>, ~31MB). Be mindful of mobile data usage (cached by PWA Service Worker after first load).',
  'licenses.notice2':
    '<strong>Device-Dependent Performance</strong>: Decoding, filtering, and encoding run completely on your device CPU and memory. Speed and stability for long or 4K videos depend on hardware specs and browser memory limits.',
  'licenses.notice3':
    '<strong>Mobile / Tablet Guidance</strong>: To prevent out-of-memory tab reloads on smartphones, keep videos around 1080p, a few minutes, and a few hundred MB, and keep the screen awake while processing.',
  'licenses.libsHeading': 'Third-Party Libraries & Licenses',
};
