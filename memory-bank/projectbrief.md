# DreamChess — Project Brief

## Overview
DreamChess is a chess variant called "Traitor Sacrifice Chess". It's standard chess with one twist: when a player is behind on material, their own pieces that could capture their own king (if they were the opponent's color) become "traitors" — they can be sacrificed to remove any opponent piece (except king) from the board.

## Core Rules
1. **Normal Chess** — Standard chess rules apply (movement, capture, castling, en passant, promotion, check, checkmate)
2. **Material Disadvantage** — When your material value is less than your opponent's, you gain access to the sacrifice mechanic
3. **Traitor Pieces** — Your own pieces/pawns that could capture your own king (if they were enemy pieces) are marked as traitors
4. **Sacrifice** — Click a traitor piece twice to sacrifice it, then choose any opponent piece (except king) to remove from the board. This counts as your turn.
5. **Check Interaction** — If in check, a sacrifice must resolve the check (by removing the checking piece or the traitor blocking the check)

## Tech Stack
- **Frontend:** SvelteKit 2 + Svelte 5 (runes mode)
- **Backend:** Node.js + Socket.io
- **Adapter:** @sveltejs/adapter-node
- **Pieces:** Custom SVGs from ChessCards project
- **Sounds:** WAV files from ChessCards project

## URLs
- **Production:** https://dreamchess-production.up.railway.app
- **GitHub:** https://github.com/jk212h20/DreamChess
- **Railway project:** d82fc4c4-a081-4555-af51-0c2880182060

## Architecture
- `/white` — White player view (board oriented white-down)
- `/black` — Black player view (board oriented black-down, flipped)
- `/table` — Spectator view
- `/` — Landing page with role selection
- Socket.io handles real-time game state sync between players
- Game engine runs server-side (hooks.server.ts for dev, server.js for production)