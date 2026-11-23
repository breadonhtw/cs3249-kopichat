# Kopichat frontend

The React and Vite frontend for Kopichat: the student chat (`/`), the matched written form (`/form`) and NUSSU's reviewer view (`/review`). It needs the backend running, so setup, run and test instructions are in the [repository README](../README.md).

From the repository root:

| Command | What it does |
|---|---|
| `npm --prefix frontend run setup` | Installs the frontend's dependencies |
| `npm --prefix frontend run start` | Starts the dev server on http://localhost:5173, forwarding `/api` to the backend on port 8000 |
| `npm --prefix frontend run doctor` | Checks the Node version and installed packages |
| `npm --prefix frontend test` | Runs the frontend tests |
| `npm --prefix frontend run build` | Type-checks and builds into `frontend/dist`, which the backend serves on port 8000 |

The source is in `src/`: `components/` for the screens, `useSession.ts` for the chat's state, `api/` for the backend calls, `copy.ts` for the on-screen wording and `styles/` for the design tokens and layout. The comic-strip illustrations used by the reviewer view are in `public/strips/`.
