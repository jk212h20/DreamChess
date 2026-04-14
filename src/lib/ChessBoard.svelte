<script lang="ts">
  import type { Player, PublicGameState, SpectatorViewState } from '$lib/game';
  import { CODE_TO_PIECE, FILES_ARR, RANKS_ARR } from '$lib/game';
  import { getLegalNormalMoves } from '$lib/game';

  let {
    state,
    player = 'white' as Player,
    isPlayer = true,
  }: {
    state: PublicGameState | SpectatorViewState | null;
    player?: Player;
    isPlayer?: boolean;
  } = $props();

  let selectedSquare: [number, number] | null = $state(null);
  let legalMoves: [number, number][] = $state([]);
  let promotionChoice: { fromR: number; fromC: number; toR: number; toC: number } | null = $state(null);

  function emit(event: string, data?: any) {
    import('$lib/socket').then(({ getSocket }) => getSocket().emit(event, data));
  }

  const isMyTurn = $derived(isPlayer && state && 'player' in state && state.turn === state.player);
  const sacrificeActive = $derived(isPlayer && state && 'sacrificeInProgress' in state && state.sacrificeInProgress?.player === player);
  const traitorSet = $derived(new Set(
    isPlayer && state && 'traitorPieces' in state
      ? (state.traitorPieces || []).map(([r, c]: [number, number]) => `${r},${c}`)
      : []
  ));
  const removableSet = $derived(new Set(
    isPlayer && state && 'removablePieces' in state
      ? (state.removablePieces || []).map(([r, c]: [number, number]) => `${r},${c}`)
      : []
  ));
  const legalMoveSet = $derived(new Set(legalMoves.map(([r, c]) => `${r},${c}`)));

  function handleSquareClick(r: number, c: number) {
    if (!state || state.status !== 'playing') return;
    if (!isPlayer || !('player' in state)) return;

    const ps = state as PublicGameState;

    // If sacrifice is in progress, clicking an opponent piece completes it
    if (sacrificeActive && removableSet.has(`${r},${c}`)) {
      emit('completeSacrifice', { player: ps.player, removedR: r, removedC: c });
      selectedSquare = null;
      legalMoves = [];
      return;
    }

    // If sacrifice is in progress, clicking elsewhere cancels
    if (sacrificeActive) {
      emit('cancelSacrifice', { player: ps.player });
      selectedSquare = null;
      legalMoves = [];
      return;
    }

    const cell = ps.board[r][c];
    const color = ps.player === 'white' ? 'w' : 'b';

    // If we have a selected piece and clicked a legal move target
    if (selectedSquare && legalMoveSet.has(`${r},${c}`)) {
      const [fromR, fromC] = selectedSquare;

      // Check for pawn promotion
      const piece = ps.board[fromR][fromC];
      if (piece && piece[1] === 'P') {
        const promoRow = color === 'w' ? 0 : 7;
        if (r === promoRow) {
          promotionChoice = { fromR, fromC, toR: r, toC: c };
          return;
        }
      }

      emit('normalMove', { player: ps.player, fromR, fromC, toR: r, toC: c });
      selectedSquare = null;
      legalMoves = [];
      return;
    }

    // Clicking own piece — select it
    if (cell && cell[0] === color && isMyTurn) {
      // If already selected this traitor, initiate sacrifice on second click
      if (traitorSet.has(`${r},${c}`) && selectedSquare?.[0] === r && selectedSquare?.[1] === c) {
        emit('initiateSacrifice', { player: ps.player, traitorR: r, traitorC: c });
        selectedSquare = null;
        legalMoves = [];
        return;
      }

      selectedSquare = [r, c];
      legalMoves = getLegalNormalMoves(ps.board, ps.player, r, c, {
        board: ps.board,
        turn: ps.turn,
        moveLog: ps.moveLog,
        status: ps.status,
        winner: ps.winner,
        whiteClaimed: ps.whiteClaimed,
        blackClaimed: ps.blackClaimed,
        castling: ps.castling,
        enPassantTarget: ps.enPassantTarget,
        sacrificeInProgress: null,
      } as any);
      return;
    }

    // Clicking empty or opponent piece with no selection
    selectedSquare = null;
    legalMoves = [];
  }

  function handlePromotion(piece: 'Q' | 'R' | 'B' | 'N') {
    if (!promotionChoice || !state || !('player' in state)) return;
    emit('normalMove', {
      player: (state as PublicGameState).player,
      ...promotionChoice,
      promotion: piece
    });
    promotionChoice = null;
    selectedSquare = null;
    legalMoves = [];
  }

  function handleNewGame() {
    emit('newGame');
  }

  function isLightSquare(r: number, c: number): boolean {
    return (r + c) % 2 === 0;
  }

  const lastMove = $derived(state?.moveLog.length ? state.moveLog[state.moveLog.length - 1] : null);
</script>

