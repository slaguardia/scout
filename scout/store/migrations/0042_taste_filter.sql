-- The structured pre-filter rules (taste.toml's content — location, headcount,
-- vertical include/exclude, funding stage) now live in the DB as a singleton
-- row, edited from the dashboard like the playbook / doctrine / template. They
-- used to be a committed file baked into the image, invisible and uneditable on
-- a live deployment. Empty/absent content means "use the compiled-in default"
-- (internal/filter.DefaultTasteTOML). The value is raw TOML text.
CREATE TABLE taste_filter (
    key        TEXT NOT NULL PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
