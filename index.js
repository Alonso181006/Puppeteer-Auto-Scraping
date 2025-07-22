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
    let url = '';

    for (const domain of companies) {
        
        await page.type(typeBoxSelector, domain);
        try {
            await page.waitForSelector(linkSelector, { visible: true, timeout: 10000 });
            // Then pull out the href
            url = await page.$eval(linkSelector, a => a.href);
            console.log('Importer detail URL:', url);
            results.push({domain, url});
        } catch {
            console.log("No results")
            results.push({domain, url});
        }

        if(url != '') {
            await page.goto(url, { waitUntil: 'networkidle2' });
            await page.waitForSelector("nav button", { timeout: 5000 });

            // Summary Scraping
            try {
                await page.evaluate(() => {
                    const sp = [...(document.querySelectorAll("nav button"))]
                        .find(b => b.textContent.trim() === "Summary");
                    if (!sp) {
                        throw new Error("Summary button not found");
                    }
                    sp.click();
                });

                await page.waitForSelector(
                'button[aria-controls*="Clearance Summary"]',{ timeout: 5000 });

                try {
                    await page.evaluate(() => {
                        const btnCs = document.querySelector('button[aria-controls*="Clearance Summary"]');   
                        if (btnCs.disabled) {
                            throw new Error("Clearance Summary not active");
                        }
                    });
                    await page.click('button[aria-controls*="Clearance Summary"]');

                    // Scrape Total Clearances
                    await page.waitForSelector('div[data-state="active"] dd.text-gray-900',
                    { visible: true, timeout: 5000 });

                    const totalClearances = await page.$eval(
                    'div[data-state="active"] dd.text-gray-900',
                    el => el.textContent.trim()
                    );
                    console.log('Total Customs Clearances:', totalClearances);


                } catch (err) {
                    console.warn(`Skipping Clearance Summary Data from ${domain} because: ${err.message}`);
                }

                await page.evaluate(() => {
                    const btnCs = document.querySelector('button[aria-controls*="Ocean Manifest Summary"]');   
                    if (btnCs.disabled) {
                        throw new Error("Ocean Manifest Summary not active");
                    }
                });
                await page.click('button[aria-controls*="Ocean Manifest Summary"]');

                await page.waitForSelector('div[data-state="active"] dd.text-gray-900', { visible: true, timeout: 5000 });

                // 2. Grab the first such <dd>
                const totalShipments = await page.$eval(
                'div[data-state="active"] dd.text-gray-900',dd => dd.textContent.trim());
                console.log('Total Shipments:', totalShipments);``

            } catch (err) {
                console.warn(`Skipping Scraping Summary Data from ${domain} because: ${err.message}`);
            }

            // Service Providers Scraping
            try {
                await page.evaluate(() => {
                    const sp = [...(document.querySelectorAll("nav button"))]
                        .find(b => b.textContent.trim() === "Service Providers");
                    if (!sp) {
                        throw new Error("Service Providers button not found");
                    }
                    sp.click();
                });

                // Should Have the button always if the Sp Btn found
                await page.waitForSelector(
                'button[aria-controls*="Customs Brokers"]',{ timeout: 5000 });

                await page.evaluate(() => {
                    const cb = document.querySelector('button[aria-controls*="Customs Brokers"]');   
                    if (cb.disabled ) {
                        throw new Error("Customs button not active");
                    }
                });

                await page.click('button[aria-controls*="Customs Brokers"]');

                // Scrape Customs Broker Name & #
                await page.waitForSelector('div[data-state="active"] table tbody tr',{ timeout: 5000 });

                const { name, total } = await page.evaluate(() => {
                    const row = document.querySelector('div[data-state="active"] table tbody tr');
                    if (!row) throw new Error("No data row found");

                    const nameCell = row.querySelector('td a');
                    const name = nameCell ? nameCell.textContent.trim() : null;

                    const totalCell = row.querySelector('td:nth-child(2)');
                    const total = totalCell ? totalCell.textContent.trim() : null;

                    return { name, total };
                });

                console.log("Name:", name);   
                console.log("Total:", total); 
            } catch (err) {
                console.warn(`Skipping Scraping Customs Data from ${domain} because: ${err.message}`);
            }
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

