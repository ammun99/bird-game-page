<template>
  <div class="game-page">
    <div class="game-card">
      <canvas
        ref="canvasRef"
        :width="gameWidth"
        :height="gameHeight"
        tabindex="0"
        @keydown="handleKeydown"
      ></canvas>

      <div class="game-actions">
        <button @click="startGame">Start</button>
        <button @click="resetFullGame">Restart</button>
      </div>

      <p class="hint">
        Press <strong>Space</strong> to start/flap,
        <strong>C</strong> to continue,
        <strong>R</strong> to restart
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

import bgSrc from '../assets/bg.png'
import birdSrc from '../assets/bird.png'
import coinSrc from '../assets/coin.png'
import pipeSrc from '../assets/pipe.png'
import pipeTopSrc from '../assets/pipe_up.png'
import coinSoundSrc from '../assets/coin_collect.wav'
import gameOverSoundSrc from '../assets/game_over.wav'
import backgroundMusicSrc from '../assets/background_music.wav'
import winSoundSrc from '../assets/win.wav'

const gameWidth = 360
const gameHeight = 640

const BIRD_SX = gameWidth / 8
const BIRD_SY = gameHeight / 2 - 12
const BIRD_W = 34
const BIRD_H = 24

const PIPE_W = 64
const PIPE_H = 512

const GRAVITY = 0.35
const FLAP_VY = -6.0
const TERMINAL_VEL = 8.0

const HOVER_AMP = 7.0

const CONTINUE_COST = [0, 3, 5, 7, 9]
const MIN_COINS_PER_LEVEL = [4, 6, 8, 10, 12]

const LEVELS = [
  { pipeDelay: 2000, vx: -2.2, gap: 190, pairsToPass: 3 },
  { pipeDelay: 1800, vx: -2.5, gap: 175, pairsToPass: 4 },
  { pipeDelay: 1600, vx: -2.8, gap: 160, pairsToPass: 5 },
  { pipeDelay: 1400, vx: -3.1, gap: 145, pairsToPass: 6 },
  { pipeDelay: 1200, vx: -3.4, gap: 130, pairsToPass: 7 }
]

const canvasRef = ref(null)

let ctx = null
let animationId = null
let lastTime = 0
let pipeSpawnAccumulator = 0

const bgImage = new Image()
const birdImage = new Image()
const coinImage = new Image()
const pipeImage = new Image()
const pipeTopImage = new Image()

bgImage.src = bgSrc
birdImage.src = birdSrc
coinImage.src = coinSrc
pipeImage.src = pipeSrc
pipeTopImage.src = pipeTopSrc

const coinAudio = new Audio(coinSoundSrc)
const gameOverAudio = new Audio(gameOverSoundSrc)
const bgMusicAudio = new Audio(backgroundMusicSrc)
const winAudio = new Audio(winSoundSrc)

coinAudio.preload = 'auto'
gameOverAudio.preload = 'auto'
bgMusicAudio.preload = 'auto'
winAudio.preload = 'auto'
bgMusicAudio.loop = true

const game = {
  state: 'READY',
  currentLevel: 1,
  coinsCollected: 0,
  pipePairsThisLevel: 0,
  coinsSpawnedThisLevel: 0,
  levelCompleteElapsed: 0,
  hoverAngle: 0,
  velocityY: 0,
  showNotEnoughCoins: false,

  bird: {
    x: BIRD_SX,
    y: BIRD_SY,
    w: BIRD_W,
    h: BIRD_H
  },

  pipes: [],
  coins: []
}

function currentCfg() {
  return LEVELS[game.currentLevel - 1]
}

function safePlay(audio) {
  try {
    audio.pause()
    audio.currentTime = 0
    audio.play()
  } catch {
    // ignore browser autoplay errors
  }
}

function startBgMusic() {
  try {
    bgMusicAudio.pause()
    bgMusicAudio.currentTime = 0
    bgMusicAudio.play()
  } catch {
    // browser may require prior user interaction
  }
}

