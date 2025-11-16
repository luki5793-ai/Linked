/**
 * LinkedIn & Xing Profile Search Scraper + EMAIL
 * Main entry point
 */

import { Actor } from 'apify';
import { CONFIG } from './config.js';
import * as LinkedInScraper from './scrapers/linkedin.js';
import * as XingScraper from './scrapers/xing.js';
import * as EmailEnricher from './enrichment/email.js';
import * as PhoneEnricher from './enrichment/phone.js';
import * as CompanyEnricher from './enrichment/company.js';
import { deduplicateProfiles } from './utils/deduplication.js';
import { cleanProfileData, validateProfile } from './utils/validation.js';
import { matchesPostalCodePrefix, parseGermanLocation } from './utils/location.js';
import { createProxyConfiguration } from './utils/proxy.js';

/**
 * Filter profiles by postal code prefix
 * @param {Array} profiles - Profiles to filter
 * @param {string} postalCodePrefix - Postal code prefix
 * @returns {Array} - Filtered profiles
 */
function filterByPostalCode(profiles, postalCodePrefix) {
    if (!postalCodePrefix) return profiles;

    return profiles.filter(profile => {
        // Parse location to get postal code
        const location = parseGermanLocation(profile.location);

        // Check if postal code matches prefix
        if (location.postalCode) {
            return matchesPostalCodePrefix(location.postalCode, postalCodePrefix);
        }

        // If no postal code found, keep the profile (will be filtered later if needed)
        return true;
    });
}

/**
 * Main actor function
 */
