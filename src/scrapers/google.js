/**
 * Google Search scraper for finding LinkedIn and Xing profiles
 */

import { chromium } from 'playwright';
import { CONFIG, sleep, getRandomDelay } from '../config.js';
import { createBrowserContext, makeRequestWithRetry } from '../utils/proxy.js';

/**
 * Build Google search query for profiles
 * @param {string} jobTitle - Job title to search for
 * @param {string} location - Location to search in
 * @param {string} postalCodePrefix - Postal code prefix
 * @param {string} platform - 'linkedin' or 'xing'
 * @returns {string} - Google search query
 */
export function buildSearchQuery(jobTitle, location, postalCodePrefix, platform = 'linkedin') {
    const siteOperator = platform === 'linkedin'
        ? CONFIG.GOOGLE_SEARCH.LINKEDIN_SITE_OPERATOR
        : CONFIG.GOOGLE_SEARCH.XING_SITE_OPERATOR;

    // Build query parts
    const parts = [siteOperator];

    // Add job title in quotes
    if (jobTitle) {
        parts.push(`"${jobTitle}"`);
    }

    // Add location
    if (location) {
        parts.push(`"${location}"`);
    }

    // Add postal code prefix (search for any PLZ starting with prefix)
    if (postalCodePrefix) {
        // Search for various PLZ formats
        const plzLength = postalCodePrefix.length;
        if (plzLength === 1) {
            // e.g., "5" -> search for "50", "51", ... "59"
            parts.push(`("${postalCodePrefix}0" OR "${postalCodePrefix}1" OR "${postalCodePrefix}2" OR "${postalCodePrefix}3" OR "${postalCodePrefix}4" OR "${postalCodePrefix}5" OR "${postalCodePrefix}6" OR "${postalCodePrefix}7" OR "${postalCodePrefix}8" OR "${postalCodePrefix}9")`);
        } else {
            // Specific prefix like "50" or "501"
            parts.push(`"${postalCodePrefix}"`);
        }
    }

    return parts.join(' ');
}

/**
 * Extract profile URLs from Google search results
 * @param {Object} page - Playwright page object
 * @param {string} platform - 'linkedin' or 'xing'
 * @returns {Promise<Array>} - Array of profile URLs
 */
async function extractProfileUrls(page, platform) {
    const profilePattern = platform === 'linkedin'
        ? CONFIG.PLATFORMS.LINKEDIN.PROFILE_URL_PATTERN
        : CONFIG.PLATFORMS.XING.PROFILE_URL_PATTERN;

    // Wait for search results
    try {
        await page.waitForSelector('#search', { timeout: 10000 });
    } catch (error) {
        console.warn('Search results did not load properly:', error.message);
        return [];
    }

    // Extract all links from search results
    const links = await page.$$eval('a', (anchors) => {
        return anchors.map(a => a.href).filter(href => href && href.startsWith('http'));
    });

    // Filter for profile URLs
    const profileUrls = links.filter(url => profilePattern.test(url));

    // Remove duplicates and clean URLs
    const uniqueUrls = [...new Set(profileUrls)].map(url => {
        // Remove Google redirect and tracking parameters
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('google')) {
                // Extract actual URL from Google redirect
                const actualUrl = urlObj.searchParams.get('q') || urlObj.searchParams.get('url');
                if (actualUrl) {
                    return actualUrl;
                }
            }
            return url.split('?')[0]; // Remove query parameters
        } catch {
            return url;
        }
    });

    return uniqueUrls;
}

/**
 * Search Google for profiles
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Array of profile URLs
 */
export async function searchGoogle({
    jobTitle,
    location,
    postalCodePrefix,
    platform,
    maxResults = 50,
    proxyConfiguration = null
}) {
    const query = buildSearchQuery(jobTitle, location, postalCodePrefix, platform);
    console.log(`Google search query: ${query}`);

    let browser;
    let context;

    try {
        // Launch browser
        browser = await chromium.launch({
            headless: true
        });

        context = await createBrowserContext(browser, proxyConfiguration);

        const allProfileUrls = [];
        const numPages = Math.ceil(maxResults / CONFIG.GOOGLE_SEARCH.RESULTS_PER_PAGE);

        // Search through multiple pages
        for (let pageNum = 0; pageNum < numPages && allProfileUrls.length < maxResults; pageNum++) {
            const page = await context.newPage();

            try {
                // Build Google search URL
                const searchUrl = `${CONFIG.GOOGLE_SEARCH.BASE_URL}?q=${encodeURIComponent(query)}&start=${pageNum * 10}`;

                console.log(`Fetching page ${pageNum + 1} of search results...`);

                // Navigate to search results
                await page.goto(searchUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: CONFIG.PAGE_LOAD_TIMEOUT_MS
                });

                // Random delay to appear more human-like
                await sleep(getRandomDelay());

                // Extract profile URLs from this page
                const profileUrls = await extractProfileUrls(page, platform);

                console.log(`Found ${profileUrls.length} profile URLs on page ${pageNum + 1}`);

                allProfileUrls.push(...profileUrls);

                // Check if we have enough results
                if (allProfileUrls.length >= maxResults) {
                    break;
                }

                // Check if there are more results
                const hasNextPage = await page.$('a#pnnext');
                if (!hasNextPage) {
                    console.log('No more search result pages available');
                    break;
                }

            } catch (error) {
                console.error(`Error on search page ${pageNum + 1}:`, error.message);
            } finally {
                await page.close();
            }

            // Delay between page requests
            await sleep(getRandomDelay());
        }

        // Remove duplicates and limit to maxResults
        const uniqueUrls = [...new Set(allProfileUrls)].slice(0, maxResults);

        console.log(`Total unique profile URLs found: ${uniqueUrls.length}`);

        return uniqueUrls;

    } catch (error) {
        console.error('Error during Google search:', error);
        throw error;
    } finally {
        if (context) await context.close();
        if (browser) await browser.close();
    }
}

/**
 * Search for LinkedIn profiles via Google
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Array of LinkedIn profile URLs
 */
export async function searchLinkedInProfiles(options) {
    return await searchGoogle({
        ...options,
        platform: 'linkedin'
    });
}

/**
 * Search for Xing profiles via Google
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Array of Xing profile URLs
 */
export async function searchXingProfiles(options) {
    return await searchGoogle({
        ...options,
        platform: 'xing'
    });
}

export default {
    buildSearchQuery,
    searchGoogle,
    searchLinkedInProfiles,
    searchXingProfiles
};
