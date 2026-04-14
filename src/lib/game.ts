// DreamChess — Traitor Sacrifice Chess
// Normal chess, but when you're behind on material, your own pieces that
// could capture your own king (if they weren't the same color) become "traitors"
// — sacrifice one to remove any opponent piece (except king).

export type Player = 'white' | 'black';
export type GameStatus = 'waiting' | 'playing' | 'finished';
export type MoveType = 'normal' | 'sacrifice';

export interface Move {
  player: Player;
  type: MoveType;
  description: string;
  moveNumber: number;
  from?: string;
  to?: string;
  sacrificedPiece?: string;  // e.g. "wN" — the traitor that was sacrificed
  removedPiece?: string;     // e.g. "bQ" — the opponent piece removed
  removedFrom?: string;      // square where removed piece was
}

export type BoardCell = string | null; // 'wK', 'bP', etc. or null
export type Board = BoardCell[][];

export interface GameState {
  board: Board;
  turn: Player;
  moveLog: Move[];
  status: GameStatus;
  winner: Player | null;
  whiteClaimed: boolean;
  blackClaimed: boolean;
  castling: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  enPassantTarget: [number, number] | null;
  // Track if we're mid-sacrifice: player has sacrificed a traitor, now picking opponent piece
  sacrificeInProgress: { player: Player; traitorPos: [number, number] } | null;
}

// --- Constants ---

export const FILES_ARR = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS_ARR = ['8', '7', '6', '5', '4', '3', '2', '1'];

export const CODE_TO_PIECE: Record<string, string> = {
  K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn',
};

const PIECE_TO_CODE: Record<string, string> = {
  King: 'K', Queen: 'Q', Rook: 'R', Bishop: 'B', Knight: 'N', Pawn: 'P',
};

export const PIECE_VALUES: Record<string, number> = {
  P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0,
};

// --- Board ---

export function makeStartingBoard(): Board {
  return [
    ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
    ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
    ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'],
  ];
}

function cloneBoard(board: Board): Board {
  return board.map(row => [...row]);
}

export function squareToIndices(file: string, rank: string): [number, number] {
  const col = FILES_ARR.indexOf(file);
  const row = RANKS_ARR.indexOf(rank);
  return [row, col];
}

export function indicesToSquare(row: number, col: number): string {
  return `${FILES_ARR[col]}${RANKS_ARR[row]}`;
}

// --- Game Init ---

export function createGame(): GameState {
  return {
    board: makeStartingBoard(),
    turn: 'white',
    moveLog: [],
    status: 'waiting',
    winner: null,
    whiteClaimed: false,
    blackClaimed: false,
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassantTarget: null,
    sacrificeInProgress: null,
  };
}

// --- Path checking ---

function isPathClear(board: Board, fromR: number, fromC: number, toR: number, toC: number): boolean {
  const dr = Math.sign(toR - fromR);
  const dc = Math.sign(toC - fromC);
  let r = fromR + dr;
  let c = fromC + dc;
  while (r !== toR || c !== toC) {
    if (board[r][c] !== null) return false;
    r += dr;
    c += dc;
  }
  return true;
}

// --- Piece movement (raw — does NOT check king safety) ---

function canPieceMove(board: Board, pieceCode: string, fromR: number, fromC: number, toR: number, toC: number, enPassantTarget?: [number, number] | null): boolean {
  const pieceType = pieceCode[1]; // K, Q, R, B, N, P
  const color = pieceCode[0];    // w or b
  const target = board[toR][toC];

  // Can't move to same square
  if (fromR === toR && fromC === toC) return false;

  // Can't capture own piece (for normal moves)
  if (target && target[0] === color) return false;

  const dr = toR - fromR;
  const dc = toC - fromC;
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);

  switch (pieceType) {
    case 'K':
      return absDr <= 1 && absDc <= 1 && (absDr + absDc > 0);

    case 'Q':
      if (absDr === 0 || absDc === 0 || absDr === absDc)
        return isPathClear(board, fromR, fromC, toR, toC);
      return false;

    case 'R':
      if (absDr === 0 || absDc === 0)
        return isPathClear(board, fromR, fromC, toR, toC);
      return false;

    case 'B':
      if (absDr === absDc && absDr > 0)
        return isPathClear(board, fromR, fromC, toR, toC);
      return false;

    case 'N':
      return (absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2);

    case 'P': {
      const direction = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;

      // Forward move (no capture)
      if (dc === 0 && target === null) {
        if (dr === direction) return true;
        if (dr === 2 * direction && fromR === startRow && board[fromR + direction][fromC] === null) return true;
      }
      // Capture (diagonal)
      if (absDc === 1 && dr === direction && target !== null && target[0] !== color) {
        return true;
      }
      // En passant
      if (enPassantTarget && absDc === 1 && dr === direction && target === null
          && toR === enPassantTarget[0] && toC === enPassantTarget[1]) {
        return true;
      }
      return false;
    }

    default:
      return false;
  }
}

