<template>
  <main class="home-view">
    <div class="overlay">
      <section class="hero">
        <h1>Welcome to Play the Game</h1>
        <router-link to="/play" class="play-link">
          Launch?!
        </router-link>
      </section>
    </div>
  </main>
</template>

<style scoped>
.home-view {
  min-height: 100vh;
  width: 100%;
  background: url('../assets/bg1.jpg') center center / cover no-repeat;
}

.overlay {
  min-height: 100vh;
  width: 100%;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero {
  text-align: center;
  color: white;
  padding: 2rem;
}

.play-link {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.9rem 1.4rem;
  background: #42b883;
  color: white;
  text-decoration: none;
  border-radius: 12px;
  font-weight: 700;
}
</style>