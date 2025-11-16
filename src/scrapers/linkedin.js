/**
 * LinkedIn profile scraper
 */

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { CONFIG, sleep, getRandomDelay } from '../config.js';
import { createBrowserContext } from '../utils/proxy.js';
import { parseGermanLocation, extractPostalCode } from '../utils/location.js';
import { sanitizeString, normalizeWhitespace } from '../utils/validation.js';
import { searchLinkedInProfiles } from './google.js';

/**
 * Extract profile data from LinkedIn public profile page
 * @param {string} html - HTML content of the profile page
 * @param {string} profileUrl - URL of the profile
 * @returns {Object} - Extracted profile data
 */
function parseLinkedInProfile(html, profileUrl) {
    const $ = cheerio.load(html);

    // Initialize profile object
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
            linkedinUrl: profileUrl,
            xingUrl: null,
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
            scrapedFrom: 'linkedin',
            searchQuery: null,
            dataQuality: null,
            enrichmentSources: ['linkedin']
        }
    };

    try {
        // Extract name
        const nameSelectors = [
            'h1.top-card-layout__title',
            'h1.inline',
            '.top-card__title',
            '[class*="profile-title"]'
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
            '.top-card-layout__headline',
            '.top-card__headline',
            'h2.top-card-layout__headline',
            '[class*="profile-headline"]'
        ];

        for (const selector of titleSelectors) {
            const title = $(selector).first().text().trim();
            if (title) {
                profile.jobTitle = sanitizeString(title);
                break;
            }
        }

        // Extract location
        const locationSelectors = [
            '.top-card__subline-item',
            '.top-card-layout__first-subline',
            '[class*="location"]'
        ];

        for (const selector of locationSelectors) {
            const location = $(selector).first().text().trim();
            if (location && !location.includes('connection')) {
                profile.location = sanitizeString(location);

                // Parse location details
                const parsedLocation = parseGermanLocation(location);
                profile.postalCode = parsedLocation.postalCode;
                profile.country = parsedLocation.country || 'Deutschland';
                break;
            }
        }

        // Extract profile image
        const img = $('img.top-card__photo, img.profile-photo-edit__preview, img[class*="profile"]').first();
        if (img.length) {
            profile.metadata.profileImageUrl = img.attr('src') || null;
        }

        // Extract about/summary
        const aboutSelectors = [
            '.core-section-container__content .about-section',
            '.summary',
            '[class*="about"]'
        ];

        for (const selector of aboutSelectors) {
            const about = $(selector).text().trim();
            if (about && about.length > 20) {
                profile.professionalInfo.aboutSummary = normalizeWhitespace(sanitizeString(about));
                break;
            }
        }

        // Extract current company from job title (often in format "Position at Company")
        if (profile.jobTitle) {
            const atMatch = profile.jobTitle.match(/\s+(?:at|bei|@)\s+(.+)$/i);
            if (atMatch) {
                profile.currentCompany = sanitizeString(atMatch[1]);

                // Clean job title
                profile.jobTitle = sanitizeString(profile.jobTitle.replace(/\s+(?:at|bei|@)\s+.+$/i, ''));
            }
        }

        // Extract experience
        const experienceItems = $('.experience-item, .profile-section-card, [class*="experience"]').toArray();

        for (const item of experienceItems.slice(0, 5)) {
            const $item = $(item);

            const title = sanitizeString($item.find('h3, .profile-section-card__title').first().text());
            const company = sanitizeString($item.find('.profile-section-card__subtitle, [class*="company"]').first().text());
            const duration = sanitizeString($item.find('.date-range, [class*="duration"]').first().text());

            if (title || company) {
                const position = {
                    title: title || null,
                    company: company || null,
                    duration: duration || null,
                    description: null
                };

                // Set as current position if duration includes "Present" or "heute"
                if (duration && (duration.includes('Present') || duration.includes('heute') || duration.includes('Heute'))) {
                    if (!profile.professionalInfo.currentPosition) {
                        profile.professionalInfo.currentPosition = {
                            ...position,
                            current: true
                        };

                        if (!profile.currentCompany && company) {
                            profile.currentCompany = company;
                        }
                    }
                } else {
                    profile.professionalInfo.previousPositions.push(position);
                }
            }
        }

        // Extract education
        const educationItems = $('.education-item, [class*="education"]').toArray();

        for (const item of educationItems.slice(0, 3)) {
            const $item = $(item);

            const school = sanitizeString($item.find('h3, .profile-section-card__title').first().text());
            const degree = sanitizeString($item.find('.profile-section-card__subtitle, [class*="degree"]').first().text());
            const year = sanitizeString($item.find('.date-range, [class*="date"]').first().text());

            if (school || degree) {
                profile.professionalInfo.education.push({
                    degree: degree || null,
                    field: null,
                    school: school || null,
                    year: year || null
                });
            }
        }

        // Extract skills
        const skillItems = $('.skill-item, [class*="skill"] span, [class*="skill"] a').toArray();

        for (const item of skillItems.slice(0, 20)) {
            const skill = sanitizeString($(item).text());
            if (skill && skill.length > 2 && skill.length < 50) {
                profile.professionalInfo.skills.push(skill);
            }
        }

        // Remove duplicate skills
        profile.professionalInfo.skills = [...new Set(profile.professionalInfo.skills)];

    } catch (error) {
        console.error('Error parsing LinkedIn profile:', error.message);
    }

    return profile;
}