// --- Check Detection ---

export function isInCheck(board: Board, player: Player): boolean {
  const color = player === 'white' ? 'w' : 'b';
  const opponentColor = player === 'white' ? 'b' : 'w';
  const kingCode = `${color}K`;

  // Find king
  let kingR = -1, kingC = -1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === kingCode) {
        kingR = r; kingC = c; break;
      }
    }
    if (kingR !== -1) break;
  }
  if (kingR === -1) return false;

  // Check if any opponent piece attacks the king
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell[0] === opponentColor) {
        if (canPieceMove(board, cell, r, c, kingR, kingC)) {
          return true;
        }
      }
    }
  }
  return false;
}

// Does a normal move leave the player's king safe?
function isNormalMoveSafe(board: Board, player: Player, fromR: number, fromC: number, toR: number, toC: number, enPassantTarget?: [number, number] | null): boolean {
  const testBoard = cloneBoard(board);
  const piece = testBoard[fromR][fromC];
  testBoard[toR][toC] = piece;
  testBoard[fromR][fromC] = null;

  // En passant: also remove the captured pawn
  if (piece && piece[1] === 'P' && enPassantTarget
      && toR === enPassantTarget[0] && toC === enPassantTarget[1]
      && board[toR][toC] === null) {
    testBoard[fromR][toC] = null;
  }

  return !isInCheck(testBoard, player);
}

// --- Legal normal moves ---

export function getLegalNormalMoves(board: Board, player: Player, fromR: number, fromC: number, gameState?: GameState): [number, number][] {
  const cell = board[fromR][fromC];
  if (!cell) return [];
  const color = player === 'white' ? 'w' : 'b';
  if (cell[0] !== color) return [];

  const epTarget = gameState?.enPassantTarget ?? null;
  const moves: [number, number][] = [];

  for (let toR = 0; toR < 8; toR++) {
    for (let toC = 0; toC < 8; toC++) {
      if (canPieceMove(board, cell, fromR, fromC, toR, toC, epTarget)) {
        if (isNormalMoveSafe(board, player, fromR, fromC, toR, toC, epTarget)) {
          moves.push([toR, toC]);
        }
      }
    }
  }

  // Castling
  if (cell[1] === 'K' && gameState && !isInCheck(board, player)) {
    const castling = gameState.castling;
    const row = color === 'w' ? 7 : 0;
    if (fromR === row && fromC === 4) {
      // Kingside
      const kKey = color === 'w' ? 'wK' : 'bK';
      if (castling[kKey as keyof typeof castling]
          && board[row][5] === null && board[row][6] === null
          && board[row][7] === `${color}R`) {
        if (isNormalMoveSafe(board, player, fromR, fromC, row, 5)
            && isNormalMoveSafe(board, player, fromR, fromC, row, 6)) {
          moves.push([row, 6]);
        }
      }
      // Queenside
      const qKey = color === 'w' ? 'wQ' : 'bQ';
      if (castling[qKey as keyof typeof castling]
          && board[row][3] === null && board[row][2] === null && board[row][1] === null
          && board[row][0] === `${color}R`) {
        if (isNormalMoveSafe(board, player, fromR, fromC, row, 3)
            && isNormalMoveSafe(board, player, fromR, fromC, row, 2)) {
          moves.push([row, 2]);
        }
      }
    }
  }

  return moves;
}

