<template>
  <div class="game-page">
    <div class="game-card">
      <canvas
  ref="canvasRef"
  :width="gameWidth"
  :height="gameHeight"
  tabindex="0"
  @keydown="handleKeydown"
  @pointerdown.prevent="handleTap"
></canvas>

      <div class="game-actions">
        <button @click="startGame">Start</button>
        <button @click="resetFullGame">Restart</button>
        <button
          v-if="gameState === 'GAME_OVER' && game.currentLevel >= 2"
          @click="handleContinue"
          :disabled="game.coinsCollected < CONTINUE_COST[game.currentLevel - 1]"
          class="btn-continue"
        >
          Continue (-{{ CONTINUE_COST[game.currentLevel - 1] }} coins)
        </button>
        <button
          v-if="gameState === 'WINNER'"
          @click="resetFullGame"
          class="btn-play-again"
        >
          🎉 Play Again
        </button>
      </div>

      <p class="hint">
        <strong>Space</strong> / Tap to flap &nbsp;·&nbsp;
        <strong>C</strong> to continue &nbsp;·&nbsp;
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

// pipeDelay increased to give more breathing room between pipe pairs
const LEVELS = [
  { pipeDelay: 3200, vx: -2.2, gap: 190, pairsToPass: 3 },
  { pipeDelay: 3000, vx: -2.5, gap: 175, pairsToPass: 4 },
  { pipeDelay: 2800, vx: -2.8, gap: 160, pairsToPass: 5 },
  { pipeDelay: 2600, vx: -3.1, gap: 145, pairsToPass: 6 },
  { pipeDelay: 2400, vx: -3.4, gap: 130, pairsToPass: 7 }
]

const canvasRef = ref(null)
const gameState = ref('READY') // reactive mirror for template v-if bindings

let ctx = null
let animationId = null
let lastTime = 0
let pipeSpawnAccumulator = 0

// Confetti particles for winner screen
let confetti = []

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

function syncReactiveState() {
  gameState.value = game.state
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
  syncReactiveState()
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
  syncReactiveState()
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
  syncReactiveState()
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

  // Spawn additional coins horizontally between this pipe pair and the next
  const framesToNextPipe = cfg.pipeDelay / 16.666
  const pixelsToNextPipe = framesToNextPipe * Math.abs(cfg.vx)
  
  if (Math.random() < 0.75) {
    const rY = 100 + Math.random() * (gameHeight - 200)
    game.coins.push({
      x: gameWidth + pixelsToNextPipe / 2, // Horizontally halfway to the next pipe
      y: rY,
      size: 28
    })
    game.coinsSpawnedThisLevel += 1
  }
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
        spawnConfetti()
        syncReactiveState()
      }
    }
    return
  }

  if (game.state === 'WINNER') {
    updateConfetti(dtMs)
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
      spawnConfetti()
      syncReactiveState()
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

// Confetti helpers
const CONFETTI_COLORS = ['#ffd700','#ff6b6b','#4ecdc4','#45b7d1','#96e6a1','#f7971e','#f953c6']

function spawnConfetti() {
  confetti = []
  for (let i = 0; i < 80; i++) {
    confetti.push({
      x: Math.random() * gameWidth,
      y: Math.random() * -gameHeight,
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 6,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      vy: 1.5 + Math.random() * 2.5,
      vx: (Math.random() - 0.5) * 1.5,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.15
    })
  }
}

function updateConfetti(dtMs) {
  const factor = dtMs / 16
  for (const p of confetti) {
    p.x += p.vx * factor
    p.y += p.vy * factor
    p.rot += p.rotV * factor
    // Wrap around when off-screen
    if (p.y > gameHeight + 20) {
      p.y = -20
      p.x = Math.random() * gameWidth
    }
  }
}

function drawConfetti() {
  for (const p of confetti) {
    ctx.save()
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2)
    ctx.rotate(p.rot)
    ctx.fillStyle = p.color
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
    ctx.restore()
  }
}

