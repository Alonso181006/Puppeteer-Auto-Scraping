require('dotenv').config();              // only if you installed dotenv
const puppeteer = require('puppeteer');

(async () => {
    // 1. Launch browser
    const browser = await puppeteer.launch({
    headless: false,                     // set to true once you’re comfortable
    defaultViewport: null,
    args: ['--start-maximized']
    });
    const page = await browser.newPage();

    // 2. Log in
    await page.goto('https://app.revenuevessel.com/login', { waitUntil: 'networkidle2' });
    await page.type('#email', process.env.RV_USER);
    await page.type('#password', process.env.RV_PASS);
    await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    console.log('✅ Logged in!');

    // --- from here you can start your search loop, clicks, scrapes, etc. ---
    await page.type('input[placeholder="Search by company or domain name"]', 'Magic Spoon');
    // Wait for the row to appear…
    await page.waitForSelector('table tbody tr td a.text-indigo-600', { visible: true });

    // Then pull out the href
    const importerUrl = await page.$eval(
    'table tbody tr td a.text-indigo-600',
    a => a.href
    );

    console.log('Importer detail URL:', importerUrl);


    // 4. (For now) just close
    await browser.close();
})();