// --- Material counting ---

export function getMaterialValue(board: Board, player: Player): number {
  const color = player === 'white' ? 'w' : 'b';
  let total = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell[0] === color) {
        total += PIECE_VALUES[cell[1]] || 0;
      }
    }
  }
  return total;
}

export function isBehindOnMaterial(board: Board, player: Player): boolean {
  const opponent: Player = player === 'white' ? 'black' : 'white';
  return getMaterialValue(board, player) < getMaterialValue(board, opponent);
}

// --- Traitor detection ---
// A piece is a "traitor" if it could capture its own king (if it were the opponent's color)
// We check: can this piece attack the king's square, ignoring the same-color restriction?

export function getTraitorPieces(board: Board, player: Player): [number, number][] {
  if (!isBehindOnMaterial(board, player)) return [];

  const color = player === 'white' ? 'w' : 'b';
  const kingCode = `${color}K`;

  // Find king position
  let kingR = -1, kingC = -1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === kingCode) {
        kingR = r; kingC = c; break;
      }
    }
    if (kingR !== -1) break;
  }
  if (kingR === -1) return [];

  // Check each of player's pieces: could they capture the king if it were opponent's?
  const traitors: [number, number][] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (!cell || cell[0] !== color || cell[1] === 'K') continue; // Skip king itself

      // Check if this piece could attack the king square
      // We temporarily modify the board: pretend the king is an opponent piece
      // so canPieceMove doesn't reject it as "same color"
      const testBoard = cloneBoard(board);
      testBoard[kingR][kingC] = `xK`; // fake opponent king

      // For the attacking piece, we need it to see xK as a valid capture target
      // canPieceMove checks target[0] !== color. 'x' !== color, so it'll work.
      if (canPieceMove(testBoard, `${color}${cell[1]}`, r, c, kingR, kingC)) {
        traitors.push([r, c]);
      }
    }
  }

  return traitors;
}

// --- Sacrifice logic ---

// Can the player perform a sacrifice? Returns true if:
// 1. Player is behind on material
// 2. Player has traitor pieces
// 3. Either not in check, or the sacrifice would resolve check
//    (removing the checking piece OR the traitor itself was attacking the king)
export function canSacrifice(state: GameState, player: Player): boolean {
  if (state.sacrificeInProgress) return false; // Already mid-sacrifice
  if (!isBehindOnMaterial(state.board, player)) return false;
  const traitors = getTraitorPieces(state.board, player);
  return traitors.length > 0;
}

// Get opponent pieces that can be removed via sacrifice (anything except king)
export function getRemovablePieces(board: Board, player: Player): [number, number][] {
  const opponentColor = player === 'white' ? 'b' : 'w';
  const result: [number, number][] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell[0] === opponentColor && cell[1] !== 'K') {
        result.push([r, c]);
      }
    }
  }
  return result;
}

// Check if a sacrifice resolves check (the removed piece must be the attacker, 
// or removing the traitor must stop the check)
function doesSacrificeResolveCheck(board: Board, player: Player, traitorR: number, traitorC: number, removedR: number, removedC: number): boolean {
  const testBoard = cloneBoard(board);
  testBoard[traitorR][traitorC] = null;  // Remove traitor
  testBoard[removedR][removedC] = null;  // Remove opponent piece
  return !isInCheck(testBoard, player);
}

// --- Checkmate Detection ---

export function isCheckmate(state: GameState, player: Player): boolean {
  if (!isInCheck(state.board, player)) return false;

  const color = player === 'white' ? 'w' : 'b';

  // 1. Can any normal move escape check?
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = state.board[r][c];
      if (!cell || cell[0] !== color) continue;
      if (getLegalNormalMoves(state.board, player, r, c, state).length > 0) {
        return false;
      }
    }
  }

  // 2. Can a sacrifice escape check?
  if (canSacrifice(state, player)) {
    const traitors = getTraitorPieces(state.board, player);
    const removable = getRemovablePieces(state.board, player);
    for (const [tr, tc] of traitors) {
      for (const [rr, rc] of removable) {
        if (doesSacrificeResolveCheck(state.board, player, tr, tc, rr, rc)) {
          return false;
        }
      }
    }
  }

  return true;
}

