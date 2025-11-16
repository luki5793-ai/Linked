/**
 * Company enrichment module
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { CONFIG, sleep } from '../config.js';
import { isValidUrl } from '../utils/validation.js';
import { extractPhoneNumbers, normalizePhoneNumber } from './phone.js';

/**
 * Find company website via Google search
 * @param {string} companyName - Company name
 * @param {string} location - Optional location for better results
 * @returns {Promise<string|null>} - Company website URL or null
 */
async function findCompanyWebsite(companyName, location = null) {
    if (!companyName) return null;

    try {
        // Build Google search query
        const query = location
            ? `${companyName} ${location} website`
            : `${companyName} website`;

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        await sleep(1000);

        // Extract first result URL
        const firstResult = await page.$('div#search a[href^="http"]');

        if (firstResult) {
            const url = await firstResult.getAttribute('href');

            if (url && isValidUrl(url)) {
                // Filter out unwanted domains
                const unwantedDomains = [
                    'google.com',
                    'facebook.com',
                    'linkedin.com',
                    'xing.com',
                    'instagram.com',
                    'twitter.com',
                    'wikipedia.org'
                ];

                const urlObj = new URL(url);
                const isUnwanted = unwantedDomains.some(domain => urlObj.hostname.includes(domain));

                if (!isUnwanted) {
                    await browser.close();
                    return url;
                }
            }
        }

        await browser.close();
        return null;

    } catch (error) {
        console.log(`Could not find company website: ${error.message}`);
        return null;
    }
}

/**
 * Extract company information from website
 * @param {string} websiteUrl - Company website URL
 * @returns {Promise<Object>} - Company information
 */
async function extractCompanyInfo(websiteUrl) {
    const info = {
        website: websiteUrl,
        industry: null,
        size: null,
        description: null,
        phone: null,
        address: null
    };

    if (!websiteUrl) return info;

    try {
        const response = await axios.get(websiteUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);

        // Extract meta description
        const metaDescription = $('meta[name="description"]').attr('content');
        if (metaDescription) {
            info.description = metaDescription.trim();
        }

        // Try to extract phone from contact section
        const contactText = $('[class*="contact"], [class*="kontakt"], footer').text();
        const phones = extractPhoneNumbers(contactText);

        if (phones.length > 0) {
            info.phone = normalizePhoneNumber(phones[0]);
        }

        // Try to extract address
        const addressSelectors = [
            '[class*="address"]',
            '[class*="adresse"]',
            '[class*="location"]',
            'address'
        ];

        for (const selector of addressSelectors) {
            const address = $(selector).first().text().trim();
            if (address && address.length > 10 && address.length < 200) {
                info.address = address;
                break;
            }
        }

        // Try to extract industry from meta keywords or about text
        const aboutText = $('[class*="about"], [class*="über"], [class*="ueber"]').text();

        // Common German industry keywords
        const industries = [
            'IT', 'Informationstechnologie', 'Software', 'Technologie',
            'Beratung', 'Consulting', 'Dienstleistung',
            'Finanzen', 'Versicherung', 'Banking',
            'Gesundheit', 'Pharma', 'Medizin',
            'Automotive', 'Automobil', 'Fahrzeug',
            'Einzelhandel', 'E-Commerce', 'Handel',
            'Produktion', 'Fertigung', 'Industrie',
            'Bildung', 'Ausbildung', 'Schulung',
            'Marketing', 'Werbung', 'Kommunikation',
            'Immobilien', 'Bau', 'Architektur'
        ];

        for (const industry of industries) {
            if (aboutText.toLowerCase().includes(industry.toLowerCase())) {
                info.industry = industry;
                break;
            }
        }

        // Try to extract company size
        const sizePatterns = [
            /(\d+)\s*-\s*(\d+)\s*(Mitarbeiter|employees)/i,
            /(\d+)\+?\s*(Mitarbeiter|employees)/i
        ];

        const pageText = $('body').text();

        for (const pattern of sizePatterns) {
            const match = pageText.match(pattern);
            if (match) {
                info.size = match[0];
                break;
            }
        }

    } catch (error) {
        console.log(`Error extracting company info: ${error.message}`);
    }

    return info;
}

/**
 * Try to extract company info from impressum page
 * @param {string} websiteUrl - Company website URL
 * @returns {Promise<Object>} - Company information from impressum
 */
