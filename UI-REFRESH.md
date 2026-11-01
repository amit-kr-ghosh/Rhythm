# Rhythm UI refresh

This refresh focuses on shared design primitives so improvements carry through the mobile app and browser UI:

- Responsive content measurements for compact phones, tablets and desktop browsers.
- Wider capped desktop content and adaptive horizontal spacing.
- Ambient, lightweight colour fields behind screens (no image assets or extra native dependencies).
- A consistent animated page heading used across the primary tabs.
- Elevated cards, clearer icon badges, more deliberate button hierarchy and touch feedback.
- Refined text fields and segmented controls with visible focus/selection states.
- Improved tab bar sizing and desktop sidebar presentation.
- Motion continues to respect the system reduce-motion preference through the existing motion helpers.

## Responsive checks

`tests/responsive.test.ts` covers phone widths (320–430 px), tablet widths (680–900 px), desktop widths (960–1920 px), content bounds and very narrow viewport safeguards.

## Verification status

Source edits and ZIP integrity can be checked in this environment. Full Expo web bundling, Expo Go device validation and end-to-end visual testing require installing the project's Expo dependencies and running the app on the target devices/browsers; those are not claimed as completed here.
