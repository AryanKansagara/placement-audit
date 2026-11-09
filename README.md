# Placement Audit

Find where a programmatic budget actually went. Placement Audit reads a DSP placement report, scores every domain and app for made-for-advertising risk, measures frequency waste and pacing drift, and produces the exclusion lists and a client-ready report.

Built for programmatic traders and agency account managers running display, native and CTV on a DSP.

## The pain

MFA slideshow sites and junk apps win cheap auctions, rack up accidental clicks and invalid traffic, and still let a campaign hit its CPA target. Finding them means exporting placement reports, eyeballing thousands of rows, and hand-building block lists for each DSP every week.

## Features

- Import StackAdapt, The Trade Desk, DV360, Google Ads or any CSV placement report: format detection, column mapping, and a validation report with line numbers. Optional flight plan, frequency report and known-MFA list.
- Domain and app normalization (eTLD+1, subdomains, app bundle and store IDs, Google Ads `mobileapp::` placements).
- Transparent 0-100 risk score from named signals: IVT, viewability, robust-z CTR outliers, suspicious domain patterns, impressions without conversions, CPM far below median, over-frequency, your known-MFA list. Manual allow/block overrides.
- Spend at risk, frequency waste beyond an effective cap, even-pacing tracker with the daily budget needed to land.
- What-if: exclude the flagged set and re-project CPA or ROAS at the clean median.
- Exclusion lists in plain, StackAdapt, The Trade Desk, DV360 and Google Ads shapes, an allowlist, and a CSV with reasons.
- Printable client report, change log per audit, dated snapshots with a compare view that flags exclusions still taking spend.
- Local-first (IndexedDB), optional account sync, light and dark themes, three synthetic sample campaigns.

## Run locally

```
npm install
npm run dev     # http://localhost:5173
npm test        # engine tests
npm run build
```

Copy `.env.example` to `.env` for optional sync (public Supabase URL and publishable key).

## Live

https://placement-audit.vercel.app
