# Puppeteer-Auto-Scraping

This project is a Node.js automation tool that uses **Puppeteer (with Stealth Plugin)**, **ImportYeti**, **RevenueVessel**, and **OpenAI** to scrape, enrich, and validate international trade data. It processes company domains from a CSV file and outputs structured trade and shipment data into `results.csv`.

## Features

- Reads company info from a CSV (`company_name`, `domain`, `legal_name`, `hq_location`)  
- Automates login and scraping from RevenueVessel and ImportYeti  
- Extracts trade lanes, shipments, customs brokers, and port data  
- Enriches missing data (like country names for ports) using OpenAI GPT  
- Outputs structured results to `results.csv`  


## Requirements

- Node.js v18+  
- Google Chrome installed (script runs in a visible browser)  
- `.env` file with: 
    - OPEN_API_KEY=your_openai_api_key
    - RV_USER=your_revenuevessel_email
    - RV_PASS=your_revenuevessel_password
    - YETI_USER=your_importyeti_email
    - YETI_PASS=your_importyeti_password

## Technology Stack
- Node.js
- Puppeteer Extra with Stealth Plugin
- OpenAI Node.js SDK
- CSV Parser
- dotenv