// --- Normal Move Execution ---

export interface MoveResult {
  success: boolean;
  error?: string;
}

export function playNormalMove(
  state: GameState,
  player: Player,
  fromR: number, fromC: number,
  toR: number, toC: number,
  promotionPiece?: 'Q' | 'R' | 'B' | 'N'
): MoveResult {
  if (state.status !== 'playing') return { success: false, error: 'Game not in progress' };
  if (state.turn !== player) return { success: false, error: 'Not your turn' };
  if (state.sacrificeInProgress) return { success: false, error: 'Sacrifice in progress — pick a piece to remove' };

  const color = player === 'white' ? 'w' : 'b';
  const opponent: Player = player === 'white' ? 'black' : 'white';
  const cell = state.board[fromR][fromC];
  if (!cell || cell[0] !== color) return { success: false, error: 'Not your piece' };

  // Validate legal move
  const legalMoves = getLegalNormalMoves(state.board, player, fromR, fromC, state);
  if (!legalMoves.some(([r, c]) => r === toR && c === toC)) {
    return { success: false, error: 'Not a legal move' };
  }

  // Execute move
  let captured = state.board[toR][toC];
  state.board[toR][toC] = cell;
  state.board[fromR][fromC] = null;

  // En passant capture
  let enPassantCapture = false;
  if (cell[1] === 'P' && state.enPassantTarget
      && toR === state.enPassantTarget[0] && toC === state.enPassantTarget[1]
      && captured === null) {
    captured = state.board[fromR][toC];
    state.board[fromR][toC] = null;
    enPassantCapture = true;
  }

  // Castling: move the rook
  let castleDesc = '';
  if (cell[1] === 'K' && Math.abs(toC - fromC) === 2) {
    const row = fromR;
    if (toC === 6) {
      state.board[row][5] = state.board[row][7];
      state.board[row][7] = null;
      castleDesc = ' (O-O)';
    } else if (toC === 2) {
      state.board[row][3] = state.board[row][0];
      state.board[row][0] = null;
      castleDesc = ' (O-O-O)';
    }
  }

  // Pawn promotion
  let promotionDesc = '';
  if (cell[1] === 'P') {
    const promoRow = color === 'w' ? 0 : 7;
    if (toR === promoRow) {
      const promo = promotionPiece || 'Q';
      state.board[toR][toC] = `${color}${promo}`;
      promotionDesc = `=${promo}`;
    }
  }

  // Update en passant target
  if (cell[1] === 'P' && Math.abs(toR - fromR) === 2) {
    state.enPassantTarget = [(fromR + toR) / 2, fromC];
  } else {
    state.enPassantTarget = null;
  }

  // Update castling rights
  if (cell[1] === 'K') {
    if (color === 'w') { state.castling.wK = false; state.castling.wQ = false; }
    else { state.castling.bK = false; state.castling.bQ = false; }
  }
  if (cell[1] === 'R') {
    if (color === 'w' && fromR === 7 && fromC === 0) state.castling.wQ = false;
    if (color === 'w' && fromR === 7 && fromC === 7) state.castling.wK = false;
    if (color === 'b' && fromR === 0 && fromC === 0) state.castling.bQ = false;
    if (color === 'b' && fromR === 0 && fromC === 7) state.castling.bK = false;
  }
  if (captured) {
    if (toR === 7 && toC === 0) state.castling.wQ = false;
    if (toR === 7 && toC === 7) state.castling.wK = false;
    if (toR === 0 && toC === 0) state.castling.bQ = false;
    if (toR === 0 && toC === 7) state.castling.bK = false;
  }

  // Build description
  const fromSq = indicesToSquare(fromR, fromC);
  const toSq = indicesToSquare(toR, toC);
  const pieceName = CODE_TO_PIECE[cell[1]];
  let desc = `${pieceName} ${fromSq}→${toSq}${castleDesc}${promotionDesc}`;
  if (captured) {
    const capturedName = CODE_TO_PIECE[captured[1]];
    desc += enPassantCapture ? ` ✕ ${capturedName} e.p.` : ` ✕ ${capturedName}`;
  }

  // Switch turn
  state.turn = opponent;

  // Check detection
  if (isInCheck(state.board, opponent)) {
    desc += ' +CHECK';
  }

  // Log the move
  const moveNumber = state.moveLog.length + 1;
  const move: Move = {
    player,
    type: 'normal',
    description: desc,
    moveNumber,
    from: fromSq,
    to: toSq,
  };
  state.moveLog.push(move);

  // Checkmate check
  if (isCheckmate(state, opponent)) {
    state.status = 'finished';
    state.winner = player;
    move.description = move.description.replace('CHECK', 'CHECKMATE');
  }

  return { success: true };
}