<div class="game-container">
  <!-- Material bar -->
  <div class="material-bar">
    {#if state && 'myMaterial' in state}
      {@const ps = state as PublicGameState}
      <span class="material-label" class:behind={ps.isBehind} class:ahead={!ps.isBehind && ps.myMaterial > ps.opponentMaterial}>
        {#if ps.myMaterial > ps.opponentMaterial}
          You +{ps.myMaterial - ps.opponentMaterial}
        {:else if ps.myMaterial < ps.opponentMaterial}
          Opp +{ps.opponentMaterial - ps.myMaterial}
        {:else}
          Equal
        {/if}
      </span>
      {#if ps.isBehind && ps.canSacrificeNow && isMyTurn}
        <span class="sacrifice-hint">💀 Sacrifice available!</span>
      {/if}
      {#if ps.inCheck}
        <span class="check-warning">⚡ CHECK!</span>
      {/if}
    {:else if state}
      {@const ss = state as SpectatorViewState}
      <span class="material-label">
        {#if ss.whiteMaterial > ss.blackMaterial}
          White +{ss.whiteMaterial - ss.blackMaterial}
        {:else if ss.blackMaterial > ss.whiteMaterial}
          Black +{ss.blackMaterial - ss.whiteMaterial}
        {:else}
          Equal material
        {/if}
      </span>
    {/if}
  </div>

  <!-- Board -->
  <div class="board-wrapper">
    <div class="board" class:flipped={player === 'black'}>
      {#each RANKS_ARR as rank, ri}
        {#each FILES_ARR as file, fi}
          {@const r = ri}
          {@const c = fi}
          {@const cell = state?.board[r][c]}
          {@const isLight = isLightSquare(r, c)}
          {@const isSelected = selectedSquare?.[0] === r && selectedSquare?.[1] === c}
          {@const isLegal = legalMoveSet.has(`${r},${c}`)}
          {@const isTraitor = traitorSet.has(`${r},${c}`)}
          {@const isRemovable = sacrificeActive && removableSet.has(`${r},${c}`)}
          {@const isSacrificeSrc = sacrificeActive && state && 'sacrificeInProgress' in state && (state as PublicGameState).sacrificeInProgress?.traitorPos[0] === r && (state as PublicGameState).sacrificeInProgress?.traitorPos[1] === c}
          {@const sqName = `${file}${rank}`}
          {@const isLastFrom = lastMove?.from === sqName}
          {@const isLastTo = lastMove?.to === sqName}

          <button
            class="square"
            class:light={isLight}
            class:dark={!isLight}
            class:selected={isSelected}
            class:legal-target={isLegal}
            class:traitor={isTraitor && isMyTurn && !sacrificeActive}
            class:removable={isRemovable}
            class:sacrifice-source={isSacrificeSrc}
            class:last-from={isLastFrom}
            class:last-to={isLastTo}
            onclick={() => handleSquareClick(r, c)}
          >
            {#if cell}
              <img
                src={`/pieces/${cell}.svg`}
                alt={cell}
                class="piece"
                class:traitor-piece={isTraitor && isMyTurn && !sacrificeActive}
                class:removable-piece={isRemovable}
              />
            {/if}
            {#if isLegal && !cell}
              <div class="legal-dot"></div>
            {/if}
            {#if isLegal && cell}
              <div class="capture-ring"></div>
            {/if}
          </button>
        {/each}
      {/each}
    </div>

    <!-- File labels -->
    <div class="file-labels" class:flipped={player === 'black'}>
      {#each FILES_ARR as file}
        <span>{file}</span>
      {/each}
    </div>
  </div>

  <!-- Status -->
  <div class="status-bar">
    {#if state?.status === 'finished'}
      <div class="game-over">
        <span class="winner">
          {#if state.winner === 'white'}♔ White wins!{:else if state.winner === 'black'}♚ Black wins!{:else}Draw!{/if}
        </span>
        <button class="new-game-btn" onclick={handleNewGame}>New Game</button>
      </div>
    {:else if state?.status === 'waiting'}
      <span class="waiting">Waiting for opponent...</span>
    {:else if sacrificeActive}
      <span class="sacrifice-mode">💀 Click an opponent piece to remove</span>
      <button class="cancel-btn" onclick={() => { emit('cancelSacrifice', { player: (state as PublicGameState).player }); selectedSquare = null; }}>Cancel</button>
    {:else if isMyTurn}
      <span class="your-turn">Your turn</span>
    {:else if state}
      <span class="opponent-turn">Opponent's turn</span>
    {/if}
  </div>

  <!-- Promotion dialog -->
  {#if promotionChoice && state && 'player' in state}
    {@const color = (state as PublicGameState).player === 'white' ? 'w' : 'b'}
    <div class="promotion-overlay" role="dialog">
      <div class="promotion-dialog">
        <p>Promote pawn to:</p>
        <div class="promotion-options">
          {#each ['Q', 'R', 'B', 'N'] as p}
            <button class="promo-btn" onclick={() => handlePromotion(p as any)}>
              <img src={`/pieces/${color}${p}.svg`} alt={CODE_TO_PIECE[p]} />
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Move log -->
  {#if state && state.moveLog.length > 0}
    <div class="move-log">
      {#each state.moveLog as move}
        <span class="move-entry" class:sacrifice={move.type === 'sacrifice'}>
          {move.description}
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .game-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    width: 100%;
    max-width: 580px;
    margin: 0 auto;
  }

  .material-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 8px;
    width: 100%;
    justify-content: center;
    min-height: 36px;
  }

  .material-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #888;
  }

  .material-label.behind { color: #f87171; }
  .material-label.ahead { color: #4ade80; }

  .sacrifice-hint {
    font-size: 0.8rem;
    color: #f87171;
    animation: pulse 1.5s infinite;
  }

  .check-warning {
    font-size: 0.85rem;
    color: #fbbf24;
    font-weight: 700;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .board-wrapper {
    width: 100%;
    max-width: 560px;
  }

  .board {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    grid-template-rows: repeat(8, 1fr);
    width: 100%;
    aspect-ratio: 1;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  }

  .board.flipped {
    transform: rotate(180deg);
  }

  .board.flipped .piece {
    transform: rotate(180deg);
  }

  .square {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .light { background: #e8dcc8; }
  .dark { background: #a67c52; }

  .square.selected { background: #7bc86c !important; }

  .square.last-from,
  .square.last-to { background: #cdd26a !important; }

  .square.traitor {
    background: #f8717180 !important;
    box-shadow: inset 0 0 12px rgba(248, 113, 113, 0.5);
  }

  .square.removable {
    background: #ef444480 !important;
    box-shadow: inset 0 0 12px rgba(239, 68, 68, 0.6);
    cursor: crosshair;
  }

  .square.sacrifice-source {
    background: #a855f780 !important;
    box-shadow: inset 0 0 12px rgba(168, 85, 247, 0.5);
  }

  .piece {
    width: 78%;
    height: 78%;
    object-fit: contain;
    pointer-events: none;
  }

  .traitor-piece {
    animation: traitor-glow 2s infinite;
  }

  .removable-piece {
    filter: brightness(1.5) drop-shadow(0 0 8px #ef4444);
  }

  @keyframes traitor-glow {
    0%, 100% { filter: drop-shadow(0 0 4px rgba(248, 113, 113, 0.4)); }
    50% { filter: drop-shadow(0 0 12px rgba(248, 113, 113, 0.8)); }
  }

  .legal-dot {
    width: 28%;
    height: 28%;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.25);
    pointer-events: none;
  }

  .capture-ring {
    position: absolute;
    inset: 4%;
    border-radius: 50%;
    border: 4px solid rgba(0, 0, 0, 0.25);
    pointer-events: none;
  }

  .file-labels {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    width: 100%;
    text-align: center;
    padding-top: 4px;
  }

  .file-labels span {
    font-size: 0.7rem;
    color: #666;
  }

  .file-labels.flipped {
    direction: rtl;
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 8px;
    width: 100%;
    justify-content: center;
    min-height: 44px;
  }

  .your-turn {
    color: #4ade80;
    font-weight: 700;
    font-size: 0.95rem;
  }

  .opponent-turn {
    color: #888;
    font-size: 0.9rem;
  }

  .waiting {
    color: #fbbf24;
    font-size: 0.9rem;
    animation: pulse 2s infinite;
  }

  .sacrifice-mode {
    color: #f87171;
    font-weight: 700;
    font-size: 0.9rem;
  }

  .cancel-btn {
    padding: 4px 12px;
    background: rgba(255, 255, 255, 0.1);
    color: #ccc;
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .game-over {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .winner {
    font-size: 1.1rem;
    font-weight: 800;
    color: #fbbf24;
  }

  .new-game-btn {
    padding: 6px 16px;
    background: #4ade80;
    color: #0a0a0a;
    border-radius: 8px;
    font-weight: 700;
    font-size: 0.85rem;
  }

  .promotion-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .promotion-dialog {
    background: #1a1a2e;
    border-radius: 12px;
    padding: 1.5rem;
    text-align: center;
    border: 1px solid #333;
  }

  .promotion-dialog p {
    margin-bottom: 1rem;
    font-size: 1rem;
  }

  .promotion-options {
    display: flex;
    gap: 0.75rem;
  }

  .promo-btn {
    padding: 8px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    transition: background 0.15s;
  }

  .promo-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .promo-btn img {
    width: 48px;
    height: 48px;
  }

  .move-log {
    width: 100%;
    max-height: 120px;
    overflow-y: auto;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .move-entry {
    font-size: 0.75rem;
    color: #888;
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
  }

  .move-entry.sacrifice {
    color: #f87171;
    background: rgba(248, 113, 113, 0.1);
  }
</style>