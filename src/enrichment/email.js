/**
 * Email enrichment module
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { CONFIG } from '../config.js';
import { isValidEmail } from '../utils/validation.js';
import { sleep, getRandomDelay } from '../config.js';

/**
 * Extract domain from company website URL
 * @param {string} website - Company website URL
 * @returns {string|null} - Domain name
 */
function extractDomain(website) {
    if (!website) return null;

    try {
        const url = new URL(website.startsWith('http') ? website : `https://${website}`);
        return url.hostname.replace('www.', '');
    } catch {
        return website.replace('www.', '').split('/')[0];
    }
}

/**
 * Generate email patterns based on name and company domain
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @param {string} domain - Company domain
 * @returns {Array} - Array of possible email addresses
 */
export function generateEmailPatterns(firstName, lastName, domain) {
    if (!firstName || !lastName || !domain) {
        return [];
    }

    const first = firstName.toLowerCase().trim();
    const last = lastName.toLowerCase().trim();
    const f = first.charAt(0);

    const patterns = [];

    for (const template of CONFIG.EMAIL.PATTERNS) {
        const email = template
            .replace('{first}', first)
            .replace('{last}', last)
            .replace('{f}', f)
            .replace('{domain}', domain);

        if (isValidEmail(email)) {
            patterns.push(email);
        }
    }

    return patterns;
}

/**
 * Search for email on company website
 * @param {string} companyWebsite - Company website URL
 * @param {string} fullName - Person's full name
 * @returns {Promise<string|null>} - Email address if found
 */
async function searchCompanyWebsite(companyWebsite, fullName) {
    if (!companyWebsite) return null;

    try {
        const url = companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`;

        // Try to fetch company website
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);

        // Look for email addresses on the page
        const pageText = $('body').text();
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const emails = pageText.match(emailRegex) || [];

        if (emails.length === 0) return null;

        // Try to find email matching the person's name
        const nameParts = fullName.toLowerCase().split(' ');

        for (const email of emails) {
            const emailLower = email.toLowerCase();

            // Check if email contains any part of the person's name
            if (nameParts.some(part => part.length > 2 && emailLower.includes(part))) {
                if (isValidEmail(email)) {
                    return email;
                }
            }
        }

        // Return first valid email as fallback
        for (const email of emails) {
            if (isValidEmail(email) && !email.includes('example') && !email.includes('test')) {
                return email;
            }
        }

        return null;

    } catch (error) {
        console.log(`Could not fetch company website: ${error.message}`);
        return null;
    }
}

/**
 * Search for email on impressum/contact page
 * @param {string} companyWebsite - Company website URL
 * @param {string} fullName - Person's full name
 * @returns {Promise<string|null>} - Email address if found
 */
async function searchImpressum(companyWebsite, fullName) {
    if (!companyWebsite) return null;

    const baseUrl = companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`;

    // Common paths for impressum/contact pages
    const paths = [
        '/impressum',
        '/impressum.html',
        '/kontakt',
        '/contact',
        '/about',
        '/team',
        '/ueber-uns'
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
            const pageText = $('body').text();

            // Look for email addresses
            const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
            const emails = pageText.match(emailRegex) || [];

            // Also check mailto links
            $('a[href^="mailto:"]').each((i, elem) => {
                const href = $(elem).attr('href');
                if (href) {
                    const email = href.replace('mailto:', '').split('?')[0];
                    emails.push(email);
                }
            });

            if (emails.length === 0) continue;

            // Try to find email matching the person's name
            const nameParts = fullName.toLowerCase().split(' ');

            for (const email of emails) {
                const emailLower = email.toLowerCase();

                if (nameParts.some(part => part.length > 2 && emailLower.includes(part))) {
                    if (isValidEmail(email)) {
                        return email;
                    }
                }
            }

            await sleep(500); // Small delay between requests

        } catch (error) {
            // Page not found or error, try next path
            continue;
        }
    }

    return null;
}

/**
 * Find email address for a profile
 * @param {Object} profile - Profile object
 * @returns {Promise<Object|null>} - { address, confidence, sources } or null
 */
export async function findEmail(profile) {
    // If email already exists, return it
    if (profile.contactInfo?.email) {
        return {
            address: profile.contactInfo.email,
            confidence: profile.contactInfo.emailConfidence || CONFIG.EMAIL.CONFIDENCE.HIGH,
            sources: ['profile']
        };
    }

    const sources = [];
    let email = null;
    let confidence = null;

    try {
        // Step 1: Search company website
        if (profile.companyWebsite) {
            console.log(`  Searching company website for email...`);

            email = await searchCompanyWebsite(profile.companyWebsite, profile.fullName);

            if (email) {
                confidence = CONFIG.EMAIL.CONFIDENCE.HIGH;
                sources.push('company_website');
                console.log(`  ✓ Found email on company website: ${email}`);
                return { address: email, confidence, sources };
            }
        }

        // Step 2: Search impressum/contact pages
        if (profile.companyWebsite) {
            console.log(`  Searching impressum/contact pages...`);

            email = await searchImpressum(profile.companyWebsite, profile.fullName);

            if (email) {
                confidence = CONFIG.EMAIL.CONFIDENCE.HIGH;
                sources.push('impressum');
                console.log(`  ✓ Found email on impressum: ${email}`);
                return { address: email, confidence, sources };
            }
        }

        // Step 3: Generate email patterns and validate
        if (profile.fullName && profile.companyWebsite) {
            console.log(`  Generating email patterns...`);

            const nameParts = profile.fullName.trim().split(' ');
            if (nameParts.length >= 2) {
                const firstName = nameParts[0];
                const lastName = nameParts[nameParts.length - 1];
                const domain = extractDomain(profile.companyWebsite);

                if (domain) {
                    const patterns = generateEmailPatterns(firstName, lastName, domain);

                    console.log(`  Generated ${patterns.length} email patterns`);

                    // Return first pattern (most common format)
                    if (patterns.length > 0) {
                        email = patterns[0];
                        confidence = CONFIG.EMAIL.CONFIDENCE.LOW;
                        sources.push('pattern_generation');

                        console.log(`  ℹ Generated email pattern: ${email} (unverified)`);

                        return { address: email, confidence, sources };
                    }
                }
            }
        }

        // Step 4: Try to find email via company name search
        if (!email && profile.currentCompany && profile.fullName) {
            console.log(`  Searching via company name...`);

            // This could be extended to use external APIs like Hunter.io
            // For now, we'll skip this to avoid external API dependencies
        }

        console.log(`  ✗ No email found`);
        return null;

    } catch (error) {
        console.error('Error during email enrichment:', error.message);
        return null;
    }
}

/**
 * Validate email by checking format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
export function validateEmail(email) {
    return isValidEmail(email);
}

/**
 * Enrich multiple profiles with email addresses
 * @param {Array} profiles - Array of profile objects
 * @returns {Promise<Array>} - Profiles with enriched emails
 */
export async function enrichProfiles(profiles) {
    const enriched = [];

    for (const profile of profiles) {
        try {
            const emailData = await findEmail(profile);

            if (emailData) {
                profile.contactInfo.email = emailData.address;
                profile.contactInfo.emailConfidence = emailData.confidence;

                if (!profile.metadata.enrichmentSources) {
                    profile.metadata.enrichmentSources = [];
                }

                profile.metadata.enrichmentSources.push(...emailData.sources);
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
    findEmail,
    generateEmailPatterns,
    validateEmail,
    enrichProfiles
};
