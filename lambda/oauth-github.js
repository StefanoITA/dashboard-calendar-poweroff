/**
 * Lambda: OAuth GitHub Enterprise — Code Exchange
 *
 * Riceve un authorization code dal frontend, lo scambia con GitHub Enterprise
 * per un access_token, poi chiama /api/v3/user per ottenere il login dell'utente.
 *
 * Variabili d'ambiente richieste:
 *   GHE_BASE_URL      — es. https://github.AZIENDA.com
 *   OAUTH_CLIENT_ID   — Client ID dell'OAuth App su GHE
 *   OAUTH_CLIENT_SECRET — Client Secret dell'OAuth App su GHE
 *   ALLOWED_ORIGIN    — es. https://pages.github.AZIENDA.com
 */

const https = require('https');
const http = require('http');

function request(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const mod = parsedUrl.protocol === 'https:' ? https : http;
        const req = mod.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            rejectUnauthorized: false  // per certificati interni GHE
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

exports.handler = async (event) => {
    const origin = process.env.ALLOWED_ORIGIN || '*';
    const corsHeaders = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    try {
        const { code } = JSON.parse(event.body || '{}');
        if (!code) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Missing authorization code' })
            };
        }

        const gheBase = process.env.GHE_BASE_URL;
        const clientId = process.env.OAUTH_CLIENT_ID;
        const clientSecret = process.env.OAUTH_CLIENT_SECRET;

        // 1. Exchange code for access_token
        const tokenResp = await request(`${gheBase}/login/oauth/access_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code: code
            })
        });

        const tokenData = JSON.parse(tokenResp.body);
        if (!tokenData.access_token) {
            console.error('Token exchange failed:', tokenResp.body);
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Token exchange failed', detail: tokenData.error_description || tokenData.error })
            };
        }

        // 2. Fetch user profile
        const userResp = await request(`${gheBase}/api/v3/user`, {
            headers: {
                'Authorization': `token ${tokenData.access_token}`,
                'Accept': 'application/json'
            }
        });

        const userData = JSON.parse(userResp.body);
        if (!userData.login) {
            console.error('User fetch failed:', userResp.body);
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to fetch user profile' })
            };
        }

        console.log('OAuth success:', userData.login);
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                login: userData.login,
                name: userData.name || userData.login
            })
        };

    } catch (err) {
        console.error('Lambda error:', err);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
