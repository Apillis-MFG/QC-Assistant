export const BALLOON_SETTINGS_KEY = "qca_balloon_settings_v1";

export const defaultBalloonSettings = {
  diameter: 24,
  fontSize: 11,
  leaderScale: 1,
  toolButtonStyle: "icon-text",
  showLeaderLine: true,
};

export function loadBalloonSettings() {
  try {
    const raw = localStorage.getItem(BALLOON_SETTINGS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return {
      diameter: Number.isFinite(saved?.diameter) ? saved.diameter : defaultBalloonSettings.diameter,
      fontSize: Number.isFinite(saved?.fontSize) ? saved.fontSize : defaultBalloonSettings.fontSize,
      leaderScale: Number.isFinite(saved?.leaderScale) ? saved.leaderScale : defaultBalloonSettings.leaderScale,
      toolButtonStyle: saved?.toolButtonStyle === "icon-only" ? "icon-only" : defaultBalloonSettings.toolButtonStyle,
      showLeaderLine:
        typeof saved?.showLeaderLine === "boolean" ? saved.showLeaderLine : defaultBalloonSettings.showLeaderLine,
    };
  } catch {
    return { ...defaultBalloonSettings };
  }
}

export function saveBalloonSettings(settings) {
  try {
    localStorage.setItem(BALLOON_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
