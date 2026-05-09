# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static GitHub Pages site for canteen dish ratings (食堂菜品评分榜). The site uses sql.js (WebAssembly) to load and query a SQLite database entirely in the browser. Data is managed locally via Python scripts and committed as static files.

## Architecture

### Frontend (Static Site)

- **index.html** — Landing page ("猎人小屋") with navigation to sub-modules and a friend links section
- **dice.html** — Random dish picker ("今天吃什么"), filters by current meal period (早餐/午餐/晚餐), canteen exclusion, and score range
- **reviewed.html** — Searchable, sortable table of all rated dishes with CSV export
- **about.html** — About page describing the project

### CSS (`statics/css/`)

Each page has its own CSS file (index.css, dice.css, reviewed.css, about.css). Shared design tokens via `:root` CSS variables. No CSS framework used.

### JavaScript (`statics/js/`)

- **common.js** — Shared utilities: version-stamp-based cache busting, timestamp formatting, database last-updated query
- **index.js** — Friend links loader (`data/links.json`)
- **dice.js** — Random dish picker logic: sql.js database loading, meal period detection, canteen/score filtering, roll animation, roll history
- **reviewed.js** — Searchable/sortable dish table: sql.js querying, client-side sort with zh-CN locale, CSV export

### Data Layer

- **`data/menu.db`** — SQLite database with a `dishes` table. Loaded by sql.js in the browser. Schema: id, name, canteen, rating, meal_type, official_link, is_active, updated_at
- **`data/links.json`** — Friend links stored as JSON array with name/link/icon_path fields

### Data Management Scripts (`scripts/`)

- **`manage_db.py`** — CLI + Tkinter GUI for database CRUD operations. Supports init, add, batch-add (CSV), update, delete, list, gui commands
- **`manage_links.py`** — CLI for friend links CRUD. Supports init, add, update, delete, move, list commands

## Development Commands

```bash
# Launch database GUI
python scripts/manage_db.py gui

# Initialize/upgrade database schema
python scripts/manage_db.py init

# List all dishes (CLI)
python scripts/manage_db.py list

# Add a dish
python scripts/manage_db.py add <name> <canteen> <rating> [--meal] [--link] [--closed]

# Batch import from CSV
python scripts/manage_db.py batch-add <file.csv>

# Update a dish
python scripts/manage_db.py update <id> [--name] [--canteen] [--rating] [--meal] [--link] [--active]

# Friend links management
python scripts/manage_links.py list
python scripts/manage_links.py add <name> <link> [--icon-path]
python scripts/manage_links.py update <index> [--name] [--link] [--icon-path]
python scripts/manage_links.py move <source> <target>

# Preview locally
# Use any static file server, e.g.:
python -m http.server 8000
```

## Key Design Decisions

- **No build step** — Pure HTML/CSS/JS, no bundler or transpiler
- **Cache busting** — A runtime version stamp (YYYYMMDDHHmmss) appended as `?v=` to all resource URLs, with a sessionStorage-based redirect loop (common.js)
- **Database packaging** — The SQLite `.db` file is committed to the repo as a static asset; after any data change via manage_db.py, run `git add data/menu.db && git commit && git push`
- **Fallback queries** — If `SELECT * FROM dishes` fails (schema mismatch), dice.js and reviewed.js fall back to `SELECT id, name, canteen, rating`
- **Meal period** — Determined client-side based on local time: 早餐 before 08:30, 午餐 08:30-14:59, 晚餐 from 15:00
