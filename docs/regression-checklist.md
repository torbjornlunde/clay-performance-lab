# Regression checklist

Use this checklist after each PR and before merging to keep the main user flows safe.

## A. Auth / navigation

- [ ] Public/login page does not show Dashboard before login.
- [ ] Login works.
- [ ] Dashboard opens after login.
- [ ] Logout works.

## B. Dashboard

- [ ] New shooting log opens.
- [ ] Add result only opens.
- [ ] Import from Leirdue.net opens.
- [ ] FITASC schemes opens.
- [ ] Stats opens.
- [ ] Export my data downloads Excel or shows clear error.
- [ ] Dashboard mobile layout has no horizontal scrolling.

## C. Shooting logs

- [ ] New shooting log can be created.
- [ ] Edit setup opens old and new sessions.
- [ ] Log Miss opens.
- [ ] Save miss works.
- [ ] Review misses opens.
- [ ] Edit miss opens and saves.
- [ ] Delete miss works.

## D. Disciplines

- [ ] Compak Sporting works.
- [ ] Kompakt leirduesti works.
- [ ] Sporttrap works.
- [ ] Leirduesti works.
- [ ] Compak and Kompakt leirduesti use compact logic.
- [ ] Leirduesti uses post logic.
- [ ] Sporttrap uses 25-target series.

## E. Must test after latest hotfix

- [ ] Compak Sporting edit miss can change actual presentation.
- [ ] Compak Sporting edit miss can switch order.
- [ ] Kompakt leirduesti edit miss still works.
- [ ] Analysis uses actual_presentation when available.
- [ ] Target definitions copy to all courses works.
- [ ] Speed and distance are preserved during target definition copy.
- [ ] Export still works after new miss fields.

## F. Leirdue import

- [ ] Import page opens.
- [ ] Search form has shooter name, year and discipline checkboxes.
- [ ] No-candidates state is understandable.
- [ ] Add result manually link works.
- [ ] Candidate review/save should be tested when parser returns candidates.

## G. Dashboard result UX

- [ ] Results combines competition shooting logs and result-only entries.
- [ ] Results are sorted newest first by competition date/date with created date fallback.
- [ ] Training logs are separate from Results.
- [ ] Results show only 3 items by default.
- [ ] Show more / Show less works for Results.
- [ ] Show more / Show less works for Training.
- [ ] Dashboard chart renders without horizontal scrolling on mobile and desktop.
- [ ] Dashboard chart skips entries without a winning score.
- [ ] Dashboard chart opens Stats when the card is clicked.
- [ ] Dashboard chart period filters work for Last month, Last year, All and Custom.
- [ ] Existing dashboard actions still open the correct routes.

## H. Dashboard rolling average chart

- [ ] Dashboard chart shows individual performance and rolling average.
- [ ] Rolling average moves over time and is not a flat average.
- [ ] Rolling average uses performance vs winning score, not raw score.
- [ ] Period filters affect both chart and rolling average.
- [ ] Tooltip/preview shows performance, rolling average and difference.
- [ ] Chart remains mobile-friendly with no horizontal scrolling.