function stopBgMusic() {
  try {
    bgMusicAudio.pause()
  } catch {
    // ignore
  }
}

function focusCanvas() {
  if (canvasRef.value) canvasRef.value.focus()
}

function resetBird() {
  game.bird.x = BIRD_SX
  game.bird.y = BIRD_SY
}

function resetLevel(fullReset = false) {
  if (fullReset) {
    game.currentLevel = 1
    game.coinsCollected = 0
  }

  game.pipePairsThisLevel = 0
  game.coinsSpawnedThisLevel = 0
  game.velocityY = 0
  game.hoverAngle = 0
  game.levelCompleteElapsed = 0
  game.showNotEnoughCoins = false
  game.state = 'READY'

  resetBird()
  game.pipes = []
  game.coins = []
  pipeSpawnAccumulator = 0
}

function resetFullGame() {
  stopBgMusic()
  resetLevel(true)
  focusCanvas()
}

function startGame() {
  if (game.state === 'READY') {
    game.state = 'RUNNING'
    game.velocityY = FLAP_VY
    pipeSpawnAccumulator = 0
    startBgMusic()
    focusCanvas()
  }
}

function doContinueLevel() {
  game.coinsCollected -= CONTINUE_COST[game.currentLevel - 1]
  game.pipePairsThisLevel = 0
  game.coinsSpawnedThisLevel = 0
  game.velocityY = 0
  game.hoverAngle = 0
  game.showNotEnoughCoins = false
  game.state = 'READY'
  resetBird()
  game.pipes = []
  game.coins = []
  pipeSpawnAccumulator = 0
  focusCanvas()
}

function advanceLevel() {
  game.currentLevel += 1
  resetLevel(false)
}

function collidesRect(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  )
}

function collidesCoin(bird, coin) {
  return (
    bird.x < coin.x + coin.size &&
    bird.x + bird.w > coin.x &&
    bird.y < coin.y + coin.size &&
    bird.y + bird.h > coin.y
  )
}

function triggerGameOver() {
  game.state = 'GAME_OVER'
  game.showNotEnoughCoins = false
  stopBgMusic()
  safePlay(gameOverAudio)
}

function spawnPipePair() {
  if (game.state !== 'RUNNING') return

  const cfg = currentCfg()
  const rY = Math.floor(-PIPE_H / 4 - Math.random() * (PIPE_H / 2))

  const topPipe = {
    x: gameWidth,
    y: rY,
    w: PIPE_W,
    h: PIPE_H,
    passed: false,
    isTop: true,
    image: pipeTopImage
  }

  const bottomPipe = {
    x: gameWidth,
    y: rY + PIPE_H + cfg.gap,
    w: PIPE_W,
    h: PIPE_H,
    passed: false,
    isTop: false,
    image: pipeImage
  }

  game.pipes.push(topPipe, bottomPipe)
  spawnCoinsForGap(topPipe, bottomPipe, cfg)
}

function spawnCoinsForGap(topPipe, bottomPipe, cfg) {
  const MARGIN = 20
  const gapTop = topPipe.y + PIPE_H + MARGIN
  const gapBottom = bottomPipe.y - MARGIN

  if (gapBottom <= gapTop) return

  const minCoins = MIN_COINS_PER_LEVEL[game.currentLevel - 1]
  const pairsLeft = cfg.pairsToPass - game.pipePairsThisLevel
  const coinsNeeded = Math.max(0, minCoins - game.coinsSpawnedThisLevel)

  let forcedCoins = pairsLeft > 0
    ? Math.ceil(coinsNeeded / pairsLeft)
    : coinsNeeded

  forcedCoins = Math.min(forcedCoins, 2)

  const toSpawn = Math.random() < 0.8
    ? Math.max(1, forcedCoins)
    : forcedCoins

  const coinX = gameWidth + PIPE_W / 2 - 14
  const gapMid = (gapTop + gapBottom) / 2
  const coinSize = 28

  if (toSpawn === 1) {
    game.coins.push({
      x: coinX,
      y: gapMid - coinSize / 2,
      size: coinSize
    })
    game.coinsSpawnedThisLevel += 1
  } else if (toSpawn >= 2) {
    const spread = Math.max(coinSize + 4, (gapBottom - gapTop) / 4)

    game.coins.push({
      x: coinX,
      y: gapMid - coinSize / 2 - spread / 2,
      size: coinSize
    })

    game.coins.push({
      x: coinX,
      y: gapMid - coinSize / 2 + spread / 2,
      size: coinSize
    })

    game.coinsSpawnedThisLevel += 2
  }
}

