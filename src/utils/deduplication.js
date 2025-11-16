/**
 * Profile deduplication utilities
 */

import { CONFIG } from '../config.js';

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Levenshtein distance
 */
function levenshteinDistance(a, b) {
    if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Calculate similarity ratio between two strings (0-1)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Similarity ratio (0 = completely different, 1 = identical)
 */
function calculateSimilarity(a, b) {
    if (!a || !b) return 0;

    const normalized_a = a.toLowerCase().trim();
    const normalized_b = b.toLowerCase().trim();

    if (normalized_a === normalized_b) return 1;

    const distance = levenshteinDistance(normalized_a, normalized_b);
    const maxLength = Math.max(normalized_a.length, normalized_b.length);

    return 1 - (distance / maxLength);
}

/**
 * Normalize name for comparison (remove special characters, lowercase)
 * @param {string} name - Name to normalize
 * @returns {string} - Normalized name
 */
function normalizeName(name) {
    if (!name) return '';

    return name
        .toLowerCase()
        .replace(/[^a-z0-9äöüß\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generate unique key for a profile (name + company)
 * @param {Object} profile - Profile object
 * @returns {string} - Unique key
 */
export function generateProfileKey(profile) {
    const name = normalizeName(profile.fullName || '');
    const company = normalizeName(profile.currentCompany || '');

    return `${name}|${company}`;
}

/**
 * Check if two profiles are duplicates
 * @param {Object} profile1 - First profile
 * @param {Object} profile2 - Second profile
 * @param {number} threshold - Similarity threshold (0-1)
 * @returns {boolean} - True if profiles are considered duplicates
 */
export function areDuplicateProfiles(profile1, profile2, threshold = CONFIG.DEDUP.SIMILARITY_THRESHOLD) {
    // Check by exact key match first (faster)
    const key1 = generateProfileKey(profile1);
    const key2 = generateProfileKey(profile2);

    if (key1 === key2 && key1 !== '|') {
        return true;
    }

    // Check by LinkedIn/Xing URL (if same URL, definitely duplicate)
    if (profile1.contactInfo?.linkedinUrl && profile2.contactInfo?.linkedinUrl) {
        if (profile1.contactInfo.linkedinUrl === profile2.contactInfo.linkedinUrl) {
            return true;
        }
    }

    if (profile1.contactInfo?.xingUrl && profile2.contactInfo?.xingUrl) {
        if (profile1.contactInfo.xingUrl === profile2.contactInfo.xingUrl) {
            return true;
        }
    }

    // Check by email (if same email, likely duplicate)
    if (profile1.contactInfo?.email && profile2.contactInfo?.email) {
        if (profile1.contactInfo.email.toLowerCase() === profile2.contactInfo.email.toLowerCase()) {
            return true;
        }
    }

    // Fuzzy matching by name and company
    const nameSimilarity = calculateSimilarity(
        profile1.fullName || '',
        profile2.fullName || ''
    );

    const companySimilarity = calculateSimilarity(
        profile1.currentCompany || '',
        profile2.currentCompany || ''
    );

    // Both name and company must be similar
    if (nameSimilarity >= threshold && companySimilarity >= threshold) {
        return true;
    }

    // Very high name similarity + same job title might indicate duplicate
    if (nameSimilarity >= 0.95) {
        const jobTitleSimilarity = calculateSimilarity(
            profile1.jobTitle || '',
            profile2.jobTitle || ''
        );

        if (jobTitleSimilarity >= threshold) {
            return true;
        }
    }

    return false;
}

/**
 * Merge two duplicate profiles, keeping the best data from each
 * @param {Object} profile1 - First profile
 * @param {Object} profile2 - Second profile
 * @returns {Object} - Merged profile
 */
export function mergeProfiles(profile1, profile2) {
    const merged = { ...profile1 };

    // Helper function to choose better value
    const chooseBetter = (val1, val2) => {
        if (!val1 && val2) return val2;
        if (val1 && !val2) return val1;
        if (!val1 && !val2) return null;

        // Prefer longer, more detailed values
        if (typeof val1 === 'string' && typeof val2 === 'string') {
            return val1.length >= val2.length ? val1 : val2;
        }

        return val1;
    };

    // Merge basic fields
    for (const field of ['fullName', 'jobTitle', 'currentCompany', 'location', 'postalCode', 'country']) {
        merged[field] = chooseBetter(profile1[field], profile2[field]);
    }

    // Merge contact info
    if (!merged.contactInfo) merged.contactInfo = {};

    merged.contactInfo.email = chooseBetter(profile1.contactInfo?.email, profile2.contactInfo?.email);
    merged.contactInfo.phone = chooseBetter(profile1.contactInfo?.phone, profile2.contactInfo?.phone);
    merged.contactInfo.linkedinUrl = chooseBetter(profile1.contactInfo?.linkedinUrl, profile2.contactInfo?.linkedinUrl);
    merged.contactInfo.xingUrl = chooseBetter(profile1.contactInfo?.xingUrl, profile2.contactInfo?.xingUrl);

    // Merge professional info
    if (!merged.professionalInfo) merged.professionalInfo = {};

    merged.professionalInfo.aboutSummary = chooseBetter(
        profile1.professionalInfo?.aboutSummary,
        profile2.professionalInfo?.aboutSummary
    );

    // Merge arrays (skills, experience, education) - combine and deduplicate
    const mergeArrays = (arr1, arr2) => {
        const combined = [...(arr1 || []), ...(arr2 || [])];
        return [...new Set(combined)];
    };

    merged.professionalInfo.skills = mergeArrays(
        profile1.professionalInfo?.skills,
        profile2.professionalInfo?.skills
    );

    // Merge metadata
    if (!merged.metadata) merged.metadata = {};

    merged.metadata.scrapedFrom = [
        profile1.metadata?.scrapedFrom,
        profile2.metadata?.scrapedFrom
    ].filter(Boolean).join(', ');

    merged.metadata.enrichmentSources = mergeArrays(
        profile1.metadata?.enrichmentSources,
        profile2.metadata?.enrichmentSources
    );

    return merged;
}

/**
 * Remove duplicate profiles from an array
 * @param {Array} profiles - Array of profiles
 * @param {boolean} merge - Whether to merge duplicate profiles
 * @returns {Object} - { uniqueProfiles: Array, duplicatesRemoved: number }
 */
export function deduplicateProfiles(profiles, merge = true) {
    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
        return { uniqueProfiles: [], duplicatesRemoved: 0 };
    }

    const unique = [];
    const seen = new Map(); // Key: profile key, Value: index in unique array
    let duplicatesRemoved = 0;

    for (const profile of profiles) {
        let isDuplicate = false;
        let duplicateIndex = -1;

        // Check against all unique profiles so far
        for (let i = 0; i < unique.length; i++) {
            if (areDuplicateProfiles(profile, unique[i])) {
                isDuplicate = true;
                duplicateIndex = i;
                break;
            }
        }

        if (isDuplicate) {
            duplicatesRemoved++;

            if (merge && duplicateIndex >= 0) {
                // Merge the duplicate into the existing profile
                unique[duplicateIndex] = mergeProfiles(unique[duplicateIndex], profile);
            }
            // If not merging, just skip this duplicate
        } else {
            // Not a duplicate, add to unique list
            unique.push(profile);
        }
    }

    return {
        uniqueProfiles: unique,
        duplicatesRemoved
    };
}

/**
 * Remove duplicates by exact key match (faster than full deduplication)
 * @param {Array} profiles - Array of profiles
 * @returns {Object} - { uniqueProfiles: Array, duplicatesRemoved: number }
 */
export function deduplicateByKey(profiles) {
    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
        return { uniqueProfiles: [], duplicatesRemoved: 0 };
    }

    const seen = new Set();
    const unique = [];
    let duplicatesRemoved = 0;

    for (const profile of profiles) {
        const key = generateProfileKey(profile);

        if (key === '|') {
            // Empty key, keep the profile but don't check for duplicates
            unique.push(profile);
            continue;
        }

        if (seen.has(key)) {
            duplicatesRemoved++;
        } else {
            seen.add(key);
            unique.push(profile);
        }
    }

    return {
        uniqueProfiles: unique,
        duplicatesRemoved
    };
}

export default {
    generateProfileKey,
    areDuplicateProfiles,
    mergeProfiles,
    deduplicateProfiles,
    deduplicateByKey,
    calculateSimilarity
};
