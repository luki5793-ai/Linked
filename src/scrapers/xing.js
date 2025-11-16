/**
 * Xing profile scraper
 */

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { CONFIG, sleep, getRandomDelay } from '../config.js';
import { createBrowserContext } from '../utils/proxy.js';
import { parseGermanLocation, extractPostalCode } from '../utils/location.js';
import { sanitizeString, normalizeWhitespace } from '../utils/validation.js';
import { searchXingProfiles } from './google.js';

/**
 * Extract email from Xing profile HTML
 * @param {Object} $ - Cheerio instance
 * @returns {string|null} - Email address if found
 */
function extractXingEmail($) {
    // Xing often shows email addresses in contact section
    const emailSelectors = [
        '[class*="email"]',
        '[data-testid="email"]',
        'a[href^="mailto:"]',
        '.contact-email',
        '[class*="contact"] a[href^="mailto:"]'
    ];

    for (const selector of emailSelectors) {
        const element = $(selector).first();

        if (element.length) {
            // Check href attribute
            const href = element.attr('href');
            if (href && href.startsWith('mailto:')) {
                return href.replace('mailto:', '').split('?')[0].trim();
            }

            // Check text content
            const text = element.text().trim();
            if (text && text.includes('@')) {
                return text;
            }
        }
    }

    // Search entire page for email patterns
    const pageText = $('body').text();
    const emailMatch = pageText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);

    return emailMatch ? emailMatch[0] : null;
}

/**
 * Extract phone number from Xing profile HTML
 * @param {Object} $ - Cheerio instance
 * @returns {string|null} - Phone number if found
 */
function extractXingPhone($) {
    // Xing often shows phone numbers in contact section
    const phoneSelectors = [
        '[class*="phone"]',
        '[data-testid="phone"]',
        'a[href^="tel:"]',
        '.contact-phone',
        '[class*="contact"] a[href^="tel:"]'
    ];

    for (const selector of phoneSelectors) {
        const element = $(selector).first();

        if (element.length) {
            // Check href attribute
            const href = element.attr('href');
            if (href && href.startsWith('tel:')) {
                return href.replace('tel:', '').trim();
            }

            // Check text content
            const text = element.text().trim();
            if (text && /\d/.test(text)) {
                return text;
            }
        }
    }

    // Search for German phone patterns
    const pageText = $('body').text();

    for (const pattern of CONFIG.PHONE.REGEX_PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(pageText);
        if (match) {
            return match[0];
        }
    }

    return null;
}

/**
 * Parse Xing profile HTML
 * @param {string} html - HTML content
 * @param {string} profileUrl - Profile URL
 * @returns {Object} - Parsed profile data
 */
