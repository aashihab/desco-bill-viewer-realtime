Puppeteer Proxy - README

1. Install dependencies:
   npm install

2. Run:
   node server.js

3. Deploying:
   - Use a VPS (DigitalOcean, AWS EC2) with Node.js.
   - Ensure necessary fonts and libraries for puppeteer are available.
   - For production, add authentication (API key), HTTPS, and better rate-limiting.

4. Endpoint:
   POST /fetch
   Body: { "meter": "29147951" }
   Response: JSON { "recharges": [ { ...fields... }, ... ] }

Note:
- You must adjust selectors and waits in server.js if DESCO site changes.
- Puppeteer may require additional launch args on some hosts.