function update(dtMs) {
  const cfg = currentCfg()

  if (game.state === 'READY') {
    game.hoverAngle += 0.07
    return
  }

  if (game.state === 'LEVEL_COMPLETE') {
    game.levelCompleteElapsed += dtMs
    if (game.levelCompleteElapsed >= 1500) {
      if (game.currentLevel < 5) {
        advanceLevel()
      } else {
        game.state = 'WINNER'
        stopBgMusic()
        safePlay(winAudio)
      }
    }
    return
  }

  if (game.state !== 'RUNNING') return

  pipeSpawnAccumulator += dtMs
  while (pipeSpawnAccumulator >= cfg.pipeDelay) {
    spawnPipePair()
    pipeSpawnAccumulator -= cfg.pipeDelay
  }

  game.velocityY += GRAVITY
  if (game.velocityY > TERMINAL_VEL) {
    game.velocityY = TERMINAL_VEL
  }

  game.bird.y += game.velocityY

  if (game.bird.y < 0) {
    game.bird.y = 0
    game.velocityY = 0
  }

  if (game.bird.y + game.bird.h > gameHeight) {
    game.bird.y = gameHeight - game.bird.h
    game.velocityY = 0
  }

  for (const pipe of game.pipes) {
    pipe.x += cfg.vx

    if (!pipe.passed && game.bird.x > pipe.x + pipe.w) {
      pipe.passed = true
      if (pipe.isTop) {
        game.pipePairsThisLevel += 1
      }
    }

    if (collidesRect(game.bird, pipe)) {
      triggerGameOver()
      return
    }
  }

  game.pipes = game.pipes.filter(pipe => pipe.x + pipe.w >= 0)

  const remainingCoins = []
  for (const coin of game.coins) {
    coin.x += cfg.vx

    if (collidesCoin(game.bird, coin)) {
      game.coinsCollected += 1
      safePlay(coinAudio)
    } else if (coin.x + coin.size >= 0) {
      remainingCoins.push(coin)
    }
  }
  game.coins = remainingCoins

  if (game.pipePairsThisLevel >= cfg.pairsToPass) {
    if (game.currentLevel === 5) {
      game.state = 'WINNER'
      stopBgMusic()
      safePlay(winAudio)
    } else {
      game.state = 'LEVEL_COMPLETE'
      game.levelCompleteElapsed = 0
    }
  }
}

