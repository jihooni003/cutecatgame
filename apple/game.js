(function () {
  "use strict";

  var ROWS = 5;
  var COLS = 5;
  var TIME_LIMIT_SEC = 90;

  /* ── 시작화면 요소 ── */
  var startScreen = document.getElementById("start-screen");
  var gamePage = document.getElementById("game-page");
  var btnStart = document.getElementById("btn-start");
  var optBgmStart = document.getElementById("opt-bgm-start");
  var optVolumeStart = document.getElementById("opt-volume-start");

  /* ── 게임 요소 ── */
  var boardEl = document.getElementById("board");
  var dragRegionEl = document.getElementById("drag-region");
  var clearedEl = document.getElementById("cleared");
  var scoreEl = document.getElementById("score");
  var timeEl = document.getElementById("time");
  var hintEl = document.getElementById("hint");
  var overlay = document.getElementById("overlay");
  var finalScoreEl = document.getElementById("final-score");
  var btnRestart = document.getElementById("btn-restart");
  var btnQuit = document.getElementById("btn-quit");
  var btnReset = document.getElementById("btn-reset");
  var timerBarFill = document.getElementById("timer-bar-fill");
  var optDark = document.getElementById("opt-dark");
  var optDarkStart = document.getElementById("opt-dark-start");
  var optBgm = document.getElementById("opt-bgm");
  var optVolume = document.getElementById("opt-volume");
  var timeRow = document.querySelector(".stat-val.time");

  /** @type {(number|null)[][]} */
  var grid = [];
  var cells = [];
  var clearedTotal = 0;
  var score = 0;

  var dragging = false;
  var animating = false;
  var startR = 0, startC = 0, curR = 0, curC = 0;

  var timeLeft = TIME_LIMIT_SEC;
  var timerId = null;
  var playing = true;

  var bgmAudioEl = document.getElementById("bgm-track");
  var matchSfxEl = document.getElementById("match-sfx");
  var clearSfxEl = document.getElementById("clear-sfx");
  var gameoverSfxEl = document.getElementById("gameover-sfx");
  var wrongSfxEl = document.getElementById("wrong-sfx");
  var audioCtx = null;

  /* ══ Web Audio 효과음 ══ */
  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  /* 합 10 성공 — 스파클 효과음 */
  function playMatchSound() {
    if (!matchSfxEl) return;
    matchSfxEl.currentTime = 0;
    matchSfxEl.volume = Math.max(0, Math.min(1, getVolumeNorm()));
    var p = matchSfxEl.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  }

  /* 클리어 성공 — 빅토리 효과음 */
  function playClearSound() {
    if (!clearSfxEl) return;
    clearSfxEl.currentTime = 0;
    clearSfxEl.volume = Math.max(0, Math.min(1, getVolumeNorm()));
    var p = clearSfxEl.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  }

  /* 합 10 미달 — 오답 피드백음 */
  function playWrongSound() {
    if (!wrongSfxEl) return;
    wrongSfxEl.currentTime = 0;
    wrongSfxEl.volume = Math.max(0, Math.min(1, getVolumeNorm()));
    var p = wrongSfxEl.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  }

  /* 시간 종료 — 실패 효과음 */
  function playGameOverSound() {
    if (!gameoverSfxEl) return;
    gameoverSfxEl.currentTime = 0;
    gameoverSfxEl.volume = Math.max(0, Math.min(1, getVolumeNorm()));
    var p = gameoverSfxEl.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  }

  /* ══ 파티클 이펙트 (position:fixed → body에 부착) ══ */
  function spawnParticles(r0, r1, c0, c1) {
    if (!cells[r0] || !cells[r0][c0] || !cells[r1] || !cells[r1][c1]) return;
    var tl = cells[r0][c0].getBoundingClientRect();
    var br = cells[r1][c1].getBoundingClientRect();
    var cx = (tl.left + br.right) / 2;
    var cy = (tl.top + br.bottom) / 2;
    var colors = ["#ff6b9d", "#ffd93d", "#6bcb77", "#4d96ff", "#ff9f43", "#c77dff"];
    for (var i = 0; i < 16; i++) {
      var p = document.createElement("div");
      p.className = "particle";
      var angle = (i / 16) * Math.PI * 2 + Math.random() * 0.5;
      var dist = 30 + Math.random() * 50;
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.setProperty("--tx", Math.cos(angle) * dist + "px");
      p.style.setProperty("--ty", Math.sin(angle) * dist + "px");
      document.body.appendChild(p);
      (function (el) {
        window.setTimeout(function () { el.remove(); }, 700);
      })(p);
    }
  }

  /* ══ BGM 헬퍼 ══ */
  function getVolumeNorm() {
    var el = gamePage.style.display === "none" ? optVolumeStart : optVolume;
    return parseInt(el.value, 10) / 100;
  }

  function isBgmOn() {
    var el = gamePage.style.display === "none" ? optBgmStart : optBgm;
    return el.checked;
  }

  function applyBgmVolume() {
    if (bgmAudioEl) bgmAudioEl.volume = Math.max(0, Math.min(1, getVolumeNorm()));
  }

  function stopBgm() {
    if (bgmAudioEl) bgmAudioEl.pause();
  }

  function startBgm() {
    if (!isBgmOn() || !bgmAudioEl) return;
    applyBgmVolume();
    var p = bgmAudioEl.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  }

  function ensureAudioFromUser() {
    if (optBgm.checked) startBgm();
  }

  function syncScore() {
    scoreEl.textContent = String(score);
  }

  function updateTimerBar() {
    if (!timerBarFill) return;
    var pct = TIME_LIMIT_SEC > 0 ? (timeLeft / TIME_LIMIT_SEC) * 100 : 0;
    timerBarFill.style.width = pct + "%";
    timerBarFill.style.height = "100%";
  }

  /* ══ 게임 로직 ══ */
  function hasValidMove() {
    for (var r0 = 0; r0 < ROWS; r0++) {
      for (var r1 = r0; r1 < ROWS; r1++) {
        for (var c0 = 0; c0 < COLS; c0++) {
          for (var c1 = c0; c1 < COLS; c1++) {
            var info = sumInRect(r0, r1, c0, c1);
            if (info.sum === 10 && info.count > 0) return true;
          }
        }
      }
    }
    return false;
  }

  function hasAnyTile() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (grid[r][c] !== null) return true;
      }
    }
    return false;
  }

  /**
   * 5×5(25칸) 그리드 — 중급 난이도
   * 8쌍(16) + 3세쌍(9) = 25개를 완전 셔플해 배치.
   * 쌍이 인접하지 않을 수 있으므로 가로·세로·넓은 사각형 선택이 모두 필요.
   */
  function initGrid() {
    var triplePool = [
      [1, 2, 7], [1, 3, 6], [1, 4, 5],
      [2, 3, 5], [2, 4, 4], [3, 3, 4],
      [1, 1, 8], [2, 2, 6], [1, 5, 4]
    ];
    var vals;
    var attempts = 0;

    do {
      vals = [];
      for (var i = 0; i < 8; i++) {
        var a = 1 + Math.floor(Math.random() * 9);
        vals.push(a, 10 - a);
      }
      for (var i = 0; i < 3; i++) {
        var t = triplePool[Math.floor(Math.random() * triplePool.length)];
        vals.push(t[0], t[1], t[2]);
      }
      for (var i = vals.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = vals[i]; vals[i] = vals[j]; vals[j] = tmp;
      }
      grid = [];
      for (var r = 0; r < ROWS; r++) {
        grid[r] = [];
        for (var c = 0; c < COLS; c++) {
          grid[r][c] = vals[r * COLS + c];
        }
      }
      attempts++;
    } while (!hasValidMove() && attempts < 80);

    if (!hasValidMove()) { grid[0][0] = 4; grid[0][1] = 6; }
  }

  function setGridTemplate() {
    boardEl.style.gridTemplateColumns = "repeat(" + COLS + ", minmax(0, 1fr))";
  }

  function cellInnerHtml(val) {
    return (
      '<div class="cell-face">' +
      '<img class="paw-icon" src="assets/heart.png" alt="" aria-hidden="true" />' +
      '</div><span class="cell-num">' + String(val) + "</span>"
    );
  }

  function buildDom() {
    boardEl.innerHTML = "";
    cells = [];
    for (var r = 0; r < ROWS; r++) {
      cells[r] = [];
      for (var c = 0; c < COLS; c++) {
        var el = document.createElement("div");
        el.className = "cell";
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.innerHTML = cellInnerHtml(grid[r][c]);
        boardEl.appendChild(el);
        cells[r][c] = el;
      }
    }
  }

  function refreshNumbers() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var el = cells[r][c];
        var v = grid[r][c];
        var numEl = el.querySelector(".cell-num");
        el.classList.remove("popping", "sweep");
        if (v === null) {
          el.classList.add("empty");
          if (numEl) numEl.textContent = "";
        } else {
          el.classList.remove("empty");
          if (numEl) numEl.textContent = String(v);
        }
      }
    }
  }

  function rectFromDrag() {
    return {
      r0: Math.min(startR, curR), r1: Math.max(startR, curR),
      c0: Math.min(startC, curC), c1: Math.max(startC, curC)
    };
  }

  function sumInRect(r0, r1, c0, c1) {
    var s = 0, count = 0;
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var v = grid[r][c];
        if (v !== null) { s += v; count++; }
      }
    }
    return { sum: s, count: count };
  }

  function hideDragRegion() {
    dragRegionEl.className = "drag-region";
    dragRegionEl.style.cssText = "";
  }

  function updateDragRegion(ok, rect) {
    var stage = boardEl.parentElement;
    if (!stage) return;
    var stageRect = stage.getBoundingClientRect();
    var tl = cells[rect.r0][rect.c0].getBoundingClientRect();
    var br = cells[rect.r1][rect.c1].getBoundingClientRect();
    dragRegionEl.style.left = tl.left - stageRect.left + "px";
    dragRegionEl.style.top = tl.top - stageRect.top + "px";
    dragRegionEl.style.width = br.right - tl.left + "px";
    dragRegionEl.style.height = br.bottom - tl.top + "px";
    dragRegionEl.className = "drag-region visible " + (ok ? "ok" : "bad");
  }

  function clearPreviewClass() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        cells[r][c].classList.remove("preview", "ok", "bad");
      }
    }
    hideDragRegion();
  }

  function updatePreview() {
    clearPreviewClass();
    var rect = rectFromDrag();
    var info = sumInRect(rect.r0, rect.r1, rect.c0, rect.c1);
    var ok = info.sum === 10 && info.count > 0;
    for (var r = rect.r0; r <= rect.r1; r++) {
      for (var c = rect.c0; c <= rect.c1; c++) {
        if (grid[r][c] !== null) {
          cells[r][c].classList.add("preview", ok ? "ok" : "bad");
        }
      }
    }
    updateDragRegion(ok, rect);
    if (info.count === 0) {
      hintEl.textContent = "";
    } else if (ok) {
      hintEl.textContent = "합 10! 마우스를 떼세요";
      hintEl.classList.remove("err");
    } else {
      hintEl.textContent = "선택 합: " + info.sum;
      hintEl.classList.add("err");
    }
  }

  function applyGravity() {
    for (var c = 0; c < COLS; c++) {
      var vals = [];
      for (var r = ROWS - 1; r >= 0; r--) {
        if (grid[r][c] !== null) vals.push(grid[r][c]);
      }
      var i = 0;
      for (var r = ROWS - 1; r >= 0; r--) {
        grid[r][c] = i < vals.length ? vals[i++] : null;
      }
    }
  }

  function clearRect(r0, r1, c0, c1) {
    var n = 0;
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        if (grid[r][c] !== null) { grid[r][c] = null; n++; }
      }
    }
    return n;
  }

  /* ══ 합 10 확정 — 팝 애니메이션 + 이펙트 ══ */
  function commitClear() {
    if (animating) return;
    var rect = rectFromDrag();
    var info = sumInRect(rect.r0, rect.r1, rect.c0, rect.c1);
    if (info.sum !== 10 || info.count === 0) {
      boardEl.classList.add("shake");
      hintEl.textContent = "합이 10이 아닙니다. (현재 " + info.sum + ")";
      hintEl.classList.add("err");
      window.setTimeout(function () { boardEl.classList.remove("shake"); }, 400);
      return;
    }

    animating = true;
    spawnParticles(rect.r0, rect.r1, rect.c0, rect.c1);
    playMatchSound();

    var toRemove = 0;
    for (var r = rect.r0; r <= rect.r1; r++) {
      for (var c = rect.c0; c <= rect.c1; c++) {
        if (grid[r][c] !== null) {
          cells[r][c].classList.add("popping");
          toRemove++;
        }
      }
    }

    clearedTotal += toRemove;
    score += toRemove;
    if (clearedEl) clearedEl.textContent = String(clearedTotal);
    syncScore();
    hintEl.textContent = "+" + toRemove + "점!";
    hintEl.classList.remove("err");

    window.setTimeout(function () {
      clearRect(rect.r0, rect.r1, rect.c0, rect.c1);
      applyGravity();
      refreshNumbers();
      animating = false;

      /* 모든 타일 제거 → 클리어 승리 */
      if (!hasAnyTile()) {
        endGame(true);
        return;
      }

      /* 합 10 조합이 없는 타일이 남으면 자동 스윕 */
      window.setTimeout(function () {
        if (playing && !hasValidMove()) autoSweep();
      }, 180);
    }, 330);
  }

  /* ══ 막힌 타일 자동 제거 (회색 페이드 아웃 후 클리어) ══ */
  function autoSweep() {
    animating = true;
    hintEl.textContent = "";
    hintEl.classList.remove("err");

    var swept = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (grid[r][c] !== null) {
          cells[r][c].classList.add("sweep");
          swept.push({ r: r, c: c });
        }
      }
    }

    window.setTimeout(function () {
      for (var i = 0; i < swept.length; i++) {
        grid[swept[i].r][swept[i].c] = null;
      }
      refreshNumbers();
      animating = false;
      endGame(true);
    }, 560);
  }

  /* ══ 포인터 이벤트 ══ */
  function pointerToCell(clientX, clientY) {
    var rect = boardEl.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    var c = Math.min(COLS - 1, Math.max(0, Math.floor(x / (rect.width / COLS))));
    var r = Math.min(ROWS - 1, Math.max(0, Math.floor(y / (rect.height / ROWS))));
    return { r: r, c: c };
  }

  function onPointerDown(e) {
    if (!playing || animating) return;
    if (e.button !== undefined && e.button !== 0) return;
    var p = pointerToCell(e.clientX, e.clientY);
    if (!p) return;
    dragging = true;
    startR = curR = p.r;
    startC = curC = p.c;
    boardEl.setPointerCapture(e.pointerId);
    updatePreview();
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!playing || !dragging) return;
    var p = pointerToCell(e.clientX, e.clientY);
    if (p) { curR = p.r; curC = p.c; updatePreview(); }
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    try { boardEl.releasePointerCapture(e.pointerId); } catch (err) {}
    if (!playing) return;
    var rect = rectFromDrag();
    var info = sumInRect(rect.r0, rect.r1, rect.c0, rect.c1);
    clearPreviewClass();
    if (info.sum === 10 && info.count > 0) {
      commitClear();
    } else {
      if (info.count > 0) {
        playWrongSound();
        hintEl.textContent = "합이 10이 아닙니다. (현재 " + info.sum + ")";
        hintEl.classList.add("err");
      } else {
        hintEl.textContent = "";
        hintEl.classList.remove("err");
      }
    }
    e.preventDefault();
  }

  function onPointerCancel() {
    dragging = false;
    clearPreviewClass();
    hintEl.textContent = "";
    hintEl.classList.remove("err");
  }

  /* ══ 타이머 ══ */
  function tickTime() {
    if (!playing) return;
    timeLeft -= 1;
    if (timeLeft < 0) timeLeft = 0;
    timeEl.textContent = String(timeLeft);
    updateTimerBar();
    if (timeRow) {
      timeRow.classList.remove("warn", "danger");
      if (timeLeft <= 15) timeRow.classList.add("danger");
      else if (timeLeft <= 30) timeRow.classList.add("warn");
    }
    if (timeLeft <= 0) endGame(false);
  }

  /* ══ 게임 종료 ══ */
  function endGame(isClear) {
    playing = false;
    if (timerId !== null) { clearInterval(timerId); timerId = null; }
    boardEl.classList.add("finished");
    finalScoreEl.textContent = String(score);
    if (clearedEl) clearedEl.textContent = String(clearedTotal);
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    hintEl.textContent = "";
    hintEl.classList.remove("err");

    var titleEl = overlay.querySelector(".overlay-title-text");
    var subEl = overlay.querySelector(".overlay-score-label");
    if (isClear) {
      playClearSound();
      if (titleEl) titleEl.textContent = "🎉 클리어!";
      if (subEl) subEl.textContent = "최종 점수";
    } else {
      playGameOverSound();
      if (titleEl) titleEl.textContent = "게임 종료!";
      if (subEl) subEl.textContent = "최종 점수";
    }
  }

  /* ══ 게임 리셋 ══ */
  function resetGame() {
    playing = true;
    animating = false;
    timeLeft = TIME_LIMIT_SEC;
    timeEl.textContent = String(timeLeft);
    if (timeRow) timeRow.classList.remove("warn", "danger");
    updateTimerBar();
    clearedTotal = 0;
    score = 0;
    if (clearedEl) clearedEl.textContent = "0";
    syncScore();
    hintEl.textContent = "";
    hintEl.classList.remove("err");
    boardEl.classList.remove("finished");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    var titleEl = overlay.querySelector(".overlay-title-text");
    if (titleEl) titleEl.textContent = "게임 종료!";
    initGrid();
    buildDom();
    clearPreviewClass();
    if (timerId !== null) clearInterval(timerId);
    timerId = window.setInterval(tickTime, 1000);
  }

  function applyDarkMode(isDark) {
    document.body.classList.toggle("dark-theme", isDark);
    if (optDark) optDark.checked = isDark;
    if (optDarkStart) optDarkStart.checked = isDark;
  }

  /* ── 시작화면 → 게임 전환 ── */
  function launchGame() {
    optVolume.value = optVolumeStart.value;
    optBgm.checked = optBgmStart.checked;
    startScreen.style.display = "none";
    gamePage.style.display = "";
    applyBgmVolume();
    ensureAudioFromUser();

    playing = true;
    animating = false;
    timeLeft = TIME_LIMIT_SEC;
    timeEl.textContent = String(timeLeft);
    if (timeRow) timeRow.classList.remove("warn", "danger");
    clearedTotal = 0;
    score = 0;
    scoreEl.textContent = "0";
    if (clearedEl) clearedEl.textContent = "0";
    hintEl.textContent = "";
    hintEl.classList.remove("err");
    overlay.classList.add("hidden");
    var titleEl = overlay.querySelector(".overlay-title-text");
    if (titleEl) titleEl.textContent = "게임 종료!";

    initGrid();
    setGridTemplate();
    buildDom();
    updateTimerBar();

    if (timerId !== null) clearInterval(timerId);
    timerId = window.setInterval(tickTime, 1000);

    boardEl.removeEventListener("pointerdown", onPointerDown);
    boardEl.removeEventListener("pointermove", onPointerMove);
    boardEl.removeEventListener("pointerup", onPointerUp);
    boardEl.removeEventListener("pointercancel", onPointerCancel);
    boardEl.addEventListener("pointerdown", onPointerDown);
    boardEl.addEventListener("pointermove", onPointerMove);
    boardEl.addEventListener("pointerup", onPointerUp);
    boardEl.addEventListener("pointercancel", onPointerCancel);
  }

  /* ── 버튼 이벤트 ── */
  btnStart.addEventListener("click", function () { launchGame(); });

  btnRestart.addEventListener("click", function () {
    ensureAudioFromUser();
    resetGame();
  });

  btnQuit.addEventListener("click", function () {
    if (timerId !== null) { clearInterval(timerId); timerId = null; }
    stopBgm();
    overlay.classList.add("hidden");
    gamePage.style.display = "none";
    startScreen.style.display = "";
    if (optBgmStart.checked) startBgm();
  });

  btnReset.addEventListener("click", function () {
    ensureAudioFromUser();
    resetGame();
  });

  optDark.addEventListener("change", function () { applyDarkMode(optDark.checked); });

  optBgm.addEventListener("change", function () {
    if (optBgm.checked) ensureAudioFromUser(); else stopBgm();
  });

  optVolume.addEventListener("input", function () { applyBgmVolume(); });

  optDarkStart.addEventListener("change", function () { applyDarkMode(optDarkStart.checked); });

  optBgmStart.addEventListener("change", function () {
    if (optBgmStart.checked) { applyBgmVolume(); startBgm(); } else stopBgm();
  });

  optVolumeStart.addEventListener("input", function () { applyBgmVolume(); });

  window.addEventListener("resize", function () { updateTimerBar(); });

  startScreen.addEventListener(
    "pointerdown",
    function () { applyBgmVolume(); if (optBgmStart.checked) startBgm(); },
    { once: true }
  );

  applyBgmVolume();
})();
