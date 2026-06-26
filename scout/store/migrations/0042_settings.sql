-- Generic runtime settings the dashboard manages (k/v), so an owner can configure
-- scout without redeploying. First use: the Anthropic API key (anthropic_api_key),
-- which overrides the ANTHROPIC_API_KEY env when set. Secret values live here on
-- the scout-data volume and are never returned to the browser.
CREATE TABLE settings (
    key        TEXT NOT NULL PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
