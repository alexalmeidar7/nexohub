# Plan: Fix Roteiro History Persistence

The user reported that previously registered scripts (roteiros) were lost after recent changes to the `RoteiroPrograma.tsx` component. Analysis reveals that the `fetchHistorico` function was modified to filter scripts by the `agendado_para_envio` field and slice the result to only 10 items, which effectively hid most existing scripts from the UI. Additionally, a later line in the same function overwrote the `historico` state with the full raw data, causing inconsistent state updates.

## User Review Required

> [!IMPORTANT]
> The scripts were not deleted from the database; they were just being filtered out or limited in the display. The fix will restore the full list and ensure proper separation between "Scheduled" and "Registered" scripts.

## Technical Details

### Frontend Changes
- **File**: `src/components/RoteiroPrograma.tsx`
  - Refactor `fetchHistorico`:
    - Remove `.slice(0, 10)` limit on registered scripts.
    - Remove the line `setHistorico(data)` at the end of the function, which was overwriting the filtered state.
    - Ensure scripts that are NOT scheduled (`!agendado_para_envio`) are correctly assigned to `historico`.
    - Ensure scripts that ARE scheduled (`agendado_para_envio`) are correctly assigned to `agendados`.
  - Fix UI rendering logic:
    - In `historicoSlot`, ensure the grouping and mapping logic correctly uses the filtered `historico` state.
    - Remove any placeholder text that might be obscuring the real data.

### Verification Plan
- **Manual Verification**:
  - Open the "vMix — Roteiro de Programa" page.
  - Expand the "Roteiros Cadastrados" drawer.
  - Verify that all previously created scripts are visible, grouped by studio.
  - Check the "Roteiros Agendados" section to ensure scheduled scripts are also displayed correctly.
  - Test editing a script to ensure it correctly populates the form and updates the list upon saving.
