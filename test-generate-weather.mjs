import https from "https";

const url = "http://localhost:54321/functions/v1/update-weather-xml";

const options = {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + process.env.SUPABASE_ANON_KEY,
  },
};

console.log("Attempting to trigger update-weather-xml function...");
console.log("URL:", url);

const req = https.request(url.replace("https://", "http://").replace(/:\d+/, ":54321"), options, (res) => {
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => {
    console.log("Response status:", res.statusCode);
    console.log("Response:", data);
  });
});

req.on("error", (e) => {
  console.error("Error:", e.message);
});

req.end(JSON.stringify({}));
