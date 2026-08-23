# Plan: Fix Real-time Player Widget Sync on Home

The user reported that the Player Widget on the Home page is not automatically updating when the "Musica no Ar" (Now Playing) information changes. Analysis reveals that `CustomizableDashboard.tsx` uses a 2-second polling interval for `localStorage`, but it might not be reacting correctly to cross-tab storage events or internal state changes, especially when switching between different music data keys.

## User Review Required

> [!IMPORTANT]
> The fix will ensure that the Player Widget reacts instantly to music updates across different browser tabs or within the same session by hardening the event listeners and the polling logic.

## Technical Details

### Frontend Changes
- **File**: `src/components/CustomizableDashboard.tsx`
  - Refine the `useEffect` that polls for music data:
    - Ensure it uses `dataUserId` correctly to scope the `localStorage` keys.
    - Add a `storage` event listener to react instantly to changes made in other tabs.
    - Add a custom event listener (`MUSIC_DATA_EVENT`) to react to changes made in the same tab via `writeMusicData`.
    - Harmonize the logic between `readMusicData` (localStorage) and the fallback `fetchFromDb` (database).
  - Ensure the `currentMusic` state update correctly triggers a re-render of the widget content.

### Verification Plan
- **Manual Verification**:
  - Open the Home page in one tab and the "Música no Ar" page in another.
  - Change the current music or artist in the "Música no Ar" page.
  - Verify that the Player Widget on the Home page updates its labels and progress bar immediately without needing a page refresh.
  - Test switching between different studio channels to ensure the widget updates to show the correct metadata for the active stream.
