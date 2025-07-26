require('dotenv').config();           
const fs = require('fs');
const csv = require('csv-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { OpenAI } = require("openai");
const path = require('path');
const { url } = require('inspector');


const openAIClient = new OpenAI({apiKey:process.env.OPEN_API_KEY});


(async () => {
    // -1. External Files Setup

    const countryPromptPath = path.join(__dirname, 'promptFindCountry.txt');
    // const promptYetiPath = path.join(__dirname, 'promptCheckYeti.txt');
    const portsPath = path.join(__dirname, 'ports_mapping.json')
    const countryPrompt = fs.readFileSync(countryPromptPath, 'utf-8');
    // const yetiPrompt = fs.readFileSync(promptYetiPath, 'utf-8');
    const rawJSonPorts = fs.readFileSync(portsPath, 'utf-8');
    const portCountryMap = JSON.parse(rawJSonPorts);


    // 0. Load Domains from csv
    const companies = [];
    await new Promise((resolve, reject) => {
        fs.createReadStream('clay5000.csv')
            .pipe(csv())
            .on('data', row => {
                companies.push({
                    companyName: row.company_name?.trim() || "No Results On Clay",
                    domain: row.domain?.trim() || "No Results On Clay",
                    legalName: row.legal_name?.trim() || "No Results On Clay",
                    location: row.hq_location?.trim() || "No Results On Clay"
                });
            })
            .on('end', () => resolve())
            .on('error', reject);
    });

    //Set Results Header 
    const header = 'Name,UrlRV,URLYeti,Total Customs Clearances,Total Shipments,Customs Broker,Trade Data, Port Type\n';
    fs.writeFileSync('results.csv', header);
    
    console.log(`Loaded ${companies.length} companies from CSV`);

    // 1. Launch browser
    let browser = await puppeteer.launch({
    headless: false,                     
    defaultViewport: null,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", 
    userDataDir: "/Users/abastida/Library/Application Support/Google/Chrome/Default", 
    args: ['--start-maximized']
    });
    let page = await browser.newPage();

    // 2. Log in - Rev Vessel
    await page.goto('https://app.revenuevessel.com/login', { waitUntil: 'networkidle2' });
    await page.type('#email', process.env.RV_USER);
    await page.type('#password', process.env.RV_PASS);
    await Promise.all([
    await page.click('button[type="submit"]'),
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    console.log('Logged in');


    // 3. Loop over domains
    const typeBoxRV = 'input[placeholder="Search by company or domain name"]';
    // const typeBoxYeti = "input[placeholder=\"Find Any Company's Suppliers\"]";
    const linkSelectorRV = 'table tbody tr td a.text-indigo-600';
    let results = [];

    for (let i = 0; i < companies.length; i++) {
        // if (i % 2 === 0 && i !== 0) {
        //     await browser.close();

        //     browser = await puppeteer.launch({
        //     headless: false,                     
        //     defaultViewport: null,
        //     executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", 
        //     userDataDir: "/Users/abastida/Library/Application Support/Google/Chrome/Default", 
        //     args: ['--start-maximized']
        //     });
        //     page = await browser.newPage();

        //         // 2. Log in - Rev Vessel
        //     await page.goto('https://app.revenuevessel.com/login', { waitUntil: 'networkidle2' });
        //     await page.type('#email', process.env.RV_USER);
        //     await page.type('#password', process.env.RV_PASS);
        //     await Promise.all([
        //     page.click('button[type="submit"]'),
        //     page.waitForNavigation({ waitUntil: 'networkidle2' })
        //     ]);

        //     console.log('Logged in');
        //     await importYetiLogIn(page);
        //     await page.goto('https://app.revenuevessel.com/dashboard/importers', { waitUntil: 'networkidle2'});


        // }
        const { domain, companyName, legalName, location } = companies[i];

        let urlRV = "";
        let urlYeti = "";
        let customsBrokersStr = "";
        let totalShipments;
        let totalClearances;
        let tradeDataStr = "";
        let portTypeStr = "";
        let textData = [];

        // Domain Check
        await clearAndType(page, typeBoxRV, domain);
        urlRV = await getImporterDetailURL(page, linkSelectorRV, domain);

        const searchVariants = [legalName, companyName, companyName.replace(/\s+/g, ''), legalName.replace(/\s+/g, '')];

        // Exact !!!
        // if (!urlRV) {
        //     await page.goto('https://app.revenuevessel.com/dashboard/importers', { waitUntil: 'networkidle2' });

        //     for (const term of searchVariants) {
        //         if (urlRV) break; // Already found a match
        //         await clearAndType(page, typeBoxRV, term);
        //         urlRV = await getImporterDetailURL(page, linkSelectorRV);
        //     }
        // }        

        // Fuzzy Seach !!!
        // if (!url) {
        //     await page.goto('https://app.revenuevessel.com/dashboard/importers?companyNameSearchStrategy=Fuzzy&', { waitUntil: 'networkidle2' });

        //     for (const term of searchVariants) {
        //         if (url) break; // Already found a match
        //         await clearAndType(page, typeBoxRV, term);
        //         url = await getImporterDetailURL(page, linkSelector);
        //     }
        // }

        if(urlRV) {
            await page.goto(urlRV, { waitUntil: 'networkidle2' });
            await page.waitForSelector("nav button", { timeout: 3000 });

            // Summary Scraping
            try {
                await page.evaluate(() => {
                    const btnS = [...(document.querySelectorAll("nav button"))]
                        .find(b => b.textContent.trim() === "Summary");
                    if (!btnS) {
                        throw new Error("Summary button not found");
                    }
                    btnS.click();
                });


                await page.waitForSelector(
                'button[aria-controls*="Clearance Summary"]',{ timeout: 3000 });

                try {
                    await page.evaluate(() => {
                        const btnCS = document.querySelector('button[aria-controls*="Clearance Summary"]');   
                        if (btnCS.disabled) {
                            throw new Error("Clearance Summary not active");
                        }
                    });
                    await page.click('button[aria-controls*="Clearance Summary"]');

                    // Scrape Total Clearances
                    await page.waitForSelector('div[data-state="active"] dd.text-gray-900',
                    { visible: true, timeout: 3000 });

                    totalClearances = await page.$eval(
                    'div[data-state="active"] dd.text-gray-900',
                    el => el.textContent.trim()
                    );
                    console.log('Total Customs Clearances:', totalClearances);


                } catch (err) {
                    console.warn(`Skipping Clearance Summary Data from ${domain} because: ${err.message}`);
                }

                await page.evaluate(() => {
                    const btnOMS = document.querySelector('button[aria-controls*="Ocean Manifest Summary"]');   
                    if (btnOMS.disabled) {
                        throw new Error("Ocean Manifest Summary not active");
                    }
                });
                await page.click('button[aria-controls*="Ocean Manifest Summary"]');

                await page.waitForSelector('div[data-state="active"] dd.text-gray-900', { visible: true, timeout: 3000 });

                // 2. Grab the first such <dd>
                totalShipments = await page.$eval(
                'div[data-state="active"] dd.text-gray-900',dd => dd.textContent.trim());
                console.log('Total Shipments:', totalShipments);

            } catch (err) {
                console.warn(`Skipping Scraping Summary Data from ${domain} because: ${err.message}`);
            }


            // Trade Lanes Scraping
            try {
                await page.evaluate(() => {
                    const btnTL = [...(document.querySelectorAll("nav button"))]
                        .find(b => b.textContent.trim() === "Trade Lanes");
                    if (!btnTL) {
                        throw new Error("Trade Lanes button not found");
                    }
                    btnTL.click();
                });

                await page.waitForSelector(
                'button[aria-controls*="Ocean Trade Lanes"]',{ timeout: 3000 });

                let airManifestRows = [];
                let oceanManifestRows = [];
                let portType = [];

                // Ocean
                oceanManifestRows = await getTradeLanesData(page, "Ocean Trade Lanes", domain, 0,2);
                // Air
                airManifestRows = await getTradeLanesData(page, "Air Trade Lanes", domain, 0,2);
                // Port Type
                portType = await getTradeLanesData(page, "Destination Ports", domain, 1, 2);

                const allRows = [...airManifestRows, ...oceanManifestRows];

                let combinedRows = await combinedSamePorts(allRows);
                let portTypeCombined = await combinedSamePorts(portType);

                portTypeStr = await sortStringifyArray(portTypeCombined, 'port', 'shipments', false);
                console.log(portTypeStr);

                // console.log(combinedRows);

                // Finding Country of Port of Lading 
                let foundCities = [];
                let missingCities = [];

                for (data of combinedRows) {
                    const possibleNames = data.port.split(";").map(name => name.trim());
                    let found = false;
                    for (const name of possibleNames) {
                        if (portCountryMap[name]) {
                            data.country = portCountryMap[name];
                            found = true;
                            break;
                        }
                    }
                    if (found) {
                        foundCities.push(data);
                    } else {
                        missingCities.push(data);
                    }
                }
                let enriched = [];

                console.log("Found Cities:", foundCities)
                console.log("Missing Cities:", missingCities)


                if (missingCities.length > 0) {

                    const enrichData = JSON.stringify(missingCities, null, 2);

                    const chatCompletion = await openAIClient.chat.completions.create({
                        model : "gpt-4.1-nano",
                        messages : [
                            { role: "system", content: countryPrompt },
                            { role: "user",  content: enrichData }
                        ]
                    });

                    const reply = chatCompletion.choices[0].message.content.trim();
                    enriched = JSON.parse(reply).concat(foundCities);

                } else {
                    enriched = foundCities;
                }

                const combinedByCountry = enriched.reduce((acc, { country, shipments }) => {
                    if (!country) return acc; // skip if country is null
                    acc[country] = (acc[country] || 0) + shipments; // add to existing or start at 0
                    return acc;
                }, {});

                let tradeData = Object.entries(combinedByCountry).map(([country, shipments]) => ({
                    country,
                    shipments
                }));

                tradeDataStr = await sortStringifyArray(tradeData, 'country', 'shipments', true);
                console.log("Result: ", tradeDataStr);

            } catch (err) {
                console.warn(`Skipping Scraping Trade Lanes Data from ${domain} because: ${err.message}`);
            }

            // Service Providers Scraping
            try {
                await page.evaluate(() => {
                    const btnSP = [...(document.querySelectorAll("nav button"))]
                        .find(b => b.textContent.trim() === "Service Providers");
                    if (!btnSP) {
                        throw new Error("Service Providers button not found");
                    }
                    btnSP.click();
                });

                // Should Have the button always if the Sp Btn found
                await page.waitForSelector(
                'button[aria-controls*="Customs Brokers"]',{ timeout: 3000 });

                await page.evaluate(() => {
                    const btnCB = document.querySelector('button[aria-controls*="Customs Brokers"]');   
                    if (btnCB.disabled ) {
                        throw new Error("Customs button not active");
                    }
                });

                await page.click('button[aria-controls*="Customs Brokers"]');

                // Scrape Customs Broker Name and Number
                await page.waitForSelector('div[data-state="active"] table tbody tr',{ timeout: 3000 });

                let customsBrokers = await page.evaluate(() => {
                    const rows = document.querySelectorAll('div[data-state="active"] table tbody tr');
                    if (!rows) throw new Error("No data row found");

                    return [...rows].map(row => {
                        const nameCell = row.querySelector('td a');
                        const name = nameCell ? nameCell.textContent.trim() : null;

                        const totalCell = row.querySelector('td:nth-child(2)');
                        const total = totalCell ? totalCell.textContent.trim() : null;

                        return { name, total };
                    })
                });

                customsBrokersStr = await sortStringifyArray(customsBrokers, 'name', 'total', true);

                console.log(customsBrokersStr);
            } catch (err) {
                console.warn(`Skipping Scraping Customs Data from ${domain} because: ${err.message}`);
            }
        }
        // Import Yeti
        // if (i % 5 === 0) {
        //     await importYetiLogIn(page);
        // }

        // await page.goto('https://www.importyeti.com', { waitUntil: 'networkidle2' });

        // for (const term of searchVariants) {
        //     if (urlYeti) break; // Already found a match
        //     await clearAndType(page, typeBoxYeti, term);
        //     await page.click('button[aria-label="Search button"]', {timeout: 1000});
        //     console.log("clicked");
        //     ({url:urlYeti, textData} = await findYetiLink(page));
        //     console.log("after search");
        //     console.log("Url:", urlYeti);
        //     console.log("Data:", textData)
        //     await new Promise(resolve => setTimeout(resolve, 2000));
        // }

        // if (urlYeti) {

        //     const contentString = `Company We Know: Legal Name: ${legalName} Company Name: ${companyName} Location: ${location} Domain: ${domain},
        //     Company to Compare: ${textData.slice(0, 2).join('\n')}`.trim();

        //     console.log(contentString);
            
        //     const chatCompletion = await openAIClient.chat.completions.create({
        //         model : "gpt-4.1-nano",
        //         messages : [
        //             { role: "system", content: yetiPrompt },
        //             { role: "user",  content: contentString }
        //         ]
        //     });

        //     const reply = chatCompletion.choices[0].message.content.trim();
        //     if (!JSON.parse(reply).same_company) urlYeti = "";

        // }

        console.log(companyName, urlRV, totalClearances, totalShipments, customsBrokersStr, tradeDataStr, portTypeStr);
        results.push({companyName, urlRV, totalClearances, totalShipments, customsBrokersStr, tradeDataStr, portTypeStr});

        if ( i % 2 === 0)  {
            // 5. Write results to CSV
            const csvLines = results.map(r => {
                const name = (r?.companyName || '').toString().replace(/"/g, '""');
                const urlRV = (r?.urlRV || '').toString().replace(/"/g, '""');
                // const urlYeti = (r?.urlYeti || '').toString().replace(/"/g, '""');

                const totalClearances = (r?.totalClearances || '').toString().replace(/,/g, '').replace(/"/g, '""');
                const totalShipments = (r?.totalShipments || '').toString().replace(/,/g, '').replace(/"/g, '""');
                const customsBroker = (r?.customsBrokersStr || '').replace(/"/g, '""');
                const tradeData = (r?.tradeDataStr || '').replace(/"/g, '""');
                const portTypeData = (r?.portTypeStr || '').replace(/"/g, '""');

                return `"${name}","${urlRV}",${totalClearances},${totalShipments},"${customsBroker}","${tradeData}", "${portTypeData}"`;
            });
            const content = (i === 0) ? csvLines.join('\n') : '\n' + csvLines.join('\n');
            fs.writeFileSync('results.csv', content, { flag: 'a' });            
            results = [];
        }

        await page.goto('https://app.revenuevessel.com/dashboard/importers', { waitUntil: 'networkidle2'});
    }

    // 4. (For now) just close
    await browser.close();

    if (results.length > 0) {
        // 5. Write results to CSV
        const csvLines = results.map(r => {
            const name = (r?.companyName || '').toString().replace(/"/g, '""');
            const urlRV = (r?.urlRV || '').toString().replace(/"/g, '""');
            const urlYeti = (r?.urlYeti || '').toString().replace(/"/g, '""');

            const totalClearances = (r?.totalClearances || '').toString().replace(/,/g, '').replace(/"/g, '""');
            const totalShipments = (r?.totalShipments || '').toString().replace(/,/g, '').replace(/"/g, '""');
            const customsBroker = (r?.customsBrokersStr || '').replace(/"/g, '""');
            const tradeData = (r?.tradeDataStr || '').replace(/"/g, '""');
            const portTypeData = (r?.portTypeStr || '').replace(/"/g, '""');

            return `"${name}","${urlRV}","${urlYeti}",${totalClearances},${totalShipments},"${customsBroker}","${tradeData}", "${portTypeData}"`;
        });
        fs.writeFileSync('results.csv', '\n' + csvLines.join('\n'), {flag: 'a'});
        results = [];
    }
})();

async function clearAndType(page, selector, value) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    console.log(value);
    await page.type(selector, value);
    await new Promise(resolve => setTimeout(resolve, 3000))
}

async function getImporterDetailURL(page, selector, domain) {
    try {
        await page.waitForSelector(selector, { visible: true, timeout: 3000 });
        const urls = await page.$$eval(selector, rows =>
            rows.map(a => a.href)
        );

        for (const url of urls) {
            if (await checkRevVesselUrl(url, domain, page)) {
                console.log('Importer detail URL:', url);
                return url;
            }
        }

        console.log("No matching URL found.");
        return '';
    } catch (err) {
        console.log("No results:", err.message,); 
        return '';
    }
}


async function getTradeLanesData(page, tab, domain, column1, column2) {
    try {
        await page.evaluate((tabName) => {
            const btn = document.querySelector(`button[aria-controls*="${tabName}"]`);
            if (!btn || btn.disabled) {
                throw new Error(tabName + " not active");
            }
        }, tab);
        await page.click(`button[aria-controls*="${tab}"]`);
        
        await page.waitForSelector('div[data-state="active"] table tbody tr', {visible: true, timeout: 3000});

        // Scrape port + shipments per row
        const scrapedRows = await page.$$eval('div[data-state="active"] table tbody tr',
            (rows, col1, col2) => rows.map(row => {
                const tds = row.querySelectorAll('td');
                return {
                    port: tds[col1]?.textContent.trim() || null,
                    shipments:    tds[col2]?.textContent.trim() || null
                };
            }), 
            column1, column2
        );
        // console.log(airManifestRows);
        return scrapedRows;

    } catch (err) {
        console.warn(`Skipping ${tab} from ${domain} because: ${err.message}`);
        return [];
    }
}

async function combinedSamePorts(array) {
    return Object.values(
        array.reduce((acc, { port, shipments }) => {
            const count = parseInt(shipments, 10) || 0;
            if (!acc[port]) {
                // First time seeing this port
                acc[port] = { port, shipments: count };
            } else {
                // Add to existing total
                acc[port].shipments += count;
            }
            return acc;
        }, {})
    );
}

async function sortStringifyArray(inputArray, key1, key2, notportType) {
    inputArray.sort((a, b) => b[key2] - a[key2]);
    const num = (inputArray.length >= 3 && notportType) ? 3: inputArray.length
    return inputArray.slice(0, num).map(entry => {
        const label = entry[key1] || '';
        const value = entry[key2] || '';
        return `${label}-${value}`;
    }).join(', ');
}

async function findYetiLink(page) {
    try {
        await page.waitForSelector('.bg-yeti-neutral-05.hover\\:bg-yeti-neutral-10', { visible: true, timeout: 3000 });
        const {url, textData} = await page.$$eval('.bg-yeti-neutral-05.hover\\:bg-yeti-neutral-10', companies => {
            const match = companies.find(company => {
                const nameText = company.querySelector("a")?.textContent?.toLowerCase() || "";
                const hasCanada = nameText.includes("canada");
                const isUS = company.querySelector(".fflag.ff-sm.fflag-US");

                return !hasCanada && isUS;
            });

            if (!match) return {url:'', textData: []};
            const anchor = match.querySelector("a[href]");
            const url =  anchor ? anchor.href : '';

            const rawData = [...match.querySelectorAll('.relative.w-full')];
            const textData = rawData.map(el => {
                return el.textContent.trim();
            });

            return {url, textData};

        });

         await new Promise(resolve => setTimeout(resolve, 10000))


        if (await isDateRecent(textData)){
            return {url, textData};
        } else {
            return {url:'', textData: []};
        }
    } catch (err) {
        console.log("No results:", err.message); 
        return {url:'', textData: []};
    }
}


async function isDateRecent(textData) {
    const shipmentLine = textData[2]; 
    const dateMatch = shipmentLine.match(/(\d{2}\/\d{2}\/\d{4})/);

    if (dateMatch) {
        const shipmentDate = new Date(dateMatch[1]);
        const cutoff = new Date("01/01/2025");
        return (shipmentDate >= cutoff);
    }
    return false;
}

async function importYetiLogIn(page) {
    await page.goto('https://www.importyeti.com/login', { waitUntil: 'networkidle2' });
    await page.type('#email', process.env.YETI_USER);
    await page.type('#password', process.env.YETI_PASS);
    await Promise.all([
    await page.click('button[type="submit"]'),
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
}

async function checkRevVesselUrl(urlRV, domain, page) {
    if (urlRV) {
        await page.goto(urlRV, { waitUntil: 'networkidle2' });
        const website = await page.evaluate(() => {
            const allLabels = [...document.querySelectorAll('dt')];
            for (const label of allLabels) {
                if (label.textContent.trim() === 'Company Website') {
                    const link = label.nextElementSibling?.querySelector('a');
                    return link?.href || null;
                }
            }
            return null;
        });

        const hostname = new URL(website).hostname;
        const webDomain = hostname.replace(/^www\./, '').toString();

        console.log("Result: ", webDomain);
        console.log("FirstEmail: ", domain);

        return (domain === webDomain);
    }
}