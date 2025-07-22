require('dotenv').config();           
const fs = require('fs');
const csv = require('csv-parser');
const puppeteer = require('puppeteer');

(async () => {
    // 0. Load Domains from csv
    const companies = [];
    await new Promise((resolve, reject) => {
        fs.createReadStream('companies.csv')
            .pipe(csv())
            .on('data', row => {
                companies.push(row.domain.trim());
            })
            .on('end', () => resolve())
            .on('error', reject);
    });
    
    console.log(`Loaded ${companies.length} companies from CSV`);

    // 1. Launch browser
    const browser = await puppeteer.launch({
    headless: false,                     
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

    console.log('Logged in');

    // 3. Loop over domains
    const typeBoxSelector = 'input[placeholder="Search by company or domain name"]';
    const linkSelector = 'table tbody tr td a.text-indigo-600';
    const results = [];

    for (const domain of companies) {
        await page.type(typeBoxSelector, domain);
        try {
            await page.waitForSelector(linkSelector, { visible: true, timeout: 10000 });
            // Then pull out the href
            const url = await page.$eval(linkSelector, a => a.href);
            console.log('Importer detail URL:', url);
            results.push({domain, url});
        } catch {
            console.log("No results")
            results.push({domain, url:''});
        }

        await page.goto('https://app.revenuevessel.com/dashboard/importers', { waitUntil: 'networkidle2' });

    }
    // 4. (For now) just close
    await browser.close();

    // 5. Write results to CSV
    const header = 'domain,url\n';
    const csvLines = results
    .map(r => {
        // escape any quotes in the values
        const d = r.domain.replace(/"/g, '""');
        const u = r.url.replace(/"/g, '""');
        return `"${d}","${u}"`;
    })
    .join('\n');
    fs.writeFileSync('results.csv', header + csvLines);    

})();

