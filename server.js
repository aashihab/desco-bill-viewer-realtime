const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(bodyParser.json({ limit: '1mb' }));

// Simple rate limiting / placeholder (improve for production)
let lastTime = 0;

app.post('/fetch', async (req, res) => {
  try {
    const meter = req.body.meter;
    if (!meter) return res.status(400).json({ error: 'meter required' });
    // basic rate limit
    const now = Date.now();
    if (now - lastTime < 700) return res.status(429).json({ error: 'Too Many Requests' });
    lastTime = now;

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

    // Navigate to DESCO customer login page
    await page.goto('https://prepaid.desco.org.bd/customer/#/customer-login', { waitUntil: 'networkidle2', timeout: 30000 });

    // The site is a SPA. Fill meter/account number input and submit.
    // NOTE: selectors below are guesses; you must adjust them to match actual site elements.
    await page.waitForTimeout(1000);
    // Try common input selectors
    const inputSelectors = ['input[type=text]', 'input[placeholder]', 'input[name=meter]', '#meter', '#account_number'];
    let found = false;
    for (const sel of inputSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click({ clickCount: 3 });
          await el.type(meter, { delay: 30 });
          found = true;
          break;
        }
      } catch(e){}
    }
    // Try clicking login button - selectors may need update
    const buttons = await page.$$('button');
    if (buttons.length > 0) {
      await buttons[buttons.length - 1].click();
    } else {
      // fallback: press Enter
      await page.keyboard.press('Enter');
    }

    // Wait for recharge history to load - this may require tuning
    await page.waitForTimeout(3000);

    // Click the "Details" for the latest entries to open popup - selector needs tuning
    // We'll try to click any "Details" or elements that look clickable in list
    const detailBtn = await page.$x("//button[contains(., 'Details') or contains(., 'detail') or contains(., 'Details')]");
    if (detailBtn.length > 0) {
      await detailBtn[0].click();
      await page.waitForTimeout(1200);
    } else {
      // attempt to click a table row to open popup
      const rows = await page.$$('tr');
      if (rows.length>0) await rows[0].click();
      await page.waitForTimeout(1200);
    }

    // Now the popup should be visible. Extract text content
    const popup = await page.$('div.modal, div[role=dialog], .modal-content, .v-dialog__content');
    let result = { recharges: [] };
    if (popup) {
      const text = await page.evaluate(el => el.innerText, popup);

      // Very simple parsing based on labels (adjust if needed)
      // We'll split by lines and find label:value pairs
      const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
      // Attempt to parse a single recharge
      const parseObj = {};
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith('date')) parseObj.date = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('order no')) parseObj.order_no = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('name')) parseObj.name = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('meter no')) parseObj.meter_no = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('account no')) parseObj.account_no = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('status')) parseObj.status = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('recharge')) parseObj.recharge = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('operator')) parseObj.operator = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('sequence')) parseObj.sequence = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('energy')) parseObj.energy_cost = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('demand')) parseObj.demand_charge = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('meter rent')) parseObj.meter_rent = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('vat')) parseObj.vat = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('rebate')) parseObj.rebate = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('gross')) parseObj.gross_amount = line.split(':').slice(1).join(':').trim();
        else if (lower.startsWith('token')) parseObj.token = line.split(':').slice(1).join(':').trim();
      }
      result.recharges.push(parseObj);
    }

    await browser.close();
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('DESCO proxy running on port', PORT));