/**
 * Scrape a single LinkedIn profile
 * @param {string} profileUrl - LinkedIn profile URL
 * @param {Object} proxyConfiguration - Proxy configuration
 * @returns {Promise<Object>} - Profile data
 */
export async function scrapeLinkedInProfile(profileUrl, proxyConfiguration = null) {
    let browser;
    let context;

    try {
        browser = await chromium.launch({
            headless: true
        });

        context = await createBrowserContext(browser, proxyConfiguration);
        const page = await context.newPage();

        console.log(`Scraping LinkedIn profile: ${profileUrl}`);

        // Navigate to profile
        await page.goto(profileUrl, {
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.PAGE_LOAD_TIMEOUT_MS
        });

        // Wait a bit for content to load
        await sleep(2000);

        // Get page HTML
        const html = await page.content();

        // Parse profile
        const profile = parseLinkedInProfile(html, profileUrl);

        await page.close();

        return profile;

    } catch (error) {
        console.error(`Error scraping LinkedIn profile ${profileUrl}:`, error.message);
        return null;
    } finally {
        if (context) await context.close();
        if (browser) await browser.close();
    }
}

/**
 * Search and scrape LinkedIn profiles
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
    console.log(`\n=== LinkedIn Search: ${jobTitle} in ${location} (PLZ: ${postalCodePrefix}) ===`);

    try {
        // Step 1: Search Google for LinkedIn profiles
        const profileUrls = await searchLinkedInProfiles({
            jobTitle,
            location,
            postalCodePrefix,
            maxResults,
            proxyConfiguration
        });

        if (profileUrls.length === 0) {
            console.log('No LinkedIn profiles found');
            return [];
        }

        console.log(`Found ${profileUrls.length} LinkedIn profile URLs to scrape`);

        // Step 2: Scrape each profile
        const profiles = [];

        for (const url of profileUrls) {
            try {
                const profile = await scrapeLinkedInProfile(url, proxyConfiguration);

                if (profile && profile.fullName) {
                    // Add search query to metadata
                    profile.metadata.searchQuery = `${jobTitle} ${location}`;

                    profiles.push(profile);

                    console.log(`✓ Scraped: ${profile.fullName} - ${profile.jobTitle || 'N/A'}`);
                } else {
                    console.log(`✗ Failed to scrape: ${url}`);
                }

                // Delay between profile scrapes
                await sleep(getRandomDelay());

            } catch (error) {
                console.error(`Error scraping ${url}:`, error.message);
            }
        }

        console.log(`Successfully scraped ${profiles.length} LinkedIn profiles`);

        return profiles;

    } catch (error) {
        console.error('LinkedIn search error:', error);
        return [];
    }
}

export default {
    search,
    scrapeLinkedInProfile,
    parseLinkedInProfile
};
