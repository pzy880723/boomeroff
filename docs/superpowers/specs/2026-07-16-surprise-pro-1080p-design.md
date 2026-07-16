# Surprise Pro 1080p Design

## Goal

Make every new "BOOMER 帮你拍一条" task default to a real Seedance 2.0 Pro 1080p render instead of Fast 720p.

## Decisions

- The employee-facing surprise flow remains a fixed, one-click experience with no model or resolution controls.
- Its default model is `doubao-seedance-2-0-260128` and its default resolution is `1080p`.
- The browser sends both values explicitly.
- `surprise-marketing-video` supplies the same defaults when an older client omits them.
- `render-marketing-video` derives an omitted resolution from the selected model's declared default instead of hard-coding `720p`.
- Fast and Mini continue to clamp to 720p when explicitly selected as a recovery action.
- The system does not silently choose Fast or 720p for the initial surprise render. A lower-quality retry requires an explicit user action from the failure UI.

## Verification

- Unit tests assert the surprise defaults are Pro and 1080p.
- Unit tests assert backend quality resolution yields Pro/1080p by default and clamps Fast/1080p to Fast/720p.
- Existing surprise script and one-shot prompt tests remain green.
- TypeScript compilation and the production Vite build must pass.