// --- Sacrifice Move Execution ---

// Step 1: Initiate sacrifice — select a traitor piece to sacrifice
export function initiateSacrifice(state: GameState, player: Player, traitorR: number, traitorC: number): MoveResult {
  if (state.status !== 'playing') return { success: false, error: 'Game not in progress' };
  if (state.turn !== player) return { success: false, error: 'Not your turn' };
  if (state.sacrificeInProgress) return { success: false, error: 'Sacrifice already in progress' };

  const color = player === 'white' ? 'w' : 'b';
  const cell = state.board[traitorR][traitorC];
  if (!cell || cell[0] !== color || cell[1] === 'K') return { success: false, error: 'Not a valid traitor piece' };

  // Must be behind on material
  if (!isBehindOnMaterial(state.board, player)) return { success: false, error: 'Not behind on material' };

  // Must be a traitor piece
  const traitors = getTraitorPieces(state.board, player);
  if (!traitors.some(([r, c]) => r === traitorR && c === traitorC)) {
    return { success: false, error: 'That piece is not a traitor' };
  }

  // If in check, verify this sacrifice can resolve it
  if (isInCheck(state.board, player)) {
    const removable = getRemovablePieces(state.board, player);
    const canResolve = removable.some(([rr, rc]) =>
      doesSacrificeResolveCheck(state.board, player, traitorR, traitorC, rr, rc)
    );
    if (!canResolve) {
      return { success: false, error: 'This sacrifice cannot resolve check — pick another traitor or move' };
    }
  }

  state.sacrificeInProgress = { player, traitorPos: [traitorR, traitorC] };
  return { success: true };
}

// Step 2: Complete sacrifice — select opponent piece to remove
export function completeSacrifice(state: GameState, player: Player, removedR: number, removedC: number): MoveResult {
  if (state.status !== 'playing') return { success: false, error: 'Game not in progress' };
  if (!state.sacrificeInProgress) return { success: false, error: 'No sacrifice in progress' };
  if (state.sacrificeInProgress.player !== player) return { success: false, error: 'Not your sacrifice' };

  const opponent: Player = player === 'white' ? 'black' : 'white';
  const opponentColor = player === 'white' ? 'b' : 'w';
  const removedCell = state.board[removedR][removedC];

  // Validate target
  if (!removedCell || removedCell[0] !== opponentColor) return { success: false, error: 'Not an opponent piece' };
  if (removedCell[1] === 'K') return { success: false, error: 'Cannot remove the king' };

  const [traitorR, traitorC] = state.sacrificeInProgress.traitorPos;
  const traitorCell = state.board[traitorR][traitorC];

  // If in check, verify sacrifice resolves it
  if (isInCheck(state.board, player)) {
    if (!doesSacrificeResolveCheck(state.board, player, traitorR, traitorC, removedR, removedC)) {
      return { success: false, error: 'This sacrifice does not resolve check' };
    }
  }

  // Execute sacrifice
  state.board[traitorR][traitorC] = null;   // Remove traitor
  state.board[removedR][removedC] = null;   // Remove opponent piece

  const traitorName = traitorCell ? CODE_TO_PIECE[traitorCell[1]] : '?';
  const removedName = CODE_TO_PIECE[removedCell[1]];
  const traitorSq = indicesToSquare(traitorR, traitorC);
  const removedSq = indicesToSquare(removedR, removedC);

  // Clear en passant after sacrifice
  state.enPassantTarget = null;

  // Clear sacrifice state
  state.sacrificeInProgress = null;

  // Switch turn
  state.turn = opponent;

  // Build description
  let desc = `💀 ${traitorName} sacrificed → removed ${removedName} from ${removedSq}`;

  // Check detection on opponent
  if (isInCheck(state.board, opponent)) {
    desc += ' +CHECK';
  }

  // Log
  const moveNumber = state.moveLog.length + 1;
  const move: Move = {
    player,
    type: 'sacrifice',
    description: desc,
    moveNumber,
    from: traitorSq,
    to: removedSq,
    sacrificedPiece: traitorCell || undefined,
    removedPiece: removedCell,
    removedFrom: removedSq,
  };
  state.moveLog.push(move);

  // Checkmate check
  if (isCheckmate(state, opponent)) {
    state.status = 'finished';
    state.winner = player;
    move.description = move.description.replace('CHECK', 'CHECKMATE');
  }

  return { success: true };
}