function parseXingProfile(html, profileUrl) {
    const $ = cheerio.load(html);

    const profile = {
        fullName: null,
        jobTitle: null,
        currentCompany: null,
        companyWebsite: null,
        companyIndustry: null,
        companySize: null,
        location: null,
        postalCode: null,
        country: null,

        contactInfo: {
            email: null,
            emailConfidence: null,
            phone: null,
            phoneType: null,
            linkedinUrl: null,
            xingUrl: profileUrl,
            companyPhone: null
        },

        professionalInfo: {
            aboutSummary: null,
            yearsOfExperience: null,
            currentPosition: null,
            previousPositions: [],
            education: [],
            skills: [],
            languages: []
        },

        metadata: {
            profileImageUrl: null,
            scrapedAt: new Date().toISOString(),
            scrapedFrom: 'xing',
            searchQuery: null,
            dataQuality: null,
            enrichmentSources: ['xing']
        }
    };

    try {
        // Extract name
        const nameSelectors = [
            'h1[class*="name"]',
            '[data-testid="profile-name"]',
            '.profile-name',
            'h1.name',
            '[class*="ProfileHeader"] h1'
        ];

        for (const selector of nameSelectors) {
            const name = $(selector).first().text().trim();
            if (name) {
                profile.fullName = sanitizeString(name);
                break;
            }
        }

        // Extract job title
        const titleSelectors = [
            '[class*="occupation"]',
            '[data-testid="occupation"]',
            '.profile-headline',
            '[class*="job-title"]',
            '[class*="ProfileHeader"] [class*="title"]'
        ];

        for (const selector of titleSelectors) {
            const title = $(selector).first().text().trim();
            if (title) {
                profile.jobTitle = sanitizeString(title);
                break;
            }
        }

        // Extract company
        const companySelectors = [
            '[class*="company"]',
            '[data-testid="company"]',
            '.profile-company',
            '[class*="organization"]'
        ];

        for (const selector of companySelectors) {
            const company = $(selector).first().text().trim();
            if (company) {
                profile.currentCompany = sanitizeString(company);
                break;
            }
        }

        // Extract location
        const locationSelectors = [
            '[class*="location"]',
            '[data-testid="location"]',
            '.profile-location',
            '[class*="address"]'
        ];

        for (const selector of locationSelectors) {
            const location = $(selector).first().text().trim();
            if (location) {
                profile.location = sanitizeString(location);

                // Parse location details
                const parsedLocation = parseGermanLocation(location);
                profile.postalCode = parsedLocation.postalCode;
                profile.country = parsedLocation.country || 'Deutschland';
                break;
            }
        }

        // Extract profile image
        const img = $('img[class*="profile"], img[class*="avatar"]').first();
        if (img.length) {
            profile.metadata.profileImageUrl = img.attr('src') || null;
        }

        // Extract about/summary
        const aboutSelectors = [
            '[class*="about"]',
            '[class*="summary"]',
            '[data-testid="about"]',
            '.profile-about'
        ];

        for (const selector of aboutSelectors) {
            const about = $(selector).text().trim();
            if (about && about.length > 20) {
                profile.professionalInfo.aboutSummary = normalizeWhitespace(sanitizeString(about));
                break;
            }
        }

        // Extract email (Xing advantage!)
        const email = extractXingEmail($);
        if (email) {
            profile.contactInfo.email = email;
            profile.contactInfo.emailConfidence = 'high';
            profile.metadata.enrichmentSources.push('xing_profile');
        }

        // Extract phone (Xing advantage!)
        const phone = extractXingPhone($);
        if (phone) {
            profile.contactInfo.phone = phone;
            profile.contactInfo.phoneType = 'personal';
        }

        // Extract experience
        const experienceSelectors = [
            '[class*="experience-item"]',
            '[class*="work-experience"]',
            '[class*="career"]'
        ];

        for (const selector of experienceSelectors) {
            const items = $(selector).toArray();

            for (const item of items.slice(0, 5)) {
                const $item = $(item);

                const title = sanitizeString($item.find('[class*="title"], [class*="position"]').first().text());
                const company = sanitizeString($item.find('[class*="company"], [class*="organization"]').first().text());
                const duration = sanitizeString($item.find('[class*="duration"], [class*="date"]').first().text());

                if (title || company) {
                    const position = {
                        title: title || null,
                        company: company || null,
                        duration: duration || null,
                        description: null
                    };

                    // Check if current position
                    if (duration && (duration.includes('heute') || duration.includes('Heute') || duration.includes('current'))) {
                        if (!profile.professionalInfo.currentPosition) {
                            profile.professionalInfo.currentPosition = {
                                ...position,
                                current: true
                            };
                        }
                    } else {
                        profile.professionalInfo.previousPositions.push(position);
                    }
                }
            }

            if (profile.professionalInfo.currentPosition || profile.professionalInfo.previousPositions.length > 0) {
                break;
            }
        }

        // Extract education
        const educationSelectors = [
            '[class*="education-item"]',
            '[class*="education"]',
            '[class*="school"]'
        ];

        for (const selector of educationSelectors) {
            const items = $(selector).toArray();

            for (const item of items.slice(0, 3)) {
                const $item = $(item);

                const school = sanitizeString($item.find('[class*="school"], [class*="institution"]').first().text());
                const degree = sanitizeString($item.find('[class*="degree"], [class*="qualification"]').first().text());
                const year = sanitizeString($item.find('[class*="year"], [class*="date"]').first().text());

                if (school || degree) {
                    profile.professionalInfo.education.push({
                        degree: degree || null,
                        field: null,
                        school: school || null,
                        year: year || null
                    });
                }
            }

            if (profile.professionalInfo.education.length > 0) {
                break;
            }
        }

        // Extract skills
        const skillSelectors = [
            '[class*="skill"]',
            '[class*="expertise"]',
            '[class*="competence"]'
        ];

        for (const selector of skillSelectors) {
            const items = $(selector).toArray();

            for (const item of items.slice(0, 20)) {
                const skill = sanitizeString($(item).text());
                if (skill && skill.length > 2 && skill.length < 50) {
                    profile.professionalInfo.skills.push(skill);
                }
            }

            if (profile.professionalInfo.skills.length > 0) {
                break;
            }
        }

        // Remove duplicate skills
        profile.professionalInfo.skills = [...new Set(profile.professionalInfo.skills)];

        // Extract languages
        const languageSelectors = [
            '[class*="language"]',
            '[class*="sprache"]'
        ];

        for (const selector of languageSelectors) {
            const items = $(selector).toArray();

            for (const item of items.slice(0, 10)) {
                const language = sanitizeString($(item).text());
                if (language && language.length > 2 && language.length < 50) {
                    profile.professionalInfo.languages.push(language);
                }
            }

            if (profile.professionalInfo.languages.length > 0) {
                break;
            }
        }

    } catch (error) {
        console.error('Error parsing Xing profile:', error.message);
    }

    return profile;
}

