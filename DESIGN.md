# BEFORE design notes

This is a source-derived design reference for the current implementation. The existing Chrome tab was discoverable, but its contents were not accessible from this review session, so these notes do not claim screenshot or runtime validation.

## Visual language

The interface frames a public statement as a physical record: a lavender studio background, editorial blue typography, a large paper-like statement card, and deterministic concentric contour paths. The card is explicitly labeled `LIVE PREVIEW` and `DRAFT · UNSIGNED` until a verified receipt exists; a confirmed card switches to `ON-CHAIN RECORD` and `SEALED`.

The central brand color is cobalt `#2457e7`. The page background is `#e9eeff`; primary ink is `#132865` / `#173785`; supporting text uses muted blues such as `#395487` and `#667eac`. The selectable record stocks are blue `#dce7ff` with contour `#426fe7`, green `#d9efdf` with contour `#248866`, and pink `#f5deea` with contour `#b86c99`. Review content uses `#eff3ff`; the public-record warning uses `#f0f3fd`; pending/error surfaces use warm cream and brown; confirmed status uses pale green with `#178461`. Keyboard focus is marked with a 3px amber `#ffae3d` outline.

## Type and layout

Manrope Variable is the interface face. Archivo Variable carries the wordmark, headline, card statement, and display headings. The wide layout is a two-column editorial/composer and record-preview composition, capped at 1540px, with a fine divider before the preview. The preview card is capped at 570px, has a paper-like shadow, and turns by 2 degrees at rest.

Responsive rules in `src/styles.css` switch the main grid to a vertical flow at 820px and tighten the card and controls again at 520px. Between 521px and 820px the primary navigation links return at a smaller size; at 520px and below, a slim sub-navigation row replaces them. Statement display size responds to text length, and the input limit is 180 UTF-8 bytes.

## Motion and interaction

The card eases upright and lifts 4px on hover; primary buttons lift 2px; the right-side drawer slides in over 0.38s; and an indeterminate spinner rotates every 0.7s while a request is pending. `prefers-reduced-motion: reduce` shortens animation and transition durations to 0.01ms and disables smooth scrolling. Success sound is opt-in and defaults off.

## Source references

- `docs/SURFACE.md` records the intended surface and chain-review contract.
- `src/App.tsx` contains stage labels, record-preview state, review disclosures, result details, and responsive navigation markup.
- `src/styles.css` contains the palette, typography, layout breakpoints, and motion rules.
- `src/main.tsx` loads the Manrope Variable and Archivo Variable font packages.
