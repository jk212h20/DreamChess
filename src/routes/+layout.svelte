<script>
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a0a0a;
    color: #f0f0f0;
    min-height: 100dvh;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }

  :global(button) {
    font-family: inherit;
    cursor: pointer;
    border: none;
    outline: none;
  }
</style>