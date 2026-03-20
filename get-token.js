import 'dotenv/config';
import express from 'express';
import axios from 'axios';

const app = express();
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const API_KEY = process.env.UPSTOX_API_KEY;
const API_SECRET = process.env.UPSTOX_API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error("❌ Missing UPSTOX_API_KEY or UPSTOX_API_SECRET in .env file.");
  console.error("Please copy .env.example to .env and fill in your Upstox credentials.");
  process.exit(1);
}

// Ensure the project works if .env exists
console.log("=================================================");
console.log("🚀 Upstox OAuth Token Generator 🚀");
console.log("=================================================");
console.log("\n1. Click the link below to login to Upstox:");
const loginUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${API_KEY}&redirect_uri=${REDIRECT_URI}`;
console.log(`   \x1b[36m${loginUrl}\x1b[0m\n`);

let server = app.listen(PORT, () => {
  console.log(`2. Waiting for login on http://localhost:${PORT}...`);
});

app.get('/', (req, res) => {
  res.send(`Please use the login URL printed in the console to start the flow.`);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.status(400).send("No authorization code found in the query parameters.");
    return;
  }

  res.send("<h2>Authenticating with Upstox... Check your terminal!</h2>");

  try {
    console.log("✅ Code received! Exchanging for access token...");
    
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', API_KEY);
    params.append('client_secret', API_SECRET);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('grant_type', 'authorization_code');

    const headers = {
      'accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const response = await axios.post('https://api.upstox.com/v2/login/authorization/token', params, { headers });
    
    const token = response.data.access_token;
    
    console.log("\n=================================================");
    console.log("🎉 SUCCESS! YOUR ACCESS TOKEN IS GENERATED 🎉");
    console.log("=================================================\n");
    console.log(token);
    console.log("\n👉 COPY above string and PASTE it into your .env file as: ");
    console.log(`UPSTOX_ACCESS_TOKEN="${token.substring(0,25)}..."`);
    console.log("\n(This script will now exit...)\n");
    
    server.close(() => process.exit(0));

  } catch (error) {
    console.error("❌ Failed to exchange code for token:");
    console.error(error.response?.data || error.message);
    server.close(() => process.exit(1));
  }
});
