# Regression checklist

Before merging any future PR:

- [ ] Public/login page does not show Dashboard button before login.
- [ ] Login works with Enter key.
- [ ] Dashboard opens after login.
- [ ] Dashboard shows New shooting log for full miss logging.
- [ ] Dashboard shows Add result only for score-only stats.
- [ ] Dashboard shows FITASC schemes.
- [ ] `/fitasc` opens.
- [ ] FITASC scheme selector shows schemes 1-40.
- [ ] FITASC viewer does not use Target/Event wording.
- [ ] Log Miss opens.
- [ ] Log Miss shows calculated machine when scheme data exists.
- [ ] Log Miss recent misses/delete works.
- [ ] New shooting log works.
- [ ] Edit setup works.
- [ ] Target definitions save works.
- [ ] Stats page opens without horizontal scrolling on mobile.
- [ ] Result-only entry works.
- [ ] Dashboard desktop layout does not squeeze text beside buttons.
- [ ] Dashboard main actions are clearly worded for Shooting log vs Result only.
- [ ] FITASC viewer does not show verification status.
- [ ] Dashboard section order is Competitions, Result only entries, Training.
- [ ] Log Miss does not show unnecessary Logging mode toggle.
- [ ] New shooting log date field is normal size.
- [ ] Stats chart is responsive and proportionate.
- [ ] FITASC schemes fit on mobile without horizontal page scrolling.
- [ ] FITASC admin/import is not shown in normal user flow.
- [ ] Production/main should be treated as source of truth.
