// TEST FIXTURE ONLY: a stand-in folder for node:test and Playwright. Nothing in app/ loads this file.
// Classic script (file://) and CommonJS (node:test). Each record has the shape the app gets from its folder listing.
(function (root) {
  'use strict';
  const DAY = 864e5;
const DEMO = [
  ['CBC_Blood_Panel_Report_Nov2026.pdf', 'Documents/Medical/Labs', 2457, 1, 'COMPLETE BLOOD COUNT (CBC) — Patient: A. Sim. Hemoglobin 13.8 g/dL (13.0–17.0). Total WBC 6,400 /µL. Platelet count 245 ×10³/µL. Packed cell volume 41.2%. Impression: complete blood count panel within reference range.'],
  ['Scan_Nov_10.pdf', 'Downloads', 1180, 1, 'PATHOLOGY REPORT. Specimen received 10 Nov 2026. Serum ferritin 18 ng/mL (low). Haemoglobin 11.2 g/dL, mean corpuscular volume 76 fL. Suggest iron studies and repeat in 6 weeks. Reported by Dr. N. Iyer, MD Pathology.'],
  ['Prescription_Dr_Rao_Oct2026.pdf', 'Documents/Medical', 220, 26, 'Rx — Amoxicillin 500 mg, one capsule three times daily for 5 days. Paracetamol 650 mg as needed for fever. Review after one week. Dr. S. Rao, General Physician.'],
  ['MRI_Knee_Report.pdf', 'Documents/Medical/Imaging', 3890, 64, 'MRI LEFT KNEE. Grade I signal in the medial meniscus posterior horn. No ligament tear. Mild joint effusion. Advised physiotherapy and follow-up imaging in three months.'],
  ['Tax_Return_AY2026-27.pdf', 'Documents/Finance/Tax', 610, 112, 'Income tax return acknowledgement, assessment year 2026-27. Total income ₹6,40,000. Tax payable nil after rebate under section 87A. E-verified on 28 July 2026.'],
  ['Rental_Agreement_Indiranagar.pdf', 'Documents/Legal', 1420, 210, 'This rental agreement is made between the landlord and the tenant for the premises at 12th Main, Indiranagar. Monthly rent ₹28,000; security deposit ₹1,00,000; term eleven months.'],
  ['Invoice_INV-2026-118.pdf', 'Documents/Finance/Invoices', 96, 15, 'INVOICE INV-2026-118. Design consultation, 12 hours at ₹2,500. Subtotal ₹30,000, GST 18% ₹5,400, total due ₹35,400. Payment within 15 days.'],
  ['Operating_Systems_Notes_Unit3.pdf', 'Documents/College/OS', 2210, 40, 'Unit 3 — Process scheduling. FCFS, SJF, round robin with time quantum, multilevel feedback queues. Deadlock conditions: mutual exclusion, hold and wait, no preemption, circular wait.'],
  ['Resume_2026.pdf', 'Documents/Career', 140, 33, 'Second-year B.Tech, AI & Data Science. Projects: network attack forecasting with LSTM, real-time F1 telemetry dashboard, campus club portal. Skills: Python, Rust, React, SQL.'],
  ['Hematology_Biomarkers_Deck.pptx', 'Documents/Projects/BioSignals', 8400, 9, 'Slide 4 — Hematology biomarkers: hemoglobin, ferritin and reticulocyte count as early anaemia signals. Slide 7 — model accuracy on 1,200 anonymised panels.'],
  ['Hackathon_Pitch_UrbanIQ.pptx', 'Documents/Projects/UrbanIQ', 12800, 48, 'UrbanIQ — civic issue reporting from a single photo. Problem, solution, live demo, geo-tagging, routing to municipal departments, impact metrics, team.'],
  ['Quarterly_Review_Q3.pptx', 'Documents/Work', 6400, 41, 'Q3 review: shipped search v2, cut cold start by 38%, onboarding completion up 12 points. Q4 goals: offline mode and tablet layout.'],
  ['DBMS_Normalization_Lecture.ppt', 'Documents/College/DBMS', 3300, 75, 'Normalization: 1NF, 2NF, 3NF, BCNF. Functional dependencies, lossless join decomposition, dependency preservation, worked examples on a student-course schema.'],
  ['Design_Crit_Shelf_UI.key', 'Documents/Design', 22100, 6, 'Design crit — tactile shelf interface. Spines as navigation, covers as focus, ink-bleed reveal for detail. Open questions: caption density and touch targets.'],
  ['Lab_Bloodwork_Receipt_Scan.jpg', 'Pictures/Scans', 1730, 3, 'APOLLO DIAGNOSTICS — Bloodwork panel. Received with thanks ₹1,450. Receipt No. 88213. Sample collected 08:10. Reports by email within 24 hours.'],
  ['IMG_4092.JPG', 'Pictures/iPhone', 3020, 2, 'Fasting glucose 96 mg/dL. HbA1c 5.4%. Platelets adequate on smear. Lab ref: OP-2231. Doctor\'s note: continue diet, recheck in 3 months.'],
  ['Donor_Card_2025.png', 'Pictures/Scans', 640, 300, 'Voluntary blood donor card. Group: B positive. Donations: 3. Last donation 14 March 2025. Thank you for saving lives.'],
  ['Screenshot_2026-11-09_at_22.14.png', 'Desktop', 890, 2, 'error[E0425]: cannot find value `stage` in this scope --> src/lib.rs:88:9. Build failed, 1 error emitted.'],
  ['Whiteboard_Sprint_Plan.heic', 'Pictures/iPhone', 2900, 12, 'Sprint 14: shelf physics, search slot, inspector bleed, keyboard nav. Owner: Asim. Demo Friday.'],
  ['Electricity_Bill_Oct.jpg', 'Pictures/Scans', 1150, 22, 'BESCOM electricity bill, October. Units consumed 212. Amount payable ₹1,836. Due date 5 November.'],
  ['Coorg_Morning_Hills.jpg', 'Pictures/Travel', 5600, 140, ''],
  ['Arterial_Blood_Gas_Notes.docx', 'Documents/Notes/Physiology', 74, 20, 'Arterial blood gas interpretation: check pH first, then PaCO2 for the respiratory component and HCO3 for the metabolic component. Compute the anion gap when acidosis is metabolic.'],
  ['Cover_Letter_Internship.docx', 'Documents/Career', 38, 31, 'Dear hiring team, I am applying for the software engineering internship. I build fast, tactile interfaces and care about systems that fail loudly.'],
  ['Meeting_Notes_Nov.md', 'Documents/Notes', 12, 4, '# Weekly sync — Nov. Shelf animation feels right at k = 5.2. Need empty states. Spotlight snippet latency ~0.5 s per file; batch the top results.'],
  ['Reading_List.txt', 'Documents/Notes', 4, 90, 'The Design of Everyday Things; Thinking in Systems; Designing Data-Intensive Applications; The Pragmatic Programmer.'],
  ['Lease_Renewal_Letter.rtf', 'Documents/Legal', 22, 180, 'Re: renewal of lease for the premises at Indiranagar for a further term of eleven months at the revised rent of ₹29,400.'],
  ['Blood_Pressure_And_Lipid_Log.xlsx', 'Documents/Health', 58, 5, 'Date, Systolic, Diastolic, Pulse, LDL, HDL, Triglycerides. Lipid panel trend: LDL 132 → 118 mg/dL over 8 weeks. Morning readings average 124/81.'],
  ['Monthly_Budget_2026.xlsx', 'Documents/Finance', 44, 18, 'Budget 2026: rent 28,000; groceries 9,000; transport 3,500; savings 15,000; subscriptions 1,200.'],
  ['Expenses_Nov.csv', 'Documents/Finance', 6, 6, 'date,merchant,amount\n2026-11-01,Metro card,500\n2026-11-03,Bookstore,840\n2026-11-05,Pharmacy,320'],
  ['Hackathon_Team_Roster.numbers', 'Documents/Projects/UrbanIQ', 210, 50, 'Team UrbanIQ — roles: ML, backend, frontend, pitch. Shifts and submission checklist.'],
  ['shelf_physics.rs', 'Code/arkhive/src', 9, 0, 'pub fn spring(s: f32, target: f32, k: f32, dt: f32) -> f32 { s + (target - s) * (1.0 - (-k * dt).exp()) }'],
  ['search_index.py', 'Code/experiments', 14, 27, 'def rank(hits, terms):\n    return sorted(hits, key=lambda h: (-score(h, terms), -h.mtime))'],
  ['query_parser.ts', 'Code/arkhive/web', 7, 8, 'export function cleanQuery(raw: string): string[] { return tokens(raw).filter((t) => !STOP.has(t)); }'],
  ['schema.sql', 'Code/experiments', 3, 60, 'CREATE TABLE files (id INTEGER PRIMARY KEY, name TEXT, ext TEXT, path TEXT UNIQUE, size INTEGER, modified INTEGER);'],
  ['tauri.conf.json', 'Code/arkhive/src-tauri', 2, 3, '{ "productName": "Arkhive", "identifier": "dev.archiveos.app" }'],
  ['App.tsx', 'Code/portfolio/src', 11, 36, 'export default function App() { return <Shelf items={items} onOpen={setActive} />; }'],
  ['ray_tracer.cpp', 'Code/graphics', 28, 160, 'Vec3 color(const Ray& r, const Hittable& world, int depth) { if (depth <= 0) return Vec3(0, 0, 0); }'],
  ['Voice_Memo_Clinic_Visit.mp3', 'Music/Voice Memos', 4200, 26, ''],
  ['Hackathon_Demo_Recording.mov', 'Movies', 186000, 47, ''],
  ['Lecture_Recording_DBMS.mp4', 'Movies/College', 412000, 74, ''],
  ['Project_Archive_UrbanIQ.zip', 'Documents/Projects/UrbanIQ', 48200, 46, ''],
  ['Backup_Photos_2025.tar', 'Archives', 2310000, 200, ''],
  ['Fonts_Pack.7z', 'Downloads', 18800, 95, ''],
];

  const now = Date.now();
  const FILES = DEMO.map(([name, dir, kb, days, text], i) => ({
    name,
    ext: name.split('.').pop().toLowerCase(),
    path: '/Fixture/' + dir + '/' + name,
    size: Math.round(kb * 1024),
    modified: now - days * DAY - (i % 7) * 3.6e6,
    created: now - (days + 3 + (i % 11) * 5) * DAY,
    text,
    kind: 'file',
    mode: 0o644,
    score: 0,
    snippet: null,
  }));
  // an empty folder, so the empty state can be reached
  FILES.push({ name: 'Inbox', ext: '', path: '/Fixture/Documents/Inbox', size: 0, created: now, modified: now, text: '', kind: 'dir', mode: 0o755, score: 0, snippet: null });

  const api = { FILES, DEMO };
  root.ArchiveFixture = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
