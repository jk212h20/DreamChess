<script lang="ts">
  import { onMount } from 'svelte';
  import ChessBoard from '$lib/ChessBoard.svelte';
  import type { PublicGameState } from '$lib/game';

  let state: PublicGameState | null = $state(null);

  onMount(() => {
    // getSocket only runs on client — socket.io-client needs window
    import('$lib/socket').then(({ getSocket }) => {
      const socket = getSocket();
      socket.emit('join', 'white');

      socket.on('playerState', (s: PublicGameState) => {
        if (s.player === 'white') state = s;
      });
    });
  });
</script>

<svelte:head>
  <title>DreamChess — White</title>
</svelte:head>

<div class="player-page">
  <a href="/" class="back-link">← Back</a>
  <h1 class="player-title white-title">♔ White</h1>
  <ChessBoard {state} player="white" isPlayer={true} />
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

  .white-title {
    color: #e0e0e0;
  }
</style>