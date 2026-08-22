# Plan - Fix Promotion and Testimonial Edit Form Population

The user reported that clicking the edit (pencil) icon for a promotion or testimonial does not correctly populate the form fields (Name and Text are missing, while Sponsor appears).

## Proposed Changes

### Frontend - Promotion Management
- **File:** `src/components/PromocoesPage.tsx`
- **Fix:** Ensure the `handleEdit` function correctly maps all database fields to the form state.
- **Verify:** The `item` object passed to `handleEdit` should contain `nome`, `texto`, and `oferecimento`.

### Frontend - Testimonial Management
- **File:** `src/components/TestemunhaisPage.tsx`
- **Fix:** Ensure the `handleEdit` function correctly maps the `texto` and `programa_ids` fields.

### Data Synchronization Check
- Verify that the `items` state in both components is fully populated when `loadData` is called.
- Ensure the `items` array includes the `nome` and `texto` fields for promotions.

## Technical Details
- The `handleEdit` function in `PromocoesPage.tsx` currently attempts to set the form from the `item` passed from the table row.
- If the table row display is truncated or missing fields, the form will be empty.
- I will ensure the `loadData` query selects all necessary columns and that `handleEdit` uses the correct property names.

## Verification Plan
- Use Playwright to simulate:
    1. Navigation to the Promotions page.
    2. Clicking the Edit button on an existing promotion.
    3. Checking if the "Nome da Promoção" and "Texto da Promoção" fields are populated in the form.
- Repeat for the Testimonials page.
