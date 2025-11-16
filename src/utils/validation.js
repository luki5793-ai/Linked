/**
 * Data validation utilities
 */

import { CONFIG } from '../config.js';
import validator from 'email-validator';

/**
 * Validate email address
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }

    // Use email-validator library
    if (!validator.validate(email)) {
        return false;
    }

    // Additional check with our regex
    return CONFIG.EMAIL.VALIDATION_REGEX.test(email);
}

/**
 * Validate German phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') {
        return false;
    }

    // Check against any of the German phone patterns
    return CONFIG.PHONE.REGEX_PATTERNS.some(pattern => {
        pattern.lastIndex = 0; // Reset regex state
        return pattern.test(phone);
    });
}

/**
 * Validate German postal code
 * @param {string} postalCode - Postal code to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidPostalCode(postalCode) {
    if (!postalCode || typeof postalCode !== 'string') {
        return false;
    }

    const cleaned = postalCode.replace(/\D/g, '');
    return cleaned.length === 5 && /^\d{5}$/.test(cleaned);
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }

    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate LinkedIn URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid LinkedIn profile URL
 */
export function isValidLinkedInUrl(url) {
    if (!isValidUrl(url)) {
        return false;
    }

    return CONFIG.PLATFORMS.LINKEDIN.PROFILE_URL_PATTERN.test(url);
}

/**
 * Validate Xing URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid Xing profile URL
 */
export function isValidXingUrl(url) {
    if (!isValidUrl(url)) {
        return false;
    }

    return CONFIG.PLATFORMS.XING.PROFILE_URL_PATTERN.test(url);
}

/**
 * Validate profile object has required fields
 * @param {Object} profile - Profile object to validate
 * @returns {Object} - { isValid: boolean, missingFields: string[] }
 */
export function validateProfile(profile) {
    const requiredFields = ['fullName', 'jobTitle', 'location'];
    const missingFields = [];

    for (const field of requiredFields) {
        if (!profile[field] || (typeof profile[field] === 'string' && profile[field].trim() === '')) {
            missingFields.push(field);
        }
    }

    return {
        isValid: missingFields.length === 0,
        missingFields
    };
}

/**
 * Calculate data quality score for a profile
 * @param {Object} profile - Profile object to evaluate
 * @returns {string} - Quality level: 'high', 'medium', or 'low'
 */
export function calculateDataQuality(profile) {
    let score = 0;
    const weights = {
        fullName: 10,
        jobTitle: 10,
        currentCompany: 8,
        location: 8,
        postalCode: 5,
        email: 10,
        phone: 8,
        linkedinUrl: 5,
        xingUrl: 5,
        aboutSummary: 5,
        experience: 8,
        education: 5,
        skills: 3,
        companyWebsite: 5
    };

    const maxScore = Object.values(weights).reduce((a, b) => a + b, 0);

    for (const [field, weight] of Object.entries(weights)) {
        if (field === 'email' && profile.contactInfo?.email) {
            score += weight;
        } else if (field === 'phone' && profile.contactInfo?.phone) {
            score += weight;
        } else if (field === 'linkedinUrl' && profile.contactInfo?.linkedinUrl) {
            score += weight;
        } else if (field === 'xingUrl' && profile.contactInfo?.xingUrl) {
            score += weight;
        } else if (field === 'experience' && profile.professionalInfo?.previousPositions?.length > 0) {
            score += weight;
        } else if (field === 'education' && profile.professionalInfo?.education?.length > 0) {
            score += weight;
        } else if (field === 'skills' && profile.professionalInfo?.skills?.length > 0) {
            score += weight;
        } else if (field === 'aboutSummary' && profile.professionalInfo?.aboutSummary) {
            score += weight;
        } else if (profile[field]) {
            score += weight;
        }
    }

    const percentage = (score / maxScore) * 100;

    if (percentage >= 70) {
        return CONFIG.DATA_QUALITY.HIGH;
    } else if (percentage >= 40) {
        return CONFIG.DATA_QUALITY.MEDIUM;
    } else {
        return CONFIG.DATA_QUALITY.LOW;
    }
}

/**
 * Sanitize string input (remove dangerous characters, trim whitespace)
 * @param {string} input - String to sanitize
 * @returns {string} - Sanitized string
 */
export function sanitizeString(input) {
    if (!input || typeof input !== 'string') {
        return '';
    }

    return input
        .trim()
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
        .replace(/<[^>]*>/g, ''); // Remove HTML tags
}

/**
 * Normalize whitespace in a string
 * @param {string} str - String to normalize
 * @returns {string} - Normalized string
 */
export function normalizeWhitespace(str) {
    if (!str || typeof str !== 'string') {
        return '';
    }

    return str.replace(/\s+/g, ' ').trim();
}

/**
 * Clean and validate profile data
 * @param {Object} profile - Raw profile data
 * @returns {Object} - Cleaned and validated profile
 */
export function cleanProfileData(profile) {
    const cleaned = { ...profile };

    // Sanitize string fields
    const stringFields = ['fullName', 'jobTitle', 'currentCompany', 'location', 'postalCode', 'country'];

    for (const field of stringFields) {
        if (cleaned[field]) {
            cleaned[field] = normalizeWhitespace(sanitizeString(cleaned[field]));
        }
    }

    // Clean contact info
    if (cleaned.contactInfo) {
        if (cleaned.contactInfo.email) {
            cleaned.contactInfo.email = cleaned.contactInfo.email.toLowerCase().trim();
        }
        if (cleaned.contactInfo.phone) {
            cleaned.contactInfo.phone = cleaned.contactInfo.phone.trim();
        }
    }

    // Add data quality assessment
    if (cleaned.metadata) {
        cleaned.metadata.dataQuality = calculateDataQuality(cleaned);
    }

    return cleaned;
}

export default {
    isValidEmail,
    isValidPhoneNumber,
    isValidPostalCode,
    isValidUrl,
    isValidLinkedInUrl,
    isValidXingUrl,
    validateProfile,
    calculateDataQuality,
    sanitizeString,
    normalizeWhitespace,
    cleanProfileData
};