Actor.main(async () => {
    console.log('🚀 Starting LinkedIn & Xing Profile Search Scraper');

    // Get input
    const input = await Actor.getInput();

    if (!input) {
        throw new Error('No input provided!');
    }

    // Validate required fields
    if (!input.jobTitles || !Array.isArray(input.jobTitles) || input.jobTitles.length === 0) {
        throw new Error('jobTitles is required and must be a non-empty array');
    }

    if (!input.location) {
        throw new Error('location is required');
    }

    if (!input.postalCodePrefix) {
        throw new Error('postalCodePrefix is required');
    }

    // Extract input parameters with defaults
    const {
        jobTitles,
        location,
        postalCodePrefix,
        platforms = ['both'],
        maxResultsPerPlatform = 50,
        enableEmailEnrichment = true,
        enablePhoneEnrichment = true,
        enableCompanyEnrichment = true,
        deduplicateProfiles: shouldDeduplicate = true,
        proxyConfiguration
    } = input;

    console.log('\n📋 Configuration:');
    console.log(`  Job Titles: ${jobTitles.join(', ')}`);
    console.log(`  Location: ${location}`);
    console.log(`  Postal Code Prefix: ${postalCodePrefix}`);
    console.log(`  Platforms: ${platforms.join(', ')}`);
    console.log(`  Max Results per Platform: ${maxResultsPerPlatform}`);
    console.log(`  Email Enrichment: ${enableEmailEnrichment ? 'Yes' : 'No'}`);
    console.log(`  Phone Enrichment: ${enablePhoneEnrichment ? 'Yes' : 'No'}`);
    console.log(`  Company Enrichment: ${enableCompanyEnrichment ? 'Yes' : 'No'}`);
    console.log(`  Deduplication: ${shouldDeduplicate ? 'Yes' : 'No'}\n`);

    // Create proxy configuration
    const proxyConfig = await createProxyConfiguration(proxyConfiguration);

    // Initialize dataset
    const dataset = await Actor.openDataset();

    // Initialize statistics
    const stats = {
        [CONFIG.STATS.PROFILES_FOUND]: 0,
        [CONFIG.STATS.PROFILES_ENRICHED]: 0,
        [CONFIG.STATS.EMAILS_FOUND]: 0,
        [CONFIG.STATS.PHONES_FOUND]: 0,
        [CONFIG.STATS.COMPANIES_ENRICHED]: 0,
        [CONFIG.STATS.DUPLICATES_REMOVED]: 0,
        [CONFIG.STATS.ERRORS]: 0
    };

    // Collect all profiles
    const allProfiles = [];

    // Determine which platforms to use
    const useLinkedIn = platforms.includes('linkedin') || platforms.includes('both');
    const useXing = platforms.includes('xing') || platforms.includes('both');

    // For each job title
    for (const jobTitle of jobTitles) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔍 Searching for: "${jobTitle}" in ${location} (PLZ: ${postalCodePrefix})`);
        console.log('='.repeat(80));

        try {
            // Search LinkedIn
            if (useLinkedIn) {
                console.log('\n📘 Searching LinkedIn...');

                try {
                    const linkedinProfiles = await LinkedInScraper.search({
                        jobTitle,
                        location,
                        postalCodePrefix,
                        maxResults: maxResultsPerPlatform,
                        proxyConfiguration: proxyConfig
                    });

                    console.log(`  Found ${linkedinProfiles.length} LinkedIn profiles`);
                    allProfiles.push(...linkedinProfiles);
                    stats[CONFIG.STATS.PROFILES_FOUND] += linkedinProfiles.length;

                } catch (error) {
                    console.error(`  ❌ LinkedIn search error: ${error.message}`);
                    stats[CONFIG.STATS.ERRORS]++;
                }
            }

            // Search Xing
            if (useXing) {
                console.log('\n📙 Searching Xing...');

                try {
                    const xingProfiles = await XingScraper.search({
                        jobTitle,
                        location,
                        postalCodePrefix,
                        maxResults: maxResultsPerPlatform,
                        proxyConfiguration: proxyConfig
                    });

                    console.log(`  Found ${xingProfiles.length} Xing profiles`);
                    allProfiles.push(...xingProfiles);
                    stats[CONFIG.STATS.PROFILES_FOUND] += xingProfiles.length;

                } catch (error) {
                    console.error(`  ❌ Xing search error: ${error.message}`);
                    stats[CONFIG.STATS.ERRORS]++;
                }
            }

        } catch (error) {
            console.error(`❌ Error processing job title "${jobTitle}": ${error.message}`);
            stats[CONFIG.STATS.ERRORS]++;
        }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Total profiles found: ${allProfiles.length}`);
    console.log('='.repeat(80));

    if (allProfiles.length === 0) {
        console.log('\n⚠️  No profiles found. Exiting.');
        await Actor.setValue('OUTPUT', { stats, profiles: [] });
        return;
    }

    // Filter by postal code
    console.log('\n🔍 Filtering by postal code...');
    const filteredProfiles = filterByPostalCode(allProfiles, postalCodePrefix);
    console.log(`  Profiles after postal code filter: ${filteredProfiles.length}`);

    // Deduplicate profiles
    let uniqueProfiles = filteredProfiles;

    if (shouldDeduplicate && filteredProfiles.length > 0) {
        console.log('\n🔄 Removing duplicates...');

        const dedupResult = deduplicateProfiles(filteredProfiles, true);
        uniqueProfiles = dedupResult.uniqueProfiles;
        stats[CONFIG.STATS.DUPLICATES_REMOVED] = dedupResult.duplicatesRemoved;

        console.log(`  Removed ${dedupResult.duplicatesRemoved} duplicates`);
        console.log(`  Unique profiles: ${uniqueProfiles.length}`);
    }

    // Enrich profiles
    console.log(`\n${'='.repeat(80)}`);
    console.log('💎 Enriching profiles...');
    console.log('='.repeat(80));

    for (let i = 0; i < uniqueProfiles.length; i++) {
        const profile = uniqueProfiles[i];

        console.log(`\n[${i + 1}/${uniqueProfiles.length}] Enriching: ${profile.fullName || 'Unknown'}`);

        try {
            // Company enrichment
            if (enableCompanyEnrichment && profile.currentCompany && !profile.companyWebsite) {
                console.log('  🏢 Company enrichment...');

                try {
                    const companyData = await CompanyEnricher.enrich(
                        profile.currentCompany,
                        profile.location,
                        profile.companyWebsite
                    );

                    Object.assign(profile, companyData);

                    if (companyData.companyWebsite) {
                        stats[CONFIG.STATS.COMPANIES_ENRICHED]++;
                    }

                } catch (error) {
                    console.error(`    ❌ Company enrichment error: ${error.message}`);
                }
            }

            // Email enrichment
            if (enableEmailEnrichment && !profile.contactInfo?.email) {
                console.log('  📧 Email enrichment...');

                try {
                    const emailData = await EmailEnricher.findEmail(profile);

                    if (emailData) {
                        profile.contactInfo.email = emailData.address;
                        profile.contactInfo.emailConfidence = emailData.confidence;

                        if (!profile.metadata.enrichmentSources) {
                            profile.metadata.enrichmentSources = [];
                        }

                        profile.metadata.enrichmentSources.push(...emailData.sources);
                        stats[CONFIG.STATS.EMAILS_FOUND]++;
                    }

                } catch (error) {
                    console.error(`    ❌ Email enrichment error: ${error.message}`);
                }
            }

            // Phone enrichment
            if (enablePhoneEnrichment && !profile.contactInfo?.phone) {
                console.log('  📞 Phone enrichment...');

                try {
                    const phoneData = await PhoneEnricher.findPhone(profile);

                    if (phoneData) {
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
                        stats[CONFIG.STATS.PHONES_FOUND]++;
                    }

                } catch (error) {
                    console.error(`    ❌ Phone enrichment error: ${error.message}`);
                }
            }

            stats[CONFIG.STATS.PROFILES_ENRICHED]++;

        } catch (error) {
            console.error(`  ❌ Error enriching profile: ${error.message}`);
            stats[CONFIG.STATS.ERRORS]++;
        }
    }

    // Clean and validate profiles
    console.log('\n🧹 Cleaning and validating profiles...');

    const cleanedProfiles = [];

    for (const profile of uniqueProfiles) {
        try {
            // Clean profile data
            const cleaned = cleanProfileData(profile);

            // Validate profile
            const validation = validateProfile(cleaned);

            if (validation.isValid) {
                cleanedProfiles.push(cleaned);
            } else {
                console.log(`  ⚠️  Skipping invalid profile: ${cleaned.fullName || 'Unknown'} (missing: ${validation.missingFields.join(', ')})`);
            }

        } catch (error) {
            console.error(`  ❌ Error cleaning profile: ${error.message}`);
        }
    }

    // Save to dataset
    console.log(`\n💾 Saving ${cleanedProfiles.length} profiles to dataset...`);

    for (const profile of cleanedProfiles) {
        await dataset.pushData(profile);
    }

    // Print final statistics
    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ SCRAPING COMPLETED');
    console.log('='.repeat(80));
    console.log('\n📊 Final Statistics:');
    console.log(`  Total profiles found: ${stats[CONFIG.STATS.PROFILES_FOUND]}`);
    console.log(`  Duplicates removed: ${stats[CONFIG.STATS.DUPLICATES_REMOVED]}`);
    console.log(`  Profiles enriched: ${stats[CONFIG.STATS.PROFILES_ENRICHED]}`);
    console.log(`  Emails found: ${stats[CONFIG.STATS.EMAILS_FOUND]}`);
    console.log(`  Phones found: ${stats[CONFIG.STATS.PHONES_FOUND]}`);
    console.log(`  Companies enriched: ${stats[CONFIG.STATS.COMPANIES_ENRICHED]}`);
    console.log(`  Errors: ${stats[CONFIG.STATS.ERRORS]}`);
    console.log(`  Final profile count: ${cleanedProfiles.length}`);
    console.log('='.repeat(80));

    // Save statistics
    await Actor.setValue('OUTPUT', {
        stats,
        profileCount: cleanedProfiles.length,
        timestamp: new Date().toISOString()
    });

    console.log('\n✨ Done! Check the dataset for results.');
});