/**
 * Scrape a single Xing profile
 * @param {string} profileUrl - Xing profile URL
 * @param {Object} proxyConfiguration - Proxy configuration
 * @returns {Promise<Object>} - Profile data
 */
export async function scrapeXingProfile(profileUrl, proxyConfiguration = null) {
    let browser;
    let context;

    try {
        browser = await chromium.launch({
            headless: true
        });

        context = await createBrowserContext(browser, proxyConfiguration);
        const page = await context.newPage();

        console.log(`Scraping Xing profile: ${profileUrl}`);

        // Navigate to profile
        await page.goto(profileUrl, {
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.PAGE_LOAD_TIMEOUT_MS
        });

        // Wait for content to load
        await sleep(2000);

        // Get page HTML
        const html = await page.content();

        // Parse profile
        const profile = parseXingProfile(html, profileUrl);

        await page.close();

        return profile;

    } catch (error) {
        console.error(`Error scraping Xing profile ${profileUrl}:`, error.message);
        return null;
    } finally {
        if (context) await context.close();
        if (browser) await browser.close();
    }
}

/**
 * Search and scrape Xing profiles
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Array of profile objects
 */
export async function search({
    jobTitle,
    location,
    postalCodePrefix,
    maxResults = 50,
    proxyConfiguration = null
}) {
    console.log(`\n=== Xing Search: ${jobTitle} in ${location} (PLZ: ${postalCodePrefix}) ===`);

    try {
        // Step 1: Search Google for Xing profiles
        const profileUrls = await searchXingProfiles({
            jobTitle,
            location,
            postalCodePrefix,
            maxResults,
            proxyConfiguration
        });

        if (profileUrls.length === 0) {
            console.log('No Xing profiles found');
            return [];
        }

        console.log(`Found ${profileUrls.length} Xing profile URLs to scrape`);

        // Step 2: Scrape each profile
        const profiles = [];

        for (const url of profileUrls) {
            try {
                const profile = await scrapeXingProfile(url, proxyConfiguration);

                if (profile && profile.fullName) {
                    // Add search query to metadata
                    profile.metadata.searchQuery = `${jobTitle} ${location}`;

                    profiles.push(profile);

                    console.log(`✓ Scraped: ${profile.fullName} - ${profile.jobTitle || 'N/A'}${profile.contactInfo.email ? ' [EMAIL]' : ''}`);
                } else {
                    console.log(`✗ Failed to scrape: ${url}`);
                }

                // Delay between profile scrapes
                await sleep(getRandomDelay());

            } catch (error) {
                console.error(`Error scraping ${url}:`, error.message);
            }
        }

        console.log(`Successfully scraped ${profiles.length} Xing profiles`);

        return profiles;

    } catch (error) {
        console.error('Xing search error:', error);
        return [];
    }
}

export default {
    search,
    scrapeXingProfile,
    parseXingProfile
};
