from flask import Flask, request


def register_security_headers_middleware(app: Flask) -> None:
    """Register HTTP security headers on all outgoing responses."""

    @app.after_request
    def attach_security_headers(response):
        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent framing / clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Strict Content Security Policy for JSON API
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none';"
        )

        # Disable deprecated buggy XSS auditor
        response.headers["X-XSS-Protection"] = "0"

        # Referrer privacy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Prevent caching of sensitive JSON data by intermediate proxies/browsers
        if "Cache-Control" not in response.headers:
            response.headers["Cache-Control"] = (
                "no-store, no-cache, must-revalidate, max-age=0"
            )

        # Restrict browser device feature access
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=()"
        )

        # HTTP Strict Transport Security (HSTS) when running on HTTPS or in production
        is_prod = app.config.get("ENV") == "production"
        if request.is_secure or is_prod:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        return response
