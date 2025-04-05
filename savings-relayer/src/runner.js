const { spawn } = require("child_process");
const path = require("path");

function startRelayer() {
  console.log("Starting relayer process...");
  
  const relayer = spawn("node", [path.join(__dirname, "relayer.js")], {
    stdio: "inherit"
  });
  
  relayer.on("close", (code) => {
    console.log(`Relayer process exited with code ${code}`);
    
    // Restart if crashed (with a delay)
    if (code !== 0) {
      console.log("Restarting relayer in 5 seconds...");
      setTimeout(startRelayer, 5000);
    }
  });
}

startRelayer();