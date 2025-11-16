/**
 * Configuration and constants for the LinkedIn & Xing Profile Scraper
 */

export const CONFIG = {
    // Rate limiting
    MIN_DELAY_MS: 2000,
    MAX_DELAY_MS: 5000,

    // Request retries
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 2000,

    // Timeouts
    PAGE_LOAD_TIMEOUT_MS: 30000,
    REQUEST_TIMEOUT_MS: 20000,

    // User agents
    USER_AGENTS: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ],

    // Platform URLs
    PLATFORMS: {
        LINKEDIN: {
            BASE_URL: 'https://www.linkedin.com',
            SEARCH_URL: 'https://www.linkedin.com/search/results/people/',
            PROFILE_URL_PATTERN: /linkedin\.com\/in\/[\w-]+/i
        },
        XING: {
            BASE_URL: 'https://www.xing.com',
            SEARCH_URL: 'https://www.xing.com/search/members',
            PROFILE_URL_PATTERN: /xing\.com\/profile\/[\w_-]+/i
        }
    },

    // Google search operators
    GOOGLE_SEARCH: {
        BASE_URL: 'https://www.google.com/search',
        LINKEDIN_SITE_OPERATOR: 'site:linkedin.com/in/',
        XING_SITE_OPERATOR: 'site:xing.com/profile/',
        RESULTS_PER_PAGE: 10
    },

    // Email enrichment
    EMAIL: {
        // Common email patterns for German companies
        PATTERNS: [
            '{first}.{last}@{domain}',
            '{first}{last}@{domain}',
            '{f}.{last}@{domain}',
            '{first}@{domain}',
            '{last}@{domain}',
            '{first}_{last}@{domain}'
        ],

        // Email validation regex
        VALIDATION_REGEX: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

        // Confidence levels
        CONFIDENCE: {
            HIGH: 'high',      // Found directly on profile or company website
            MEDIUM: 'medium',  // Found via pattern matching with validation
            LOW: 'low'         // Generated pattern without validation
        }
    },

    // Phone enrichment
    PHONE: {
        // German phone number patterns
        REGEX_PATTERNS: [
            /\+49[\s\-]?\d{2,4}[\s\-]?\d{3,9}/g,  // International format
            /0\d{2,4}[\s\-]?\d{3,9}/g,             // National format
            /\(\+49\)[\s\-]?\d{2,4}[\s\-]?\d{3,9}/g
        ],

        TYPES: {
            PERSONAL: 'personal',
            COMPANY: 'company',
            MOBILE: 'mobile'
        }
    },

    // Postal codes
    POSTAL_CODE: {
        // German postal code regex
        REGEX: /\b(\d{5})\b/g,
        MIN_LENGTH: 1,
        MAX_LENGTH: 5
    },

    // Data quality levels
    DATA_QUALITY: {
        HIGH: 'high',       // All essential fields present and verified
        MEDIUM: 'medium',   // Most fields present, some enrichment
        LOW: 'low'          // Minimal data, many fields missing
    },

    // Logging
    LOG_LEVELS: {
        DEBUG: 'DEBUG',
        INFO: 'INFO',
        WARNING: 'WARNING',
        ERROR: 'ERROR'
    },

    // Deduplication
    DEDUP: {
        // Fields used for deduplication (name + company)
        KEY_FIELDS: ['fullName', 'currentCompany'],
        // Similarity threshold for fuzzy matching
        SIMILARITY_THRESHOLD: 0.85
    },

    // Statistics
    STATS: {
        PROFILES_FOUND: 'profilesFound',
        PROFILES_ENRICHED: 'profilesEnriched',
        EMAILS_FOUND: 'emailsFound',
        PHONES_FOUND: 'phonesFound',
        COMPANIES_ENRICHED: 'companiesEnriched',
        DUPLICATES_REMOVED: 'duplicatesRemoved',
        ERRORS: 'errors'
    }
};

/**
 * Get a random user agent from the list
 */
export function getRandomUserAgent() {
    const index = Math.floor(Math.random() * CONFIG.USER_AGENTS.length);
    return CONFIG.USER_AGENTS[index];
}

/**
 * Get a random delay between min and max
 */
export function getRandomDelay() {
    return Math.floor(
        Math.random() * (CONFIG.MAX_DELAY_MS - CONFIG.MIN_DELAY_MS) + CONFIG.MIN_DELAY_MS
    );
}

/**
 * Sleep for a specified number of milliseconds
 */
export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default CONFIG;
