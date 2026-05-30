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
