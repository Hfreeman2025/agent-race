import { execFileSync } from "node:child_process";

// Agent Race has no audio. These guards also forbid opening a device if that changes.
export function deviceFreeAudio() {
  class DisabledAudioContext {
    constructor() {
      throw new Error("Audio devices are disabled in automated checks");
    }
  }
  window.AudioContext = DisabledAudioContext;
  window.webkitAudioContext = DisabledAudioContext;
  HTMLMediaElement.prototype.play = function () {
    this.muted = true;
    return Promise.resolve();
  };
  navigator.mediaDevices &&
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(new DOMException("Devices disabled in automated checks", "NotAllowedError")),
    });
}
export async function silentBrowser(playwright, engine) {
  assertBrowserSlot();
  const browser = await playwright[engine].launch({
    headless: true,
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

export function assertBrowserSlot() {
  const active = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
    .split("\n")
    .filter((line) => {
      const command = line.trim().replace(/^\d+\s+/u, "");
      return (
        command.startsWith("/") &&
        !command.includes(" --type=") &&
        /Chrome for Testing --.*--remote-debugging-pipe|\/(?:headless_shell|chrome-headless-shell|chrome) .*--remote-debugging-pipe|\/firefox .*juggler|\/Playwright .*--inspector-pipe|\/MiniBrowser/u.test(
          command,
        )
      );
    });
  if (active.length)
    throw new Error(
      `Browser slot occupied by ${active.map((line) => line.trim().split(/\s/u)[0]).join(", ")}; no browser launched.`,
    );
}
