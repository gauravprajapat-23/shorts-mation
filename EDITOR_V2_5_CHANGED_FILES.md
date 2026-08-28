# Editor V2.5 — Audio Tracks, Waveforms, Mixing & Ducking

Implemented:
- First-class `EditorAudioClip` model with music, voiceover, SFX and original-audio roles.
- V1/V2 legacy soundtrack migration into a V2 music clip.
- Audio timeline clips with drag, trim, waveform display and clip selection.
- Browser waveform extraction with Web Audio API for uploaded/accessible sources.
- Audio properties: source in/out, playback rate, volume, mute, solo, loop, fades and split-at-playhead.
- Shared timeline audio evaluator with source-time mapping, fades, solo logic and automatic music ducking around voiceover clips.
- Configurable duck level, attack and release controls.
- Live editor and modal preview audio synchronized to the project playhead.
- FFmpeg multi-track audio mixing with trim, speed, fades, delay, mute/solo and dynamic music ducking.
- Shotstack audio assets on independent tracks so overlapping music/voice/SFX are valid, with trim/speed/volume and duck/fade envelope segmentation.
- Timeline scene boundaries now use the shared effective-scene timing ranges.
- Fixed duplicate `const svg` declaration left in the V2.4 preview modal.
- Added audio timeline regression coverage.

Notes:
- Waveform extraction depends on browser-decodable/CORS-readable audio. If a remote URL blocks CORS, the editor still accepts the clip but cannot precompute peaks.
- Legacy `timeline.soundtrack` remains only as a compatibility fallback when no V2 audio clips exist; new V2 audio uses timeline audio assets.