function drawCoin(coin) {
  if (coinImage.complete && coinImage.naturalWidth > 0) {
    ctx.drawImage(coinImage, coin.x, coin.y, coin.size, coin.size)
  } else {
    ctx.fillStyle = '#ffd700'
    ctx.beginPath()
    ctx.arc(coin.x + coin.size / 2, coin.y + coin.size / 2, coin.size / 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawCentered(text, y) {
  const width = ctx.measureText(text).width
  ctx.fillText(text, (gameWidth - width) / 2, y)
}

function drawReadyOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.57)'
  ctx.fillRect(0, 0, gameWidth, gameHeight)

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 34px Arial'
  drawCentered('Flappy Bird', gameHeight / 2 - 60)

  ctx.font = 'bold 20px Arial'
  drawCentered('Press SPACE to Start', gameHeight / 2 + 10)

  ctx.fillStyle = '#ffd700'
  ctx.font = '14px Arial'
  drawCentered('Collect coins ● 5 levels to win', gameHeight / 2 + 42)

  ctx.fillStyle = '#cfcfcf'
  ctx.font = '12px Arial'
  drawCentered('C = continue with coins    R = restart', gameHeight - 28)
}

function drawLevelCompleteOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.63)'
  ctx.fillRect(0, 0, gameWidth, gameHeight)

  ctx.fillStyle = '#ffd700'
  ctx.font = 'bold 32px Arial'
  drawCentered(`Level ${game.currentLevel} Complete!`, gameHeight / 2 - 25)

  ctx.fillStyle = '#fff'
  ctx.font = '18px Arial'
  if (game.currentLevel < 5) {
    drawCentered(`Get ready for Level ${game.currentLevel + 1}...`, gameHeight / 2 + 18)
  }

  ctx.fillStyle = '#ffd700'
  ctx.font = '15px Arial'
  drawCentered(`Total coins: ${game.coinsCollected}`, gameHeight / 2 + 52)
}

function drawGameOverOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.67)'
  ctx.fillRect(0, 0, gameWidth, gameHeight)

  ctx.fillStyle = '#dc3c3c'
  ctx.font = 'bold 36px Arial'
  drawCentered('Game Over!', gameHeight / 2 - 100)

  ctx.fillStyle = '#fff'
  ctx.font = '16px Arial'
  const cfg = currentCfg()
  drawCentered(
    `Level ${game.currentLevel} • Pipes: ${game.pipePairsThisLevel}/${cfg.pairsToPass}`,
    gameHeight / 2 - 65
  )

  let divY = gameHeight / 2 - 45

  if (game.currentLevel >= 2) {
    const cost = CONTINUE_COST[game.currentLevel - 1]
    const ok = game.coinsCollected >= cost

    ctx.fillStyle = ok ? 'rgba(255,215,0,0.22)' : 'rgba(120,55,55,0.22)'
    roundRect(ctx, 30, divY, gameWidth - 60, 60, 12)
    ctx.fill()

    ctx.lineWidth = 1.5
    ctx.strokeStyle = ok ? '#ffd700' : '#a05050'
    roundRect(ctx, 30, divY, gameWidth - 60, 60, 12)
    ctx.stroke()

    ctx.font = 'bold 17px Arial'
    ctx.fillStyle = ok ? '#ffd700' : '#c87878'
    drawCentered(`[C] Continue Level ${game.currentLevel}`, divY + 23)

    ctx.font = '13px Arial'
    ctx.fillStyle = '#fff'
    drawCentered(
      `${ok ? 'Spend' : 'Need'} ${cost} coins (have: ${game.coinsCollected})`,
      divY + 46
    )

    if (game.showNotEnoughCoins) {
      ctx.fillStyle = '#ff5050'
      ctx.font = 'bold 13px Arial'
      drawCentered('⚠ Not enough coins!', divY + 70)
    }

    divY += 90
  }

  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  roundRect(ctx, 30, divY + 5, gameWidth - 60, 44, 12)
  ctx.fill()

  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.2
  roundRect(ctx, 30, divY + 5, gameWidth - 60, 44, 12)
  ctx.stroke()

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 17px Arial'
  drawCentered('[R] Restart from Level 1', divY + 33)
}

function drawWinnerOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.67)'
  ctx.fillRect(0, 0, gameWidth, gameHeight)

  ctx.fillStyle = '#ffd700'
  ctx.font = 'bold 36px Arial'
  drawCentered('Congratulations! 🎉', gameHeight / 2 - 80)

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 28px Arial'
  drawCentered('You Win! 🏆', gameHeight / 2 - 30)

  ctx.font = '20px Arial'
  drawCentered('All 5 levels cleared!', gameHeight / 2 - 2)

  ctx.fillStyle = '#ffd700'
  ctx.font = 'bold 22px Arial'
  drawCentered(`Total Coins: ${game.coinsCollected}`, gameHeight / 2 + 34)

  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  roundRect(ctx, 60, gameHeight / 2 + 55, gameWidth - 120, 44, 12)
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px Arial'
  drawCentered('[R] Play Again', gameHeight / 2 + 82)
}

