import type { Handle } from '@sveltejs/kit';
import { Server } from 'socket.io';
import {
  createGame, getPlayerView, getSpectatorView,
  playNormalMove, initiateSacrifice, completeSacrifice, cancelSacrifice,
  type GameState, type Player
} from '$lib/game.js';

// Global state — persists across hot reloads
declare global {
  var __io: Server | undefined;
  var __gameState: GameState | undefined;
}

let io = globalThis.__io;
let gameState = globalThis.__gameState || createGame();

if (!globalThis.__gameState) {
  globalThis.__gameState = gameState;
}

function broadcastState() {
  if (!io) return;
  io.to('white').emit('playerState', getPlayerView(gameState, 'white'));
  io.to('black').emit('playerState', getPlayerView(gameState, 'black'));
  io.to('spectator').emit('spectatorState', getSpectatorView(gameState));
}

function setupSocketHandlers() {
  if (!io) return;

  io.on('connection', (socket) => {
    console.log(`[DreamChess] Connected: ${socket.id}`);

    socket.on('join', (role: 'white' | 'black' | 'spectator') => {
      socket.join(role);

      if (role === 'white') {
        gameState.whiteClaimed = true;
      } else if (role === 'black') {
        gameState.blackClaimed = true;
      }

      if (gameState.whiteClaimed && gameState.blackClaimed && gameState.status === 'waiting') {
        gameState.status = 'playing';
        console.log('[DreamChess] Game started!');
      }

      broadcastState();
    });

    socket.on('normalMove', (data: { player: Player; fromR: number; fromC: number; toR: number; toC: number; promotion?: string }) => {
      const result = playNormalMove(
        gameState, data.player,
        data.fromR, data.fromC, data.toR, data.toC,
        data.promotion as 'Q' | 'R' | 'B' | 'N' | undefined
      );
      if (result.success) {
        broadcastState();
      } else {
        socket.emit('error', result.error);
      }
    });

    socket.on('initiateSacrifice', (data: { player: Player; traitorR: number; traitorC: number }) => {
      const result = initiateSacrifice(gameState, data.player, data.traitorR, data.traitorC);
      if (result.success) {
        broadcastState();
      } else {
        socket.emit('error', result.error);
      }
    });

    socket.on('completeSacrifice', (data: { player: Player; removedR: number; removedC: number }) => {
      const result = completeSacrifice(gameState, data.player, data.removedR, data.removedC);
      if (result.success) {
        broadcastState();
      } else {
        socket.emit('error', result.error);
      }
    });

    socket.on('cancelSacrifice', (data: { player: Player }) => {
      const result = cancelSacrifice(gameState, data.player);
      if (result.success) {
        broadcastState();
      } else {
        socket.emit('error', result.error);
      }
    });

    socket.on('newGame', () => {
      console.log('[DreamChess] New game!');
      gameState = createGame();
      globalThis.__gameState = gameState;
      gameState.status = 'playing';
      broadcastState();
    });

    socket.on('disconnect', () => {
      console.log(`[DreamChess] Disconnected: ${socket.id}`);
    });
  });
}

export const handle: Handle = async ({ event, resolve }) => {
  // Initialize Socket.io on first request (dev mode — attach to Vite's HTTP server)
  if (!io) {
    // @ts-ignore - SvelteKit dev server exposes httpServer
    const httpServer = event.platform?.devServer?.httpServer;
    if (httpServer) {
      io = new Server(httpServer, {
        cors: { origin: '*' },
        path: '/socket.io'
      });
      globalThis.__io = io;
      setupSocketHandlers();
      console.log('[DreamChess] Socket.io attached to dev server');
    }
  }

  return resolve(event);
};