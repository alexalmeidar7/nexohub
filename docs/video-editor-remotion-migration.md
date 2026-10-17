# House Mix Video Editor — Remotion migration audit

## Goal
Rework the video editor in an isolated, incremental path without replacing the current editor or changing the existing Lovable Cloud database/authentication.

## Verified baseline
- Main editor component: `src/components/CortesVideoPage.tsx`.
- Current dependencies include `@ffmpeg/ffmpeg@0.12.10` and `@ffmpeg/util@0.12.1`; `@remotion/player` is not currently listed in `package.json`.
- The current preview is drawn to a canvas and the export path records a WebM stream using `MediaRecorder`, then transcodes it in browser FFmpeg to MP4 using H.264 at 5 Mbps and AAC at 96 kbps.
- The video library reads `video_editor_assets` and the `video-editor-media` storage bucket, generating signed URLs. The code declares a 50 MiB library limit.
- The current timeline clip model contains video and image clips; audio is connected separately during export. Undo/redo controls are visible in the header but are not wired in the inspected JSX.
- No `render-worker/Dockerfile` or `render-worker/package.json` was found at the repository root in this audit. This does not rule out a separate external render service; it must be confirmed before designing the server render path.

## Proposed staged implementation
1. Preserve the current editor as fallback while building the new editor surface behind an isolated route/feature flag.
2. Prototype Remotion Player preview using a minimal composition and verify preview, seek, and aspect-ratio behavior before adapting the full timeline.
3. Rework the workspace into media library, preview monitor, properties inspector, and multitrack timeline; add real undo/redo and audio-track editing only with focused tests.
4. Decide on server-side rendering only after locating the actual deployment/worker setup and measuring the cost of a short MP4 render.
5. Run lint/build and targeted tests; validate MP4 H.264, 5 Mbps video, AAC 96 kbps audio, progress reporting, retries, and media-library preservation.
6. Keep the old export path available until the new render pipeline passes validation. Do not deploy or change production rendering as part of the prototype.

## Cost and license gate
- Do not purchase the official Editor Starter template yet; it is listed at US$600 per project.
- Remotion's published license currently allows eligible individuals and organizations with up to 3 people to use it for free, including commercial use. Larger/ineligible organizations using the Player or automated editor workflows may require Remotion for Automators, currently US$0.01 per successful render with a US$100/month minimum.
- Confirm the organization's eligibility before using Remotion in production. Infrastructure costs for server rendering are separate and depend on the hosting provider and usage.

## Safety constraints
- No database migration.
- No production deployment.
- No replacement of existing library/auth logic.
- No changes to the public player routes.
