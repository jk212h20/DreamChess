// DreamChess — Production server with Socket.io + SQLite persistence
import { createServer } from 'http';
import { Server } from 'socket.io';
import { handler } from './build/handler.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import initSqlJs from 'sql.js';

const PORT = parseInt(process.env.PORT || '3000');

// --- SQLite Setup ---
const DATA_DIR = process.env.DATABASE_PATH
  ? join(process.env.DATABASE_PATH, '..')
  : (existsSync('/app/data') ? '/app/data' : './data');
const DB_PATH = process.env.DATABASE_PATH || join(DATA_DIR, 'dreamchess.db');

mkdirSync(DATA_DIR, { recursive: true });

let SQL, db;

async function initDb() {
  SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const data = readFileSync(DB_PATH);
    db = new SQL.Database(data);
    console.log(`[DreamChess] Loaded existing DB from ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    console.log(`[DreamChess] Created new DB at ${DB_PATH}`);
  }
  db.run(`CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    winner TEXT,
    move_count INTEGER,
    moves_json TEXT,
    final_board TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS game_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  saveDb();
}

function saveDb() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

function saveGameState(gs) {
  const now = new Date().toISOString();
  const json = JSON.stringify(gs);
  const exists = db.exec('SELECT id FROM game_state WHERE id = 1');
  if (exists.length && exists[0].values.length) {
    db.run('UPDATE game_state SET state_json = ?, updated_at = ? WHERE id = 1', [json, now]);
  } else {
    db.run('INSERT INTO game_state (id, state_json, updated_at) VALUES (1, ?, ?)', [json, now]);
  }
  saveDb();
}

function loadSavedGameState() {
  try {
    const res = db.exec('SELECT state_json FROM game_state WHERE id = 1');
    if (res.length && res[0].values.length) {
      const gs = JSON.parse(res[0].values[0][0]);
      console.log('[DreamChess] Resumed game state from DB');
      return gs;
    }
  } catch (e) {
    console.error('[DreamChess] Failed to load game state:', e.message);
  }
  return null;
}

function recordCompletedGame(gs) {
  if (!gs.gameStartedAt) return;
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO games (started_at, finished_at, winner, move_count, moves_json, final_board) VALUES (?, ?, ?, ?, ?, ?)',
    [gs.gameStartedAt, now, gs.winner || null, gs.moveLog.length, JSON.stringify(gs.moveLog), JSON.stringify(gs.board)]
  );
  saveDb();
  console.log(`[DreamChess] Game recorded: ${gs.winner || 'draw'} after ${gs.moveLog.length} moves`);
}

// Inline game logic
const PIECE_VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
const CODE_TO_PIECE = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };
const FILES_ARR = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS_ARR = ['8', '7', '6', '5', '4', '3', '2', '1'];

function indicesToSquare(r, c) { return `${FILES_ARR[c]}${RANKS_ARR[r]}`; }
function cloneBoard(b) { return b.map(row => [...row]); }

function makeStartingBoard() {
  return [
    ['bR','bN','bB','bQ','bK','bB','bN','bR'],
    ['bP','bP','bP','bP','bP','bP','bP','bP'],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ['wP','wP','wP','wP','wP','wP','wP','wP'],
    ['wR','wN','wB','wQ','wK','wB','wN','wR'],
  ];
}

function isPathClear(board, fr, fc, tr, tc) {
  const dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
  let r = fr + dr, c = fc + dc;
  while (r !== tr || c !== tc) { if (board[r][c]) return false; r += dr; c += dc; }
  return true;
}

function canPieceMove(board, pc, fr, fc, tr, tc, ep) {
  const pt = pc[1], col = pc[0], tgt = board[tr][tc];
  if (fr === tr && fc === tc) return false;
  if (tgt && tgt[0] === col) return false;
  const dr = tr-fr, dc = tc-fc, adr = Math.abs(dr), adc = Math.abs(dc);
  switch(pt) {
    case 'K': return adr <= 1 && adc <= 1 && (adr+adc > 0);
    case 'Q': return (adr===0||adc===0||adr===adc) && isPathClear(board,fr,fc,tr,tc);
    case 'R': return (adr===0||adc===0) && isPathClear(board,fr,fc,tr,tc);
    case 'B': return adr===adc && adr>0 && isPathClear(board,fr,fc,tr,tc);
    case 'N': return (adr===2&&adc===1)||(adr===1&&adc===2);
    case 'P': {
      const dir = col==='w'?-1:1, start = col==='w'?6:1;
      if (dc===0 && !tgt) { if (dr===dir) return true; if (dr===2*dir && fr===start && !board[fr+dir][fc]) return true; }
      if (adc===1 && dr===dir && tgt && tgt[0]!==col) return true;
      if (ep && adc===1 && dr===dir && !tgt && tr===ep[0] && tc===ep[1]) return true;
      return false;
    }
    default: return false;
  }
}

