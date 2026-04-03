<template>
  <main class="play-view">
    <div class="overlay">
      <h1>Game ON!!</h1>
      <FlappyBirdGame />
    </div>
  </main>
</template>

<script setup>
import FlappyBirdGame from '../components/FlappyBirdGame.vue'
</script>

<style scoped>
.play-view {
  min-height: 100vh;
  width: 100%;
  background: url('../assets/bg2.jpg') center center / cover no-repeat;
}

.overlay {
  min-height: 100vh;
  width: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}

h1 {
  color: white;
  text-align: center;
  margin-bottom: 1rem;
}
</style>