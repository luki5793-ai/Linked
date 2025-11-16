/**
 * Test script for debugging the scraper
 */

import { chromium } from 'playwright';
import { searchLinkedInProfiles, searchXingProfiles } from './scrapers/google.js';
import { scrapeLinkedInProfile } from './scrapers/linkedin.js';
import { scrapeXingProfile } from './scrapers/xing.js';

// Test configuration
const testConfig = {
    jobTitle: 'IT Manager',
    location: 'Köln',
    postalCodePrefix: '5',
    maxResults: 5,
    proxyConfiguration: null
};

async function testGoogleSearch() {
    console.log('\n=== Testing Google Search ===\n');

    try {
        console.log('1. Testing LinkedIn profile search...');
        const linkedinUrls = await searchLinkedInProfiles(testConfig);
        console.log(`Found ${linkedinUrls.length} LinkedIn URLs:`);
        linkedinUrls.slice(0, 3).forEach((url, i) => {
            console.log(`  ${i + 1}. ${url}`);
        });

        console.log('\n2. Testing Xing profile search...');
        const xingUrls = await searchXingProfiles(testConfig);
        console.log(`Found ${xingUrls.length} Xing URLs:`);
        xingUrls.slice(0, 3).forEach((url, i) => {
            console.log(`  ${i + 1}. ${url}`);
        });

        return { linkedinUrls, xingUrls };

    } catch (error) {
        console.error('Google search test failed:', error);
        return { linkedinUrls: [], xingUrls: [] };
    }
}

async function testDirectLinkedInAccess() {
    console.log('\n=== Testing Direct LinkedIn Access ===\n');

    const testUrls = [
        'https://www.linkedin.com/in/williamhgates',
        'https://www.linkedin.com/in/satyanadella'
    ];

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    for (const url of testUrls) {
        try {
            console.log(`\nAccessing: ${url}`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait a bit
            await page.waitForTimeout(3000);

            // Take screenshot
            await page.screenshot({ path: `linkedin-test-${Date.now()}.png` });

            // Get page title
            const title = await page.title();
            console.log(`Page title: ${title}`);

            // Check for login wall
            const loginWall = await page.$('form[class*="login"]');
            if (loginWall) {
                console.log('❌ Login wall detected!');
            } else {
                console.log('✓ No login wall');
            }

            // Get HTML
            const html = await page.content();
            console.log(`HTML length: ${html.length} characters`);

            // Look for profile name
            const selectors = ['h1.top-card-layout__title', 'h1', '.pv-top-card--list li'];
            for (const selector of selectors) {
                const element = await page.$(selector);
                if (element) {
                    const text = await element.textContent();
                    console.log(`Found with ${selector}: ${text?.substring(0, 50)}`);
                }
            }

        } catch (error) {
            console.error(`Error accessing ${url}:`, error.message);
        }
    }

    await browser.close();
}

async function testDirectXingAccess() {
    console.log('\n=== Testing Direct Xing Access ===\n');

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    try {
        const testUrl = 'https://www.xing.com/profile/Satya_Nadella';

        console.log(`Accessing: ${testUrl}`);
        await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        await page.waitForTimeout(3000);

        // Take screenshot
        await page.screenshot({ path: `xing-test-${Date.now()}.png` });

        const title = await page.title();
        console.log(`Page title: ${title}`);

        // Check for login requirement
        const loginForm = await page.$('form[class*="login"]');
        if (loginForm) {
            console.log('❌ Login required!');
        } else {
            console.log('✓ No login required');
        }

        const html = await page.content();
        console.log(`HTML length: ${html.length} characters`);

    } catch (error) {
        console.error('Error accessing Xing:', error.message);
    }

    await browser.close();
}

async function runTests() {
    console.log('🧪 LinkedIn & Xing Scraper Debug Tests\n');
    console.log('='.repeat(80));

    // Test 1: Google Search
    await testGoogleSearch();

    // Test 2: Direct LinkedIn access
    await testDirectLinkedInAccess();

    // Test 3: Direct Xing access
    await testDirectXingAccess();

    console.log('\n' + '='.repeat(80));
    console.log('Tests completed!');
}

runTests().catch(console.error);
