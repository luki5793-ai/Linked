/**
 * Location parsing and postal code filtering utilities
 */

import { CONFIG } from '../config.js';

/**
 * Check if a postal code matches the given prefix
 * @param {string} postalCode - The postal code to check
 * @param {string} prefix - The prefix to match against
 * @returns {boolean} - True if matches, false otherwise
 */
export function matchesPostalCodePrefix(postalCode, prefix) {
    if (!postalCode || !prefix) {
        return false;
    }

    // Remove all non-digit characters
    const cleanedPLZ = postalCode.replace(/\D/g, '');
    const cleanedPrefix = prefix.replace(/\D/g, '');

    if (!cleanedPLZ || !cleanedPrefix) {
        return false;
    }

    return cleanedPLZ.startsWith(cleanedPrefix);
}

/**
 * Extract postal code from a location string
 * @param {string} locationString - The location string to parse
 * @returns {string|null} - The extracted postal code or null
 */
export function extractPostalCode(locationString) {
    if (!locationString) {
        return null;
    }

    const match = locationString.match(CONFIG.POSTAL_CODE.REGEX);
    return match ? match[0] : null;
}

/**
 * Parse German location string into components
 * Supports formats like:
 * - "Köln, Nordrhein-Westfalen, Deutschland"
 * - "50667 Köln"
 * - "Köln"
 * - "50667 Köln, NRW"
 *
 * @param {string} locationString - The location string to parse
 * @returns {Object} - Parsed location components
 */
export function parseGermanLocation(locationString) {
    if (!locationString) {
        return {
            postalCode: null,
            city: null,
            state: null,
            country: null,
            raw: locationString
        };
    }

    const result = {
        postalCode: null,
        city: null,
        state: null,
        country: null,
        raw: locationString
    };

    // Extract postal code (5 digits)
    const plzMatch = locationString.match(/\b(\d{5})\b/);
    if (plzMatch) {
        result.postalCode = plzMatch[1];
    }

    // Split by comma to get location parts
    const parts = locationString.split(',').map(p => p.trim());

    if (parts.length === 1) {
        // Single part - could be "50667 Köln" or just "Köln"
        const cleaned = parts[0].replace(/\d{5}\s*/, '').trim();
        result.city = cleaned || null;
    } else if (parts.length === 2) {
        // Two parts - likely "City, State" or "PLZ City, State"
        const firstPart = parts[0].replace(/\d{5}\s*/, '').trim();
        result.city = firstPart || null;
        result.state = parts[1];
    } else if (parts.length >= 3) {
        // Three or more parts - "City, State, Country"
        const firstPart = parts[0].replace(/\d{5}\s*/, '').trim();
        result.city = firstPart || null;
        result.state = parts[1];
        result.country = parts[2];
    }

    return result;
}

/**
 * Extract city name from location string
 * @param {string} locationString - The location string
 * @returns {string|null} - The extracted city name
 */
export function extractCity(locationString) {
    const parsed = parseGermanLocation(locationString);
    return parsed.city;
}

/**
 * Extract state/region from location string
 * @param {string} locationString - The location string
 * @returns {string|null} - The extracted state/region
 */
export function extractState(locationString) {
    const parsed = parseGermanLocation(locationString);
    return parsed.state;
}

/**
 * Validate if a location matches the search criteria
 * @param {Object} location - Parsed location object
 * @param {string} expectedCity - Expected city name
 * @param {string} postalCodePrefix - Expected postal code prefix
 * @returns {boolean} - True if location matches criteria
 */
export function validateLocation(location, expectedCity, postalCodePrefix) {
    // Check postal code prefix if available
    if (location.postalCode && postalCodePrefix) {
        if (!matchesPostalCodePrefix(location.postalCode, postalCodePrefix)) {
            return false;
        }
    }

    // Check city name if available (case-insensitive partial match)
    if (location.city && expectedCity) {
        const cityLower = location.city.toLowerCase();
        const expectedLower = expectedCity.toLowerCase();

        if (!cityLower.includes(expectedLower) && !expectedLower.includes(cityLower)) {
            return false;
        }
    }

    return true;
}

/**
 * Normalize German location names (handle umlauts and variations)
 * @param {string} location - Location string
 * @returns {string} - Normalized location
 */
export function normalizeGermanLocation(location) {
    if (!location) return '';

    let normalized = location.toLowerCase();

    // Handle common German city name variations
    const variations = {
        'koeln': 'köln',
        'muenchen': 'münchen',
        'nuernberg': 'nürnberg',
        'duesseldorf': 'düsseldorf',
        'wuerzburg': 'würzburg'
    };

    for (const [key, value] of Object.entries(variations)) {
        normalized = normalized.replace(key, value);
    }

    return normalized;
}

export default {
    matchesPostalCodePrefix,
    extractPostalCode,
    parseGermanLocation,
    extractCity,
    extractState,
    validateLocation,
    normalizeGermanLocation
};
