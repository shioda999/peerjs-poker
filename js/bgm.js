// bgm.js
const BGM = {
  tracks: {},          // { name: Audio }
  tracks_volume: {},   // { name: 0.1～1.0 }
  current: null,       // 再生中のAudio
  masterVolume: 0.1,   // 全体ボリューム
  enabled: false,
  fadeTimer: null
};

/**
 * BGMをbase64でロードして名前を付ける
 * @param {string} name
 * @param {string} base64
 * @param {number} vol 曲ごとの音量(0～1)
 */
function loadBGM(name, base64, vol = 0.1) {
  const audio = new Audio("data:audio/mp3;base64," + base64);
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = vol * BGM.masterVolume;
  BGM.tracks[name] = audio;
  BGM.tracks_volume[name] = vol;
}

/**
 * BGM再生（切り替え時は前の曲をfadeOutして止める）
 * @param {string} name
 */
function playBGM(name) {
  if (!BGM.enabled) return;
  if (!BGM.tracks[name]) return;

  // 既に同じ曲なら何もしない
  if (BGM.current === BGM.tracks[name]) return;

  const newAudio = BGM.tracks[name];
  newAudio.volume = (BGM.tracks_volume[name] ?? 0.1) * BGM.masterVolume;

  // 前の曲があればフェードアウトして停止
  if (BGM.current) {
    fadeOut(BGM.current, 1.0, () => {
      BGM.current.pause();
      BGM.current.currentTime = 0;
      BGM.current = newAudio;
      BGM.current.play().catch(() => {});
    });
  } else {
    BGM.current = newAudio;
    BGM.current.play().catch(() => {});
  }
}

/**
 * BGM停止
 */
function stopBGM(fadeSec = 1.0) {
  if (!BGM.current) return;
  fadeOut(BGM.current, fadeSec, () => {
    BGM.current.pause();
    BGM.current.currentTime = 0;
    BGM.current = null;
  });
}

/**
 * フェードアウト
 */
function fadeOut(audio, sec, onEnd) {
  clearInterval(BGM.fadeTimer);
  const step = audio.volume / (sec * 60);
  BGM.fadeTimer = setInterval(() => {
    audio.volume = Math.max(0, audio.volume - step);
    if (audio.volume <= 0.01) {
      clearInterval(BGM.fadeTimer);
      onEnd?.();
    }
  }, 1000 / 60);
}

/**
 * ON / OFF
 */
function setBGMEnabled(flag) {
  BGM.enabled = flag;
  if (!flag) stopBGM(0.5);
}

/**
 * マスターボリューム変更（0～1）
 */
function setMasterVolume(vol) {
  BGM.masterVolume = Math.max(0, Math.min(1, vol));
  if (BGM.current) {
    const name = Object.keys(BGM.tracks).find(n => BGM.tracks[n] === BGM.current);
    BGM.current.volume = (BGM.tracks_volume[name] ?? 0.1) * BGM.masterVolume;
  }
}

/**
 * 一時停止 / 再開
 */
function pauseBGM() {
  if (BGM.current) BGM.current.pause();
}

function resumeBGM() {
  if (BGM.current && BGM.enabled) BGM.current.play().catch(() => {});
}

// タブ非アクティブ時に停止
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseBGM();
  else resumeBGM();
});
