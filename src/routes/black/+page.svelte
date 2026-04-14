<script lang="ts">
  import { onMount } from 'svelte';
  import ChessBoard from '$lib/ChessBoard.svelte';
  import type { PublicGameState } from '$lib/game';

  let state: PublicGameState | null = $state(null);

  onMount(() => {
    import('$lib/socket').then(({ getSocket }) => {
      const socket = getSocket();
      socket.emit('join', 'black');

      socket.on('playerState', (s: PublicGameState) => {
        if (s.player === 'black') state = s;
      });
    });
  });
</script>

<svelte:head>
  <title>DreamChess — Black</title>
</svelte:head>

<div class="player-page">
  <a href="/" class="back-link">← Back</a>
  <h1 class="player-title black-title">♚ Black</h1>
  <ChessBoard {state} player="black" isPlayer={true} />
</div>

<style>
  .player-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem;
  }

  .back-link {
    align-self: flex-start;
    color: #666;
    text-decoration: none;
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }

  .back-link:hover {
    color: #aaa;
  }

  .player-title {
    font-size: 1.3rem;
    font-weight: 800;
    margin-bottom: 0.5rem;
  }

  .black-title {
    color: #a0a0a0;
  }
</style>