// Cancel an in-progress sacrifice
export function cancelSacrifice(state: GameState, player: Player): MoveResult {
  if (!state.sacrificeInProgress) return { success: false, error: 'No sacrifice in progress' };
  if (state.sacrificeInProgress.player !== player) return { success: false, error: 'Not your sacrifice' };

  state.sacrificeInProgress = null;
  return { success: true };
}

// --- Get public state for a player ---

export interface PublicGameState {
  board: Board;
  turn: Player;
  player: Player;
  moveLog: Move[];
  status: GameStatus;
  winner: Player | null;
  whiteClaimed: boolean;
  blackClaimed: boolean;
  castling: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  enPassantTarget: [number, number] | null;
  sacrificeInProgress: { player: Player; traitorPos: [number, number] } | null;
  myMaterial: number;
  opponentMaterial: number;
  isBehind: boolean;
  traitorPieces: [number, number][];
  removablePieces: [number, number][];
  inCheck: boolean;
  canSacrificeNow: boolean;
}

export function getPlayerView(state: GameState, player: Player): PublicGameState {
  const opponent: Player = player === 'white' ? 'black' : 'white';
  const myMat = getMaterialValue(state.board, player);
  const oppMat = getMaterialValue(state.board, opponent);
  const behind = isBehindOnMaterial(state.board, player);
  const traitors = behind ? getTraitorPieces(state.board, player) : [];
  const canSac = canSacrifice(state, player);

  return {
    board: state.board,
    turn: state.turn,
    player,
    moveLog: state.moveLog,
    status: state.status,
    winner: state.winner,
    whiteClaimed: state.whiteClaimed,
    blackClaimed: state.blackClaimed,
    castling: { ...state.castling },
    enPassantTarget: state.enPassantTarget,
    sacrificeInProgress: state.sacrificeInProgress,
    myMaterial: myMat,
    opponentMaterial: oppMat,
    isBehind: behind,
    traitorPieces: traitors,
    removablePieces: (canSac || state.sacrificeInProgress?.player === player)
      ? getRemovablePieces(state.board, player) : [],
    inCheck: isInCheck(state.board, player),
    canSacrificeNow: canSac,
  };
}

// --- Spectator view ---

export interface SpectatorViewState {
  board: Board;
  turn: Player;
  moveLog: Move[];
  status: GameStatus;
  winner: Player | null;
  whiteClaimed: boolean;
  blackClaimed: boolean;
  whiteMaterial: number;
  blackMaterial: number;
  sacrificeInProgress: { player: Player; traitorPos: [number, number] } | null;
}

export function getSpectatorView(state: GameState): SpectatorViewState {
  return {
    board: state.board,
    turn: state.turn,
    moveLog: state.moveLog,
    status: state.status,
    winner: state.winner,
    whiteClaimed: state.whiteClaimed,
    blackClaimed: state.blackClaimed,
    whiteMaterial: getMaterialValue(state.board, 'white'),
    blackMaterial: getMaterialValue(state.board, 'black'),
    sacrificeInProgress: state.sacrificeInProgress,
  };
}