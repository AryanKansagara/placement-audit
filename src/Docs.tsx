import { SIGNALS } from './engine/audit.ts'
import { FORMATS, type ListFormat } from './engine/exports.ts'
import { KINDS } from './engine/csv.ts'
import { Code, Link } from './ui.tsx'

const GENERIC = `date,campaign,line_item,domain,impressions,clicks,conversions,spend,conversion_value,viewability,ivt_rate,frequency
2026-11-03,Northwind,NW | Native | Prospecting,www.devweekly.example,18240,41,9,182.40,,71.2%,0.8%,2.1
2026-11-03,Northwind,NW | Native | Prospecting,top-10-celeb-photos-daily.example,40210,402,0,120.63,,28.0%,31.5%,6.4
2026-11-03,Northwind,NW | Native | Prospecting,com.example.newsreader,9022,30,4,81.20,,64.0%,1.1%,3.0`

const FLIGHT = `line_item,budget,start_date,end_date
NW | Native | Prospecting,120000,2026-10-15,2026-11-30
NW | Native | Retargeting,36000,2026-10-15,2026-11-30`

const FREQ = `frequency,users,impressions
1,182000,182000
2,96000,192000
10,9300,93000
20,9600,192000`

const SOURCES: { id: string; name: string; steps: string[]; columns: string; note?: string }[] = [
  {
    id: 'stackadapt', name: 'StackAdapt',
    steps: [
      'Open Reports and start a new report (or open the campaign and use its report export).',
      'Pick the campaign group or campaigns and the date range. For pacing, break it out by day.',
      'Group by Domain for web and native, and by App for in-app and CTV. Run one report for each, or one with both if your account offers a combined inventory dimension.',
      'Add impressions, clicks, conversions, cost (spend), and viewability if it is enabled for your account.',
      'Export as CSV.',
    ],
    columns: 'Domain (or App), Impressions, Clicks, Conversions, Cost, plus Date and Campaign when broken out.',
    note: 'StackAdapt’s report column names are not in its public docs, so these were not verified for this release. The importer recognises the common names (Domain, Cost, eCPM, Campaign Group) and shows a mapping screen for anything else.',
  },
  {
    id: 'ttd', name: 'The Trade Desk',
    steps: [
      'In the advertiser, open Reports and create a report from the Site List or Inventory template (MyReports).',
      'Choose the campaigns or ad groups and the date range; add Day as a dimension for pacing.',
      'Keep Site, Impressions, Clicks, Advertiser Cost (USD) and your conversion column (for example All Last Click + View Conversions).',
      'Schedule or run once, then download the CSV.',
    ],
    columns: 'Site, Ad Group, Campaign, Impressions, Clicks, Advertiser Cost (USD), All Last Click + View Conversions.',
  },
  {
    id: 'dv360', name: 'Display & Video 360',
    steps: [
      'Open Reporting, then Create report, then Standard.',
      'Filter to the advertiser and insertion orders; set the date range.',
      'Dimensions: App/URL, Insertion Order, Line Item, and Date for pacing.',
      'Metrics: Impressions, Clicks, Total Conversions, Revenue (Adv Currency) for spend, and Active View: % Viewable Impressions.',
      'Run the report and download it as CSV. DV360 adds a summary row and report notes at the bottom; the importer skips them and lists them in the validation report.',
    ],
    columns: 'App/URL, Line Item, Impressions, Clicks, Total Conversions, Revenue (Adv Currency), Active View: % Viewable Impressions.',
  },
  {
    id: 'gads', name: 'Google Ads (Display, Demand Gen, Video)',
    steps: [
      'Open Campaigns, then Insights and reports, then When and where ads showed (older accounts: Content, then Where ads showed).',
      'Set the date range and pick the campaigns.',
      'Use the download icon and choose CSV.',
      'The file starts with a title line and a date-range line above the header; the importer finds the real header and skips the Total rows at the bottom.',
    ],
    columns: 'Placement, Placement URL, Type, Campaign, Ad group, Impr., Clicks, Cost, Conversions, Conv. value.',
  },
]

