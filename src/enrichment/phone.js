/**
 * Phone number enrichment module
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { CONFIG } from '../config.js';
import { isValidPhoneNumber } from '../utils/validation.js';
import { sleep } from '../config.js';

/**
 * Extract phone numbers from text using regex patterns
 * @param {string} text - Text to search
 * @returns {Array} - Array of phone numbers found
 */
export function extractPhoneNumbers(text) {
    if (!text) return [];

    const phones = [];

    for (const pattern of CONFIG.PHONE.REGEX_PATTERNS) {
        pattern.lastIndex = 0; // Reset regex state
        const matches = text.matchAll(pattern);

        for (const match of matches) {
            const phone = match[0].trim();
            if (isValidPhoneNumber(phone)) {
                phones.push(phone);
            }
        }
    }

    // Remove duplicates
    return [...new Set(phones)];
}

/**
 * Normalize German phone number
 * @param {string} phone - Phone number to normalize
 * @returns {string} - Normalized phone number
 */
export function normalizePhoneNumber(phone) {
    if (!phone) return '';

    // Remove all non-digit characters except +
    let normalized = phone.replace(/[^\d+]/g, '');

    // Convert national format to international
    if (normalized.startsWith('0')) {
        normalized = '+49' + normalized.substring(1);
    }

    return normalized;
}

/**
 * Determine phone number type (company, mobile, etc.)
 * @param {string} phone - Phone number
 * @param {string} source - Where the phone was found
 * @returns {string} - Phone type
 */
function determinePhoneType(phone, source) {
    const normalized = normalizePhoneNumber(phone);

    // German mobile numbers typically start with +49 15, 16, or 17
    if (normalized.match(/^\+49\s*(15|16|17)/)) {
        return CONFIG.PHONE.TYPES.MOBILE;
    }

    // If found on company website or impressum, likely company phone
    if (source === 'company_website' || source === 'impressum') {
        return CONFIG.PHONE.TYPES.COMPANY;
    }

    // Default to personal
    return CONFIG.PHONE.TYPES.PERSONAL;
}

/**
 * Search for phone number on company website
 * @param {string} companyWebsite - Company website URL
 * @returns {Promise<Object|null>} - { number, type, source } or null
 */
async function searchCompanyWebsite(companyWebsite) {
    if (!companyWebsite) return null;

    try {
        const url = companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`;

        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);

        // Check for tel: links first
        const telLinks = $('a[href^="tel:"]').toArray();
        if (telLinks.length > 0) {
            const phone = $(telLinks[0]).attr('href').replace('tel:', '').trim();
            if (isValidPhoneNumber(phone)) {
                return {
                    number: normalizePhoneNumber(phone),
                    type: determinePhoneType(phone, 'company_website'),
                    source: 'company_website'
                };
            }
        }

        // Search page text for phone numbers
        const pageText = $('body').text();
        const phones = extractPhoneNumbers(pageText);

        if (phones.length > 0) {
            // Return first valid phone number
            return {
                number: normalizePhoneNumber(phones[0]),
                type: determinePhoneType(phones[0], 'company_website'),
                source: 'company_website'
            };
        }

        return null;

    } catch (error) {
        console.log(`Could not fetch company website: ${error.message}`);
        return null;
    }
}

/**
 * Search for phone number on impressum/contact page
 * @param {string} companyWebsite - Company website URL
 * @returns {Promise<Object|null>} - { number, type, source } or null
 */
async function searchImpressum(companyWebsite) {
    if (!companyWebsite) return null;

    const baseUrl = companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`;

    // Common paths for impressum/contact pages
    const paths = [
        '/impressum',
        '/impressum.html',
        '/kontakt',
        '/contact',
        '/about'
    ];

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

            // Check for tel: links
            const telLinks = $('a[href^="tel:"]').toArray();
            if (telLinks.length > 0) {
                const phone = $(telLinks[0]).attr('href').replace('tel:', '').trim();
                if (isValidPhoneNumber(phone)) {
                    return {
                        number: normalizePhoneNumber(phone),
                        type: determinePhoneType(phone, 'impressum'),
                        source: 'impressum'
                    };
                }
            }

            // Search page text
            const pageText = $('body').text();
            const phones = extractPhoneNumbers(pageText);

            if (phones.length > 0) {
                return {
                    number: normalizePhoneNumber(phones[0]),
                    type: determinePhoneType(phones[0], 'impressum'),
                    source: 'impressum'
                };
            }

            await sleep(500); // Small delay between requests

        } catch (error) {
            // Page not found, try next path
            continue;
        }
    }

    return null;
}

/**
 * Find phone number for a profile
 * @param {Object} profile - Profile object
 * @returns {Promise<Object|null>} - { number, type, source } or null
 */
export async function findPhone(profile) {
    // If phone already exists, return it
    if (profile.contactInfo?.phone) {
        return {
            number: profile.contactInfo.phone,
            type: profile.contactInfo.phoneType || CONFIG.PHONE.TYPES.PERSONAL,
            source: 'profile'
        };
    }

    try {
        // Step 1: Search company website
        if (profile.companyWebsite) {
            console.log(`  Searching company website for phone...`);

            const phoneData = await searchCompanyWebsite(profile.companyWebsite);

            if (phoneData) {
                console.log(`  ✓ Found phone on company website: ${phoneData.number}`);
                return phoneData;
            }
        }

        // Step 2: Search impressum/contact pages
        if (profile.companyWebsite) {
            console.log(`  Searching impressum/contact pages for phone...`);

            const phoneData = await searchImpressum(profile.companyWebsite);

            if (phoneData) {
                console.log(`  ✓ Found phone on impressum: ${phoneData.number}`);
                return phoneData;
            }
        }

        console.log(`  ✗ No phone number found`);
        return null;

    } catch (error) {
        console.error('Error during phone enrichment:', error.message);
        return null;
    }
}

/**
 * Enrich multiple profiles with phone numbers
 * @param {Array} profiles - Array of profile objects
 * @returns {Promise<Array>} - Profiles with enriched phone numbers
 */
export async function enrichProfiles(profiles) {
    const enriched = [];

    for (const profile of profiles) {
        try {
            const phoneData = await findPhone(profile);

            if (phoneData) {
                // Store as company phone if type is company
                if (phoneData.type === CONFIG.PHONE.TYPES.COMPANY) {
                    profile.contactInfo.companyPhone = phoneData.number;
                } else {
                    profile.contactInfo.phone = phoneData.number;
                    profile.contactInfo.phoneType = phoneData.type;
                }

                if (!profile.metadata.enrichmentSources) {
                    profile.metadata.enrichmentSources = [];
                }

                profile.metadata.enrichmentSources.push(phoneData.source);
            }

            enriched.push(profile);

            // Delay between enrichment requests
            await sleep(1000);

        } catch (error) {
            console.error(`Error enriching profile ${profile.fullName}:`, error.message);
            enriched.push(profile);
        }
    }

    return enriched;
}

export default {
    findPhone,
    extractPhoneNumbers,
    normalizePhoneNumber,
    enrichProfiles
};
