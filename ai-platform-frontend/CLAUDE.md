# AI Enterprise Platform — Frontend

## Overview
React + Vite + Tailwind CSS dashboard app. No SSR. Deployed on Vercel.

## Tech Stack
- **Framework:** React 19 + TypeScript
- **Build:** Vite 8
- **Styling:** Tailwind CSS (utility classes only, no CSS modules)
- **Routing:** react-router-dom v7

## Folder Structure
```
src/
├── components/    # Reusable UI components (Sidebar, etc.)
├── layouts/       # Page layouts (DashboardLayout wraps all routes)
├── pages/         # One file per route, named after the feature
├── App.tsx        # Router definition
├── main.tsx       # Entry point
└── index.css      # Tailwind import only
```

## Routes
| Route           | Page Component | Sidebar Label   |
|-----------------|---------------|-----------------|
| `/skills`       | Skills        | Skills          |
| `/tasks`        | Tasks         | Tasks           |
| `/contentTypes` | ContentTypes  | Content Types   |
| `/images`       | Images        | Pictures        |
| `/captions`     | Captions      | Text            |
| `/frames`       | Frames        | Video Frames    |
| `/videos`       | Videos        | Videos          |
| `/identity`     | Identity      | Brand Identity  |

`/` redirects to `/skills`. All sidebar items are flat, equal-level links.

## Conventions
- One component per file, use named exports
- Tailwind utility classes only — no inline styles, no CSS files
- Page components go in `src/pages/`, always default export
- Keep components small; extract when a component exceeds ~100 lines
