# PayPal responsive checkout lock hotfix

This hotfix prevents a previous checkout's local payment lock from appearing on a later cart when the PayPal component remounts at a desktop/mobile responsive breakpoint.

- Legacy unversioned `paypal-checkout:*` storage entries are removed.
- Stored checkout state is scoped to the current browser tab and checkout visit.
- A transient `processing` bit is not restored as `payment received` after a responsive remount.
- A confirmed `received` lock remains available only for the same checkout visit and expires after 30 minutes.
