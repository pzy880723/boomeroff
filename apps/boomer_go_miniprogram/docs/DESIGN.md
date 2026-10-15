# BOOMER GO Native WeChat Workbench

Approved product direction: 2026-10-16 user instruction, autonomous initial delivery overnight.

## Scope

Five native tabs, exactly: 工作台 / 学习 / 识物 / 消息 / 我的. Revenue is display-only, including a leaderboard; it never contributes to knowledge examination scores, staff assessment or penalties. Keep the existing ERP account/store authority and GO knowledge/marketing data. No web-view, H5 navigation, customer mini-program replacement or new employee database.

## Visual Direction

An employee work surface, not a promotional landing page. Brand red #EB0029, ink #202125, muted text #737780, canvas #F5F6F8, white #FFFFFF, informational blue #315ACB. Use system PingFang/Sans Chinese fonts at 16px body, 13px secondary and 26px section display; minimum 44px touch targets. Calm white cards, 16px radius, 20px screen gutters, 8px spacing rhythm. Brand wordmark remains original. The signature is a red vertical shift/time rail next to the day's operational agenda. Central recognition tab is emphasized but does not cover labels or safe area.

## Surfaces

- Workbench: employee/store header, today's shift, display-only sales summary + leaderboard link, actionable learning/operations agenda, compact tools grid. No invented live statistics.
- Learn: search, knowledge/training/quiz/history filters, native cards, progress from server only, reading detail, per-question test with server scoring and persisted result.
- Recognize: native camera viewfinder, immediate shutter-to-thumbnail multi-shot, native album import, up to five photos, optional hint, preservation on recoverable failure, complete story/selling points not title-only.
- Messages: server notifications, unread state, mark read only on successful server write, native detail/conversation where supported.
- Mine: identity, bound store, schedules, favorites, assessment history, scan history, tasks, activities/vouchers, settings/logout.
- Native secondary pages: sales, leaderboard, schedule calendar/list, knowledge detail, quiz, tasks/OKR, activities, vouchers, community, AI assistant, marketing script/reference/video/asset detail/publish tasks.

## States

Every remote screen provides loading, retryable failure, genuine empty and populated states. Expired auth removes employee data. Cached content is keyed by identity/store and explicitly labeled with freshness; stale authorization never grants access. Demo data is opt-in in development builds, prominently marked, never an automatic fallback after API errors. Missing APIs show a precise unavailable state, not a fake successful action.

## Navigation and Permissions

All five tabs and every secondary screen are WeChat native components. Bound store comes from verified ERP context; only headquarters can switch among already-authorized stores. Login uses existing verified phone OTP first; WeChat account binding awaits a dedicated employee mini-program AppID/secret. Do not reuse the BOOMER OFF customer AppID.

## Source and Design

Figma: https://www.figma.com/design/SXY4nF6NWwrsw3jxZOIaDU
Existing GO web routes and native repositories are reference contracts, not files to overwrite.
