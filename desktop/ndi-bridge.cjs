const fs = require("node:fs");
const { spawn } = require("node:child_process");

function startNdiBridge({ executablePath, spawnProcess = spawn, fileExists = fs.existsSync, setTimer = setTimeout, clearTimer = clearTimeout, log = console.warn }) {
  let child;
  let timer;
  let stopped = false;
  let failures = 0;
  function launch() {
    if (stopped || !fileExists(executablePath)) return;
    child = spawnProcess(executablePath, ["--ndi-only", "--parent-pid", String(process.pid)], {
      cwd: require("node:path").dirname(executablePath), windowsHide: true, stdio: "ignore"
    });
    let handled = false;
    const restart = () => {
      if (handled) return;
      handled = true;
      child = null;
      // Bounded retries: a port conflict cannot create a permanent restart loop.
      if (!stopped && ++failures <= 3) timer = setTimer(launch, failures * 3000);
    };
    child.once("error", (error) => { log("NDI worker:", error.message); restart(); });
    child.once("exit", restart);
  }
  launch();
  return { stop() { stopped = true; if (timer) clearTimer(timer); child?.kill(); child = null; } };
}
module.exports = { startNdiBridge };