function drawHUD() {
  ctx.fillStyle = 'rgba(0,0,0,0.47)'
  roundRect(ctx, 4, 4, gameWidth - 8, 34, 12)
  ctx.fill()

  ctx.font = 'bold 14px Arial'
  const cfg = currentCfg()

  ctx.fillStyle = '#fff'
  ctx.fillText(`Level ${game.currentLevel}`, 12, 26)

  const pipeText = `Pipes: ${game.pipePairsThisLevel}/${cfg.pairsToPass}`
  ctx.fillText(pipeText, (gameWidth - ctx.measureText(pipeText).width) / 2, 26)

  ctx.fillStyle = '#ffd700'
  const coinText = `${game.coinsCollected} ●`
  ctx.fillText(coinText, gameWidth - ctx.measureText(coinText).width - 12, 26)
}

function draw() {
  ctx.clearRect(0, 0, gameWidth, gameHeight)
  ctx.drawImage(bgImage, 0, 0, gameWidth, gameHeight)

  for (const pipe of game.pipes) {
    ctx.drawImage(pipe.image, pipe.x, pipe.y, pipe.w, pipe.h)
  }

  for (const coin of game.coins) {
    drawCoin(coin)
  }

  const birdDrawY =
    game.state === 'READY'
      ? BIRD_SY + Math.sin(game.hoverAngle) * HOVER_AMP
      : game.bird.y

  ctx.drawImage(birdImage, game.bird.x, birdDrawY, game.bird.w, game.bird.h)

  drawHUD()

  if (game.state === 'READY') drawReadyOverlay()
  if (game.state === 'LEVEL_COMPLETE') drawLevelCompleteOverlay()
  if (game.state === 'GAME_OVER') drawGameOverOverlay()
  if (game.state === 'WINNER') drawWinnerOverlay()
}

function handleKeydown(event) {
  const key = event.code

  if (key === 'Space') {
    event.preventDefault()
    if (game.state === 'READY') {
      game.state = 'RUNNING'
      game.velocityY = FLAP_VY
      pipeSpawnAccumulator = 0
      startBgMusic()
    } else if (game.state === 'RUNNING') {
      game.velocityY = FLAP_VY
    }
  }

  if (key === 'KeyC' && game.state === 'GAME_OVER' && game.currentLevel >= 2) {
    const cost = CONTINUE_COST[game.currentLevel - 1]
    if (game.coinsCollected >= cost) {
      doContinueLevel()
    } else {
      game.showNotEnoughCoins = true
    }
  }

  if (key === 'KeyR' && (game.state === 'GAME_OVER' || game.state === 'WINNER')) {
    resetFullGame()
  }
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp
  const dtMs = timestamp - lastTime
  lastTime = timestamp

  update(dtMs)
  draw()

  animationId = requestAnimationFrame(loop)
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

onMounted(() => {
  const canvas = canvasRef.value
  ctx = canvas.getContext('2d')
  focusCanvas()
  resetLevel(true)
  animationId = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  stopBgMusic()
  if (animationId) cancelAnimationFrame(animationId)
})
</script>

<style scoped>
.game-page {
  display: flex;
  justify-content: center;
  align-items: center;
}

.game-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

canvas {
  border: 2px solid #1f2937;
  border-radius: 16px;
  max-width: 100%;
  height: auto;
  outline: none;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  background: black;
}

.game-actions {
  display: flex;
  gap: 1rem;
}

button {
  padding: 0.8rem 1.2rem;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
}

.hint {
  margin: 0;
  color: white;
  text-align: center;
}
</style>