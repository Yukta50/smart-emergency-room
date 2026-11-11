# ERFlow - Smart Emergency Room System

ERFlow is a full-stack emergency room management prototype designed around the topics from the Data Structures and Algorithmic Problem Solving syllabus. It includes patient registration, triage priority, queue tracking, bed allocation, unit routing, search, and greedy next-patient selection.

## Features

- Linked-list patient storage
- Queue-based waiting management
- Stack-based undo history
- Stack-based arithmetic expression evaluation
- Binary-tree pre-order, in-order, and post-order traversals
- Linear, binary, and BST-based patient lookup
- Graph-based unit routing via BFS
- Merge-sort style priority ordering
- Greedy patient selection for treatment
- Patient CSV export and an R analysis/modeling deliverable
- Bed and treatment tracking dashboard
- Staff login and registration screens for the demo
- Full browser UI and REST API

## Tech Stack

- Node.js
- Express.js
- Vanilla JavaScript frontend

## Run the project

1. Open the project folder.
2. Install dependencies:
   npm install
3. Copy `.env.example` to `.env` and set `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD` for your MySQL server. Keep `.env` private; it is ignored by Git. `DB_NAME` defaults to the existing `emergency` database.
4. Ensure the MySQL account can create and read/write tables in `emergency`.
5. Start the server:
   npm start
6. Open the app in your browser:
   http://localhost:3000
   Standalone auth pages are available at `/login.html` and `/register.html`.

On startup, the backend creates the `patients`, `beds`, `action_history`, `app_settings`, and `staff_accounts` tables if they do not already exist. Demo patients and default bed counts are added only when the database has no patient records. Patient changes, bed counts, undo history, and registered staff accounts persist in MySQL.

## Data structures and algorithm phases

The dashboard demonstrates linked-list patient storage and queue operations, a linked-list stack for undo and expression evaluation, a patient binary search tree with all three depth-first traversals, graph routing with breadth-first search, linear/binary/BST lookup, and merge-sort triage ordering. The greedy triage selector chooses the highest-priority waiting patient whose required unit has an available bed. The Algorithms and Records views let staff exercise these operations.

## R analysis deliverable

Install R separately if it is not already available. No additional R packages are required. The included script loads and validates the sample patient dataset, summarizes case counts and mean severity by unit, saves two visualizations, and fits a linear severity model:

```powershell
Rscript analysis/erflow_analysis.R
```

By default, the script reads `data/sample_patients.csv`. To analyze current application records, sign in, open **Records**, choose **Export CSV for R**, and pass the downloaded CSV path:

```powershell
Rscript analysis/erflow_analysis.R C:\path\to\erflow-patients.csv
```

Summaries, plots, model predictions, the fitted model, and its report are written to `analysis/output/`.

## API endpoints

- GET /api/summary
- GET /api/patients
- GET /api/patients/search?q=ER-101&mode=linear|binary|bst
- GET /api/patients/export.csv
- POST /api/patients
- PUT /api/patients/:id
- DELETE /api/patients/:id
- GET /api/queue
- GET /api/priority
- GET /api/beds
- GET /api/route?from=Reception&to=ICU
- POST /api/auth/register
- POST /api/auth/login
- POST /api/triage/select-next
- POST /api/algorithms/evaluate-expression
- POST /api/undo

## Notes

This is an academic demonstration prototype and uses simulated patient data. The sign-in screen accepts the demo credentials `admin / admin123`; registered accounts are stored in MySQL with salted password hashes. Authentication is intended for demonstration and is not production-ready.
