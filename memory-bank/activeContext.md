# DreamChess — Active Context

## Current State (2026-04-13)
- **Status:** Initial build complete, deployed to Railway
- **Production URL:** https://dreamchess-production.up.railway.app
- **GitHub:** https://github.com/jk212h20/DreamChess

## Architecture
| File | Purpose |
|------|---------|
| `src/lib/game.ts` | Full chess engine with traitor sacrifice logic |
| `src/lib/ChessBoard.svelte` | Board component — rendering, interaction, sacrifice UI |
| `src/lib/socket.ts` | Socket.io client singleton |
| `src/hooks.server.ts` | Socket.io dev server (attaches to Vite's httpServer) |
| `server.js` | Production server (Socket.io + SvelteKit handler) |
| `src/routes/white/` | White player page |
| `src/routes/black/` | Black player page |
| `src/routes/table/` | Spectator page |

## Key Patterns
- **Traitor detection:** Pieces that could capture own king if they were opponent's color
- **Sacrifice flow:** Click traitor once (select) → click again (initiate sacrifice) → click opponent piece (complete)
- **Socket.io rooms:** `white`, `black`, `spectator` — each gets personalized state view
- **Board flip:** Black view uses CSS `transform: rotate(180deg)` with pieces counter-rotated

## Railway
- **Project ID:** d82fc4c4-a081-4555-af51-0c2880182060
- **Service ID:** adeaac04-78c7-40dd-9e50-b940b405e734
- **Build:** `npm run build` → `npm start` (runs server.js)

## What's Not Built Yet
- AI opponent (single-player mode)
- Sound effects integration (files exist but not wired up)
- Stalemate detection
- Draw by repetition / 50-move rule
- Room/lobby system (currently single global game)
- Mobile touch optimization