async function extractFromImpressum(websiteUrl) {
    const info = {
        phone: null,
        address: null,
        legalForm: null
    };

    if (!websiteUrl) return info;

    const baseUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

    const paths = ['/impressum', '/impressum.html', '/imprint'];

    for (const path of paths) {
        try {
            const url = new URL(path, baseUrl).href;

            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const pageText = $('body').text();

            // Extract phone numbers
            const phones = extractPhoneNumbers(pageText);
            if (phones.length > 0) {
                info.phone = normalizePhoneNumber(phones[0]);
            }

            // Extract address (often in impressum)
            const addressMatch = pageText.match(/(\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+[^,\n]{0,50})/);
            if (addressMatch) {
                info.address = addressMatch[0].trim();
            }

            // Extract legal form (GmbH, AG, etc.)
            const legalForms = ['GmbH', 'AG', 'UG', 'KG', 'OHG', 'GbR', 'eG', 'SE'];
            for (const form of legalForms) {
                if (pageText.includes(form)) {
                    info.legalForm = form;
                    break;
                }
            }

            return info;

        } catch (error) {
            // Try next path
            continue;
        }
    }

    return info;
}

/**
 * Enrich company data for a profile
 * @param {string} companyName - Company name
 * @param {string} location - Optional location
 * @param {string} existingWebsite - Existing company website if available
 * @returns {Promise<Object>} - Enriched company data
 */
export async function enrich(companyName, location = null, existingWebsite = null) {
    const enrichedData = {
        companyWebsite: existingWebsite || null,
        companyIndustry: null,
        companySize: null,
        companyDescription: null,
        companyPhone: null,
        companyAddress: null
    };

    if (!companyName) return enrichedData;

    try {
        console.log(`  Enriching company data for: ${companyName}`);

        // Step 1: Find company website if not provided
        if (!enrichedData.companyWebsite) {
            const website = await findCompanyWebsite(companyName, location);
            if (website) {
                enrichedData.companyWebsite = website;
                console.log(`  ✓ Found company website: ${website}`);
            } else {
                console.log(`  ✗ Could not find company website`);
                return enrichedData;
            }
        }

        // Step 2: Extract company info from website
        const companyInfo = await extractCompanyInfo(enrichedData.companyWebsite);

        enrichedData.companyIndustry = companyInfo.industry;
        enrichedData.companySize = companyInfo.size;
        enrichedData.companyDescription = companyInfo.description;

        if (companyInfo.phone) {
            enrichedData.companyPhone = companyInfo.phone;
        }

        if (companyInfo.address) {
            enrichedData.companyAddress = companyInfo.address;
        }

        // Step 3: Try to get additional info from impressum
        const impressumInfo = await extractFromImpressum(enrichedData.companyWebsite);

        if (!enrichedData.companyPhone && impressumInfo.phone) {
            enrichedData.companyPhone = impressumInfo.phone;
        }

        if (!enrichedData.companyAddress && impressumInfo.address) {
            enrichedData.companyAddress = impressumInfo.address;
        }

        if (impressumInfo.legalForm && !enrichedData.companyIndustry) {
            enrichedData.companyIndustry = impressumInfo.legalForm;
        }

        console.log(`  ✓ Company enrichment completed`);

        return enrichedData;

    } catch (error) {
        console.error(`Error enriching company ${companyName}:`, error.message);
        return enrichedData;
    }
}

/**
 * Enrich multiple profiles with company data
 * @param {Array} profiles - Array of profile objects
 * @returns {Promise<Array>} - Profiles with enriched company data
 */
export async function enrichProfiles(profiles) {
    const enriched = [];

    // Create a cache to avoid enriching the same company multiple times
    const companyCache = new Map();

    for (const profile of profiles) {
        try {
            if (!profile.currentCompany) {
                enriched.push(profile);
                continue;
            }

            // Check cache first
            const cacheKey = profile.currentCompany.toLowerCase();

            if (companyCache.has(cacheKey)) {
                const cachedData = companyCache.get(cacheKey);
                Object.assign(profile, cachedData);
                console.log(`  ℹ Using cached data for ${profile.currentCompany}`);
            } else {
                // Enrich company data
                const companyData = await enrich(
                    profile.currentCompany,
                    profile.location,
                    profile.companyWebsite
                );

                // Update profile
                Object.assign(profile, companyData);

                // Add to cache
                companyCache.set(cacheKey, companyData);

                // Delay between company enrichment requests
                await sleep(2000);
            }

            enriched.push(profile);

        } catch (error) {
            console.error(`Error enriching company for profile ${profile.fullName}:`, error.message);
            enriched.push(profile);
        }
    }

    return enriched;
}

export default {
    enrich,
    enrichProfiles,
    findCompanyWebsite
};