function isInCheck(board, player) {
  const c = player==='white'?'w':'b', oc = player==='white'?'b':'w';
  let kr=-1, kc=-1;
  for (let r=0;r<8;r++) for (let cc=0;cc<8;cc++) if (board[r][cc]===`${c}K`) { kr=r; kc=cc; break; }
  if (kr===-1) return false;
  for (let r=0;r<8;r++) for (let cc=0;cc<8;cc++) { const cell=board[r][cc]; if (cell&&cell[0]===oc&&canPieceMove(board,cell,r,cc,kr,kc)) return true; }
  return false;
}

function isMoveSafe(board, player, fr, fc, tr, tc, ep) {
  const tb = cloneBoard(board); const p = tb[fr][fc]; tb[tr][tc]=p; tb[fr][fc]=null;
  if (p&&p[1]==='P'&&ep&&tr===ep[0]&&tc===ep[1]&&!board[tr][tc]) tb[fr][tc]=null;
  return !isInCheck(tb, player);
}

function getLegalMoves(board, player, fr, fc, gs) {
  const cell=board[fr][fc]; if(!cell) return [];
  const c=player==='white'?'w':'b'; if(cell[0]!==c) return [];
  const ep=gs?.enPassantTarget||null, moves=[];
  for(let tr=0;tr<8;tr++) for(let tc=0;tc<8;tc++) if(canPieceMove(board,cell,fr,fc,tr,tc,ep)&&isMoveSafe(board,player,fr,fc,tr,tc,ep)) moves.push([tr,tc]);
  if(cell[1]==='K'&&gs&&!isInCheck(board,player)) {
    const row=c==='w'?7:0;
    if(fr===row&&fc===4) {
      if(gs.castling[`${c}K`]&&!board[row][5]&&!board[row][6]&&board[row][7]===`${c}R`&&isMoveSafe(board,player,fr,fc,row,5)&&isMoveSafe(board,player,fr,fc,row,6)) moves.push([row,6]);
      if(gs.castling[`${c}Q`]&&!board[row][3]&&!board[row][2]&&!board[row][1]&&board[row][0]===`${c}R`&&isMoveSafe(board,player,fr,fc,row,3)&&isMoveSafe(board,player,fr,fc,row,2)) moves.push([row,2]);
    }
  }
  return moves;
}

function getMaterial(board, player) {
  const c=player==='white'?'w':'b'; let t=0;
  for(let r=0;r<8;r++) for(let cc=0;cc<8;cc++) { const cell=board[r][cc]; if(cell&&cell[0]===c) t+=PIECE_VALUES[cell[1]]||0; }
  return t;
}

function isBehind(board, player) {
  return getMaterial(board,player) < getMaterial(board, player==='white'?'black':'white');
}

function getTraitors(board, player) {
  if(!isBehind(board,player)) return [];
  const c=player==='white'?'w':'b'; let kr=-1,kc=-1;
  for(let r=0;r<8;r++) for(let cc=0;cc<8;cc++) if(board[r][cc]===`${c}K`) { kr=r; kc=cc; }
  if(kr===-1) return [];
  const res=[];
  for(let r=0;r<8;r++) for(let cc=0;cc<8;cc++) {
    const cell=board[r][cc]; if(!cell||cell[0]!==c||cell[1]==='K') continue;
    const tb=cloneBoard(board); tb[kr][kc]='xK';
    if(canPieceMove(tb,`${c}${cell[1]}`,r,cc,kr,kc)) res.push([r,cc]);
  }
  return res;
}

function getRemovable(board, player) {
  const oc=player==='white'?'b':'w'; const res=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) { const cell=board[r][c]; if(cell&&cell[0]===oc&&cell[1]!=='K') res.push([r,c]); }
  return res;
}

function doesSacResolve(board, player, tr, tc, rr, rc) {
  const tb=cloneBoard(board); tb[tr][tc]=null; tb[rr][rc]=null; return !isInCheck(tb,player);
}

function isCheckmate(gs, player) {
  if(!isInCheck(gs.board,player)) return false;
  const c=player==='white'?'w':'b';
  for(let r=0;r<8;r++) for(let cc=0;cc<8;cc++) {
    const cell=gs.board[r][cc];
    if(cell&&cell[0]===c&&getLegalMoves(gs.board,player,r,cc,gs).length>0) return false;
  }
  if(isBehind(gs.board,player)) {
    const traitors=getTraitors(gs.board,player), rem=getRemovable(gs.board,player);
    for(const[tr,tc] of traitors) for(const[rr,rc] of rem) if(doesSacResolve(gs.board,player,tr,tc,rr,rc)) return false;
  }
  return true;
}

