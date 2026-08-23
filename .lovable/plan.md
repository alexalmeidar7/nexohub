---
name: Fix Exception Insertion
description: Resolve error when adding music to the exceptions list in Info Music by handling duplicates and ensuring UI synchronization.
type: feature
---

## Problem
The user is encountering an "error when adding music to the list of EXCEPTIONS" (infomusic_excecoes). 
This is likely caused by:
1. **Duplicate Key Violation**: The table has a `UNIQUE(user_id, termo)` constraint. If a user tries to add an artist already in the exceptions list, the database returns an error.
2. **Missing UI Refresh**: The cache for exceptions might not be invalidated, or local state might not update correctly, causing the button to appear even if the exception exists.

## Proposed Changes

### Frontend (`src/components/InfoMusicSection.tsx`)
- Update the `onClick` handler for the "inserir na lista de EXCEÇÕES" button.
- Implement an `upsert` or check for existing terms to avoid direct database errors.
- Ensure `invalidateMusicExceptionsCache` is called after a successful insert to refresh the global matching logic.
- Add specific error handling for duplicate entries (PG error code `23505`).

### Logic (`src/lib/musicExceptions.ts`)
- Verify the cache invalidation function is exported and usable.

## Technical Details
- Table: `public.infomusic_excecoes`
- Constraint: `UNIQUE(user_id, termo)`
- Action: Replace `.insert()` with a logic that handles or prevents duplicates gracefully.
