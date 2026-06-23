# CTB Dashboard — Supply Chain PM Tool

A web-based Supply Chain Project Management dashboard for tracking builds, materials, allocations, budgets, and supplier data.

**Live site:** https://ctbdashboard-mine.vercel.app

---

## Screenshot

> *(Add a screenshot here as the project progresses)*

---

## Features

- **Dashboard** — High-level overview of project status
- **Build Matrix** — Track build configurations and parts
- **BOM Explorer** — Browse and manage Bills of Materials
- **Allocation** — Manage material allocations and recipient notifications
- **Inventory** — Monitor stock levels
- **Materials & Material Requests** — Track material needs and requests
- **Quotation** — Manage supplier quotes
- **Supplier Matrix** — Supplier comparison and tracking
- **Budget** — Budget tracking and reporting
- **Dev Track** — Development progress tracker
- **QR Code scanning** — Scan parts via camera

## Tech Stack

- React 19 + Vite
- EmailJS (email notifications)
- PapaParse (CSV import)
- SheetJS / xlsx (Excel import/export)
- html5-qrcode (QR scanning)
- Deployed on Vercel

## Run Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Project Structure

```
src/
  components/       # All page/feature components
  data/             # Static data files
  utils/            # Utility functions
  buildData.js      # Build configuration data
```

## Repository

https://github.com/ochsantos-glitch/ctbdashboard