function createGame() {
  return {
    board: makeStartingBoard(),
    turn: 'white',
    moveLog: [],
    status: 'waiting',
    winner: null,
    whiteClaimed: false,
    blackClaimed: false,
    castling: { wK:true, wQ:true, bK:true, bQ:true },
    enPassantTarget: null,
    sacrificeInProgress: null,
    gameStartedAt: null,
  };
}

function getPlayerView(gs, player) {
  const opp=player==='white'?'black':'white';
  const myMat=getMaterial(gs.board,player), oppMat=getMaterial(gs.board,opp);
  const behind=isBehind(gs.board,player), traitors=behind?getTraitors(gs.board,player):[];
  const canSac=!gs.sacrificeInProgress&&behind&&traitors.length>0;
  return {
    board: gs.board, turn: gs.turn, player, moveLog: gs.moveLog, status: gs.status,
    winner: gs.winner, whiteClaimed: gs.whiteClaimed, blackClaimed: gs.blackClaimed,
    castling: {...gs.castling}, enPassantTarget: gs.enPassantTarget,
    sacrificeInProgress: gs.sacrificeInProgress, myMaterial: myMat, opponentMaterial: oppMat,
    isBehind: behind, traitorPieces: traitors,
    removablePieces: (canSac||gs.sacrificeInProgress?.player===player)?getRemovable(gs.board,player):[],
    inCheck: isInCheck(gs.board,player), canSacrificeNow: canSac,
  };
}

function getSpectatorView(gs) {
  return {
    board: gs.board, turn: gs.turn, moveLog: gs.moveLog, status: gs.status, winner: gs.winner,
    whiteClaimed: gs.whiteClaimed, blackClaimed: gs.blackClaimed,
    whiteMaterial: getMaterial(gs.board,'white'), blackMaterial: getMaterial(gs.board,'black'),
    sacrificeInProgress: gs.sacrificeInProgress,
  };
}

// --- Server Setup ---
const httpServer = createServer(handler);
const io = new Server(httpServer, { cors: { origin: '*' }, path: '/socket.io' });

let gameState = null;

function broadcast() {
  io.to('white').emit('playerState', getPlayerView(gameState, 'white'));
  io.to('black').emit('playerState', getPlayerView(gameState, 'black'));
  io.to('spectator').emit('spectatorState', getSpectatorView(gameState));
}

await initDb();
gameState = loadSavedGameState() || createGame();

