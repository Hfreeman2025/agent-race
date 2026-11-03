// Agent Race has no audio. These guards also forbid opening a device if that changes.
export function deviceFreeAudio() {
  class DisabledAudioContext {
    constructor() {
      throw new Error("Audio devices are disabled in automated checks");
    }
  }
  window.AudioContext = DisabledAudioContext;
  window.webkitAudioContext = DisabledAudioContext;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    this.muted = true;
    return Promise.resolve();
  };
  void play;
  navigator.mediaDevices &&
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(new DOMException("Devices disabled in automated checks", "NotAllowedError")),
    });
}
export async function silentBrowser(playwright, engine) {
  const executablePath =
    engine === "chromium"
      ? playwright.chromium.executablePath()
      : new URL(
          `../.race/browsers/${playwright[engine].executablePath().match(/(?:webkit|firefox)-[^/]+\/.+$/u)?.[0]}`,
          import.meta.url,
        ).pathname;
  const browser = await playwright[engine].launch({
    headless: true,
    executablePath,
    args: engine === "chromium" ? ["--mute-audio"] : [],
    ...(engine === "firefox"
      ? { firefoxUserPrefs: { "media.volume_scale": "0.0", "media.autoplay.default": 5 } }
      : {}),
  });
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await newContext(options);
    await context.addInitScript(deviceFreeAudio);
    return context;
  };
  return browser;
}
