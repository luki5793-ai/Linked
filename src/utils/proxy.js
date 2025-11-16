/**
 * Proxy management utilities
 */

import { Actor } from 'apify';
import { getRandomUserAgent, getRandomDelay, sleep } from '../config.js';

/**
 * Create proxy configuration for Crawlee/Playwright
 * @param {Object} proxyConfig - Proxy configuration from input
 * @returns {Object} - Formatted proxy configuration
 */
export async function createProxyConfiguration(proxyConfig) {
    if (!proxyConfig || !proxyConfig.useApifyProxy) {
        // No proxy configured
        return null;
    }

    try {
        const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
        return proxyConfiguration;
    } catch (error) {
        console.error('Failed to create proxy configuration:', error);
        return null;
    }
}

/**
 * Get a new proxy URL from the configuration
 * @param {Object} proxyConfiguration - Apify proxy configuration
 * @returns {Promise<string|null>} - Proxy URL or null
 */
export async function getProxyUrl(proxyConfiguration) {
    if (!proxyConfiguration) {
        return null;
    }

    try {
        const proxyUrl = await proxyConfiguration.newUrl();
        return proxyUrl;
    } catch (error) {
        console.error('Failed to get proxy URL:', error);
        return null;
    }
}

/**
 * Create browser context with proxy and random user agent
 * @param {Object} browser - Playwright browser instance
 * @param {Object} proxyConfiguration - Apify proxy configuration
 * @returns {Promise<Object>} - Browser context
 */
export async function createBrowserContext(browser, proxyConfiguration) {
    const contextOptions = {
        userAgent: getRandomUserAgent(),
        locale: 'de-DE',
        timezoneId: 'Europe/Berlin',
        viewport: {
            width: 1920,
            height: 1080
        }
    };

    // Add proxy if available
    const proxyUrl = await getProxyUrl(proxyConfiguration);
    if (proxyUrl) {
        const url = new URL(proxyUrl);
        contextOptions.proxy = {
            server: `${url.protocol}//${url.host}`,
            username: url.username || undefined,
            password: url.password || undefined
        };
    }

    const context = await browser.newContext(contextOptions);
    return context;
}

/**
 * Make HTTP request with retry logic and proxy rotation
 * @param {Function} requestFn - Function that makes the request
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} retryDelay - Delay between retries (ms)
 * @returns {Promise<any>} - Request result
 */
export async function makeRequestWithRetry(requestFn, maxRetries = 3, retryDelay = 2000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Add random delay before request
            await sleep(getRandomDelay());

            const result = await requestFn();
            return result;
        } catch (error) {
            lastError = error;

            console.warn(`Request attempt ${attempt}/${maxRetries} failed:`, error.message);

            if (attempt < maxRetries) {
                // Wait before retry (exponential backoff)
                const delay = retryDelay * Math.pow(2, attempt - 1);
                console.log(`Retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    // All retries failed
    throw new Error(`Request failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
}

/**
 * Create Axios instance with proxy configuration
 * @param {Object} proxyConfiguration - Apify proxy configuration
 * @returns {Promise<Object>} - Axios instance
 */
export async function createAxiosInstance(proxyConfiguration) {
    const axios = (await import('axios')).default;

    const config = {
        timeout: 20000,
        headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
    };

    // Add proxy if available
    const proxyUrl = await getProxyUrl(proxyConfiguration);
    if (proxyUrl) {
        const url = new URL(proxyUrl);
        config.proxy = {
            protocol: url.protocol.replace(':', ''),
            host: url.hostname,
            port: parseInt(url.port) || 80,
            auth: url.username && url.password ? {
                username: url.username,
                password: url.password
            } : undefined
        };
    }

    return axios.create(config);
}

/**
 * Handle rate limiting with exponential backoff
 * @param {Function} fn - Function to execute
 * @param {number} maxAttempts - Maximum attempts
 * @returns {Promise<any>} - Function result
 */
export async function handleRateLimit(fn, maxAttempts = 5) {
    let attempt = 0;
    let delay = 1000;

    while (attempt < maxAttempts) {
        try {
            return await fn();
        } catch (error) {
            attempt++;

            // Check if error is rate limiting related
            const isRateLimit =
                error.response?.status === 429 ||
                error.message?.includes('rate limit') ||
                error.message?.includes('too many requests');

            if (isRateLimit && attempt < maxAttempts) {
                console.warn(`Rate limited. Waiting ${delay}ms before retry ${attempt}/${maxAttempts}`);
                await sleep(delay);
                delay *= 2; // Exponential backoff
            } else {
                throw error;
            }
        }
    }

    throw new Error(`Failed after ${maxAttempts} rate limit retries`);
}

export default {
    createProxyConfiguration,
    getProxyUrl,
    createBrowserContext,
    makeRequestWithRetry,
    createAxiosInstance,
    handleRateLimit
};
