"""
Lambda: OAuth GitHub Enterprise — Code Exchange + Redirect

Flusso:
  1. GHE reindirizza qui con ?code=XXX
  2. Lambda scambia code → access_token con GHE
  3. Lambda chiama /api/v3/user per ottenere il login
  4. Lambda fa 302 redirect al sito Pages con ?ghuser=LOGIN

Variabili d'ambiente:
  GHE_BASE_URL       — es. https://github.AZIENDA.com
  OAUTH_CLIENT_ID    — Client ID dell'OAuth App
  OAUTH_CLIENT_SECRET — Client Secret dell'OAuth App
  REDIRECT_URL       — es. https://pages.github.AZIENDA.com/PATH/
  SSL_VERIFY         — "true" (default) o "false" per certificati interni
"""

import json
import os
import ssl
import urllib.request
import urllib.parse


def _get_ssl_context():
    if os.environ.get("SSL_VERIFY", "true").lower() == "false":
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    return None


def _http_request(url, data=None, headers=None, method="GET"):
    headers = headers or {}
    if data is not None and isinstance(data, dict):
        data = json.dumps(data).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")
    headers.setdefault("Accept", "application/json")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    ctx = _get_ssl_context()
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _redirect(url):
    return {
        "statusCode": 302,
        "headers": {"Location": url},
        "body": "",
    }


def lambda_handler(event, context):
    redirect_url = os.environ["REDIRECT_URL"]

    # --- Leggi ?code= dalla query string ---
    params = event.get("queryStringParameters") or {}
    code = params.get("code")

    if not code:
        error = urllib.parse.quote("Parametro 'code' mancante nella richiesta")
        return _redirect(f"{redirect_url}?ghuser_error={error}")

    ghe_base = os.environ["GHE_BASE_URL"]
    client_id = os.environ["OAUTH_CLIENT_ID"]
    client_secret = os.environ["OAUTH_CLIENT_SECRET"]

    try:
        # --- 1. Scambia code → access_token ---
        token_data = _http_request(
            f"{ghe_base}/login/oauth/access_token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
            },
            method="POST",
        )

        access_token = token_data.get("access_token")
        if not access_token:
            err_detail = token_data.get("error_description") or token_data.get("error") or "Token non ricevuto"
            print(f"Token exchange failed: {token_data}")
            error = urllib.parse.quote(f"Scambio token fallito: {err_detail}")
            return _redirect(f"{redirect_url}?ghuser_error={error}")

        # --- 2. Ottieni profilo utente ---
        user_data = _http_request(
            f"{ghe_base}/api/v3/user",
            headers={"Authorization": f"token {access_token}"},
        )

        login = user_data.get("login")
        if not login:
            print(f"User fetch failed: {user_data}")
            error = urllib.parse.quote("Impossibile ottenere il profilo utente")
            return _redirect(f"{redirect_url}?ghuser_error={error}")

        # --- 3. Redirect al sito Pages con il login ---
        print(f"OAuth success: {login}")
        ghuser = urllib.parse.quote(login)
        return _redirect(f"{redirect_url}?ghuser={ghuser}")

    except Exception as e:
        print(f"Lambda error: {e}")
        error = urllib.parse.quote(f"Errore interno: {e}")
        return _redirect(f"{redirect_url}?ghuser_error={error}")