export default function Docs() {
  return (
    <article className="page docs">
      <header className="docs-head">
        <div className="eyebrow">Docs</div>
        <h1>Getting placement reports out of your DSP</h1>
        <p className="lede">Placement Audit needs one CSV: spend and delivery by domain or app. A flight plan, a frequency report and your own known-MFA list are optional. Export steps and upload formats were checked in <b>November 2026</b>; DSP menus move, so if a label differs, look for the report that breaks delivery out by site, domain or app.</p>
        <nav className="toc" aria-label="On this page">
          {SOURCES.map(s => <a key={s.id} href={`#${s.id}`}>{s.name}</a>)}
          <a href="#generic">Any other DSP</a><a href="#optional">Flight plan and frequency</a><a href="#score">How the score works</a><a href="#whatif">The what-if</a><a href="#upload">Uploading the lists</a><a href="#privacy">Where your data goes</a><a href="#routine">Weekly routine</a>
        </nav>
      </header>

      {SOURCES.map(s => (
        <section key={s.id} id={s.id}>
          <h2>{s.name}</h2>
          <ol>{s.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
          <p className="small"><b>Columns we look for:</b> {s.columns}</p>
          {s.note && <p className="small warn-text">{s.note}</p>}
        </section>
      ))}

      <section id="generic">
        <h2>Any other DSP or a spreadsheet</h2>
        <p>Any CSV (comma, tab or semicolon) with a placement column, impressions and spend works. Everything else is optional and improves the score. Rates may be written as 0.71, 71 or 71%. Currency symbols and thousands separators are fine.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Field</th><th>Required</th><th>Header names recognised</th></tr></thead>
            <tbody>{KINDS.placements.fields.map(f => <tr key={f.key}><th scope="row">{f.label}</th><td>{f.required ? 'Yes' : 'No'}</td><td className="mono small">{f.aliases.slice(0, 6).join(', ')}</td></tr>)}</tbody>
          </table>
        </div>
        <Code code={GENERIC} label="placements.csv" />
      </section>

      <section id="optional">
        <h2>Flight plan and frequency report</h2>
        <p><b>Flight plan</b> (for pacing): one row per line item with its budget and inclusive start and end dates. Line item names must match the line item, ad group or campaign column in the placement report. Pacing needs the placement report broken out by day.</p>
        <Code code={FLIGHT} label="flight.csv" />
        <p><b>Frequency report</b> (for waste): users or households by number of exposures. The Trade Desk, DV360 and most CTV platforms offer a frequency or reach-and-frequency report. Without one, the average frequency column per placement is used instead.</p>
        <Code code={FREQ} label="frequency.csv" />
      </section>

      <section id="score">
        <h2>How the score works</h2>
        <p>Placements are grouped by registrable domain (<code>www.news.example.co.uk/article</code> becomes <code>example.co.uk</code>) or app ID (<code>mobileapp::2-com.example.app</code> becomes <code>com.example.app</code>). Each earns points from the signals below, capped at 100. A placement is flagged at 40 points by default. Statistical signals (viewability, CTR, CPM) need at least 1,000 impressions so tiny placements are not judged on noise.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Signal</th><th className="num">Points</th><th>Rule</th></tr></thead>
            <tbody>{Object.entries(SIGNALS).map(([k, s]) => <tr key={k}><th scope="row">{s.label}</th><td className="num">up to {s.max}</td><td>{s.help}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="small muted">The CTR test uses a robust z-score: 0.6745 &times; (CTR &minus; median) / MAD, across placements above the impression floor, with |z| &ge; 3.5 as the cutoff (Iglewicz and Hoaglin). Medians, not means, so the junk being measured cannot drag the baseline. Domain-pattern checks are heuristics; they never flag a placement alone because they are worth 15 points.</p>
        <p className="small muted"><b>ads.txt and sellers.json</b> are not fetched. A browser can only read them from publishers that send CORS headers, which most do not, so the check would fail silently for most domains. If your verification vendor reports unauthorized sellers, paste those domains into the known-MFA list on the Data tab.</p>
      </section>

      <section id="whatif">
        <h2>The what-if</h2>
        <p>Excluding the flagged set frees its spend. The projection keeps total spend the same and assumes the freed dollars buy conversions at the <b>median conversions per dollar of clean placements</b> (above the impression floor). Conversions the flagged set did deliver are subtracted. Projected CPA is total spend divided by projected conversions; ROAS works the same way with conversion value. It is an estimate: clean inventory may not scale at the same rate, which is why the report says so.</p>
      </section>

      <section id="upload">
        <h2>Uploading the lists</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Format</th><th>File</th><th>Where it goes</th></tr></thead>
            <tbody>{(Object.keys(FORMATS) as ListFormat[]).map(f => <tr key={f}><th scope="row">{FORMATS[f].label}</th><td className="mono">.{FORMATS[f].ext}</td><td>{FORMATS[f].note}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="small muted">Checked November 2026. Upload dialogs show their expected format; if one differs, the plain list works almost everywhere.</p>
      </section>

      <section id="privacy">
        <h2>Where your data goes</h2>
        <p>Files are parsed in your browser and stored in this browser (IndexedDB). Nothing is uploaded unless you sign in. Signed in, audits sync to your account: settings, overrides, change logs, snapshots, and the raw report if it is under 1.5 MB. Export or delete everything from the account menu at any time.</p>
      </section>

      <section id="routine">
        <h2>Weekly routine</h2>
        <ol>
          <li>Export last week&rsquo;s placement report and drop it on the audit&rsquo;s Data tab. It replaces the previous report.</li>
          <li>Review the flagged list. Allow anything you know is fine; block anything the score missed.</li>
          <li>Download the exclusion list for your DSP and attach it to every line item.</li>
          <li><b>Save snapshot</b>, then print the client report.</li>
          <li>Next week, compare snapshots on the History tab. Anything listed under <b>Still spending</b> is an exclusion that did not land.</li>
        </ol>
        <p><Link href="/app" className="btn primary">Open your audits</Link></p>
      </section>
    </article>
  )
}