io.on('connection', (socket) => {
  console.log(`[DreamChess] Connected: ${socket.id}`);

  socket.on('join', (role) => {
    socket.join(role);
    if (role === 'white') gameState.whiteClaimed = true;
    if (role === 'black') gameState.blackClaimed = true;
    if (gameState.whiteClaimed && gameState.blackClaimed && gameState.status === 'waiting') {
      gameState.status = 'playing';
      if (!gameState.gameStartedAt) gameState.gameStartedAt = new Date().toISOString();
    }
    saveGameState(gameState);
    broadcast();
  });

  socket.on('normalMove', (d) => {
    if (gameState.status !== 'playing' || gameState.turn !== d.player || gameState.sacrificeInProgress) return;
    const c = d.player==='white'?'w':'b';
    const cell = gameState.board[d.fromR][d.fromC];
    if (!cell || cell[0] !== c) return;
    const legal = getLegalMoves(gameState.board, d.player, d.fromR, d.fromC, gameState);
    if (!legal.some(([r,cc]) => r===d.toR && cc===d.toC)) return;

    let captured = gameState.board[d.toR][d.toC];
    gameState.board[d.toR][d.toC] = cell;
    gameState.board[d.fromR][d.fromC] = null;

    if (cell[1]==='P' && gameState.enPassantTarget && d.toR===gameState.enPassantTarget[0] && d.toC===gameState.enPassantTarget[1] && !captured) {
      captured = gameState.board[d.fromR][d.toC];
      gameState.board[d.fromR][d.toC] = null;
    }

    let castleDesc = '';
    if (cell[1]==='K' && Math.abs(d.toC-d.fromC)===2) {
      if (d.toC===6) { gameState.board[d.fromR][5]=gameState.board[d.fromR][7]; gameState.board[d.fromR][7]=null; castleDesc=' (O-O)'; }
      else if (d.toC===2) { gameState.board[d.fromR][3]=gameState.board[d.fromR][0]; gameState.board[d.fromR][0]=null; castleDesc=' (O-O-O)'; }
    }

    let promoDesc = '';
    if (cell[1]==='P' && (d.toR===(c==='w'?0:7))) {
      const pr = d.promotion || 'Q';
      gameState.board[d.toR][d.toC] = `${c}${pr}`;
      promoDesc = `=${pr}`;
    }

    gameState.enPassantTarget = (cell[1]==='P' && Math.abs(d.toR-d.fromR)===2) ? [(d.fromR+d.toR)/2, d.fromC] : null;

    if (cell[1]==='K') {
      if (c==='w') { gameState.castling.wK=false; gameState.castling.wQ=false; }
      else { gameState.castling.bK=false; gameState.castling.bQ=false; }
    }
    if (cell[1]==='R') {
      if(c==='w'&&d.fromR===7&&d.fromC===0) gameState.castling.wQ=false;
      if(c==='w'&&d.fromR===7&&d.fromC===7) gameState.castling.wK=false;
      if(c==='b'&&d.fromR===0&&d.fromC===0) gameState.castling.bQ=false;
      if(c==='b'&&d.fromR===0&&d.fromC===7) gameState.castling.bK=false;
    }

    const opp = d.player==='white'?'black':'white';
    gameState.turn = opp;

    const fromSq = indicesToSquare(d.fromR,d.fromC), toSq = indicesToSquare(d.toR,d.toC);
    let desc = `${CODE_TO_PIECE[cell[1]]} ${fromSq}→${toSq}${castleDesc}${promoDesc}`;
    if (captured) desc += ` ✕ ${CODE_TO_PIECE[captured[1]]}`;
    if (isInCheck(gameState.board, opp)) desc += ' +CHECK';

    const move = { player:d.player, type:'normal', description:desc, moveNumber:gameState.moveLog.length+1, from:fromSq, to:toSq };
    gameState.moveLog.push(move);

    if (isCheckmate(gameState, opp)) {
      gameState.status = 'finished';
      gameState.winner = d.player;
      move.description = move.description.replace('CHECK','CHECKMATE');
      recordCompletedGame(gameState);
    }
    saveGameState(gameState);
    broadcast();
  });

  socket.on('initiateSacrifice', (d) => {
    if (gameState.status!=='playing'||gameState.turn!==d.player||gameState.sacrificeInProgress) return;
    if (!isBehind(gameState.board,d.player)) return;
    const traitors = getTraitors(gameState.board,d.player);
    if (!traitors.some(([r,c])=>r===d.traitorR&&c===d.traitorC)) return;
    if (isInCheck(gameState.board,d.player)) {
      const rem = getRemovable(gameState.board,d.player);
      if (!rem.some(([rr,rc])=>doesSacResolve(gameState.board,d.player,d.traitorR,d.traitorC,rr,rc))) return;
    }
    gameState.sacrificeInProgress = { player:d.player, traitorPos:[d.traitorR,d.traitorC] };
    saveGameState(gameState);
    broadcast();
  });

  socket.on('completeSacrifice', (d) => {
    if (!gameState.sacrificeInProgress||gameState.sacrificeInProgress.player!==d.player) return;
    const oc = d.player==='white'?'b':'w';
    const cell = gameState.board[d.removedR][d.removedC];
    if (!cell||cell[0]!==oc||cell[1]==='K') return;
    const [tr,tc] = gameState.sacrificeInProgress.traitorPos;
    if (isInCheck(gameState.board,d.player)&&!doesSacResolve(gameState.board,d.player,tr,tc,d.removedR,d.removedC)) return;
    const traitorCell = gameState.board[tr][tc];
    gameState.board[tr][tc] = null;
    gameState.board[d.removedR][d.removedC] = null;
    gameState.enPassantTarget = null;
    gameState.sacrificeInProgress = null;
    const opp = d.player==='white'?'black':'white';
    gameState.turn = opp;
    let desc = `💀 ${traitorCell?CODE_TO_PIECE[traitorCell[1]]:'?'} sacrificed → removed ${CODE_TO_PIECE[cell[1]]} from ${indicesToSquare(d.removedR,d.removedC)}`;
    if (isInCheck(gameState.board,opp)) desc += ' +CHECK';
    const move = { player:d.player, type:'sacrifice', description:desc, moveNumber:gameState.moveLog.length+1 };
    gameState.moveLog.push(move);
    if (isCheckmate(gameState,opp)) {
      gameState.status = 'finished';
      gameState.winner = d.player;
      move.description = move.description.replace('CHECK','CHECKMATE');
      recordCompletedGame(gameState);
    }
    saveGameState(gameState);
    broadcast();
  });

  socket.on('cancelSacrifice', (d) => {
    if (gameState.sacrificeInProgress?.player===d.player) {
      gameState.sacrificeInProgress = null;
      saveGameState(gameState);
      broadcast();
    }
  });

  socket.on('newGame', () => {
    if (gameState.status === 'finished') recordCompletedGame(gameState);
    gameState = createGame();
    gameState.status = 'playing';
    gameState.whiteClaimed = true;
    gameState.blackClaimed = true;
    gameState.gameStartedAt = new Date().toISOString();
    saveGameState(gameState);
    broadcast();
  });

  socket.on('disconnect', () => {
    console.log(`[DreamChess] Disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[DreamChess] Server running on port ${PORT}`);
});