function drawWinnerOverlay() {
  // Dark gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, gameHeight)
  grad.addColorStop(0, 'rgba(20,10,60,0.92)')
  grad.addColorStop(1, 'rgba(60,20,100,0.92)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, gameWidth, gameHeight)

  // Confetti on top of background
  drawConfetti()

  // Glowing panel
  ctx.fillStyle = 'rgba(255,215,0,0.12)'
  roundRect(ctx, 20, gameHeight / 2 - 160, gameWidth - 40, 260, 20)
  ctx.fill()
  ctx.strokeStyle = '#ffd700'
  ctx.lineWidth = 2
  roundRect(ctx, 20, gameHeight / 2 - 160, gameWidth - 40, 260, 20)
  ctx.stroke()

  ctx.fillStyle = '#ffd700'
  ctx.font = 'bold 28px Arial'
  drawCentered('🎉 Congratulations! 🎉', gameHeight / 2 - 120)

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 32px Arial'
  drawCentered('You Win! 🏆', gameHeight / 2 - 75)

  ctx.fillStyle = '#c8f5c8'
  ctx.font = '18px Arial'
  drawCentered('All 5 levels cleared!', gameHeight / 2 - 40)

  ctx.fillStyle = '#ffd700'
  ctx.font = 'bold 22px Arial'
  drawCentered(`⭐ Total Coins: ${game.coinsCollected} ⭐`, gameHeight / 2)

  ctx.fillStyle = '#ffe0f0'
  ctx.font = '15px Arial'
  drawCentered('You are a Bird Game master!', gameHeight / 2 + 32)

  // Play again hint
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  roundRect(ctx, 60, gameHeight / 2 + 65, gameWidth - 120, 44, 12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 1
  roundRect(ctx, 60, gameHeight / 2 + 65, gameWidth - 120, 44, 12)
  ctx.stroke()

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px Arial'
  drawCentered('[R] / Tap button to Play Again', gameHeight / 2 + 92)
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
function flapAction() {
  if (game.state === 'READY') {
    game.state = 'RUNNING'
    game.velocityY = FLAP_VY
    pipeSpawnAccumulator = 0
    startBgMusic()
    syncReactiveState()
  } else if (game.state === 'RUNNING') {
    game.velocityY = FLAP_VY
  }
}
function handleKeydown(event) {
  const key = event.code

  if (key === 'Space') {
    event.preventDefault()
    flapAction()
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
function handleContinue() {
  if (game.state === 'GAME_OVER' && game.currentLevel >= 2) {
    const cost = CONTINUE_COST[game.currentLevel - 1]
    if (game.coinsCollected >= cost) {
      doContinueLevel()
    } else {
      game.showNotEnoughCoins = true
    }
  }
}
function handleTap(event) {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }

  let tapY = 0
  if (event && event.type === 'pointerdown') {
    tapY = event.clientY
    if (canvasRef.value) {
      const rect = canvasRef.value.getBoundingClientRect()
      tapY = ((tapY - rect.top) / rect.height) * gameHeight
    }
  }

  if (game.state === 'READY' || game.state === 'RUNNING') {
    flapAction()
  } else if (game.state === 'GAME_OVER') {
    const cost = CONTINUE_COST[game.currentLevel - 1] || 0
    const canContinue = game.currentLevel >= 2 && game.coinsCollected >= cost

    // divY for Continue button is gameHeight / 2 - 45
    // restart button starts around gameHeight / 2 + 50
    const restartThresholdY = gameHeight / 2 + 40

    if (tapY > restartThresholdY) {
      resetFullGame()
    } else if (canContinue) {
      doContinueLevel()
    } else if (game.currentLevel >= 2) {
      game.showNotEnoughCoins = true
      syncReactiveState()
    } else {
      resetFullGame()
    }
  } else if (game.state === 'WINNER') {
    resetFullGame()
  }

  focusCanvas()
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
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
}

.game-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

button {
  padding: 0.75rem 1.1rem;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  background: rgba(255,255,255,0.15);
  color: #fff;
  transition: background 0.2s, transform 0.1s;
}

button:active {
  transform: scale(0.96);
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-continue {
  background: linear-gradient(135deg, #f7971e, #ffd200);
  color: #1a1a1a;
}

.btn-play-again {
  background: linear-gradient(135deg, #a18cd1, #fbc2eb);
  color: #1a1a1a;
  font-size: 1rem;
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

.hint {
  margin: 0;
  color: rgba(255,255,255,0.75);
  text-align: center;
  font-size: 0.82rem;
}
</style>
