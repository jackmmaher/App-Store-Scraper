"""CSS extraction schemas for App Store pages."""

# Schema for extracting reviews from App Store
APP_STORE_REVIEW_SCHEMA = {
    "name": "App Store Reviews",
    "baseSelector": ".we-customer-review",
    "fields": [
        {
            "name": "rating",
            "selector": "figure.we-star-rating",
            "attribute": "aria-label",
            "transform": "extract_rating",  # Custom transform to parse "X out of 5"
        },
        {
            "name": "title",
            "selector": ".we-customer-review__title",
            "type": "text",
        },
        {
            "name": "content",
            "selector": ".we-customer-review__body",
            "type": "text",
        },
        {
            "name": "author",
            "selector": ".we-customer-review__user",
            "type": "text",
        },
        {
            "name": "date",
            "selector": ".we-customer-review__date",
            "type": "text",
        },
        {
            "name": "version",
            "selector": ".we-customer-review__version",
            "type": "text",
        },
    ],
}

# Schema for extracting What's New / version history
APP_STORE_WHATS_NEW_SCHEMA = {
    "name": "App Store Version History",
    "baseSelector": ".version-history__item",
    "fields": [
        {
            "name": "version",
            "selector": ".version-history__item__version",
            "type": "text",
        },
        {
            "name": "release_date",
            "selector": ".version-history__item__date",
            "type": "text",
        },
        {
            "name": "release_notes",
            "selector": ".version-history__item__release-notes",
            "type": "text",
        },
    ],
}

# Schema for extracting privacy labels
APP_STORE_PRIVACY_SCHEMA = {
    "name": "App Store Privacy Labels",
    "baseSelector": ".app-privacy__card",
    "fields": [
        {
            "name": "category",
            "selector": ".app-privacy__card-header",
            "type": "text",
        },
        {
            "name": "data_types",
            "selector": ".app-privacy__data-category-heading",
            "type": "list",
        },
        {
            "name": "purposes",
            "selector": ".app-privacy__purpose",
            "type": "list",
        },
    ],
}

# Schema for the main app page
APP_STORE_APP_SCHEMA = {
    "name": "App Store App Details",
    "fields": [
        {
            "name": "app_name",
            "selector": "h1.product-header__title",
            "type": "text",
        },
        {
            "name": "subtitle",
            "selector": ".product-header__subtitle",
            "type": "text",
        },
        {
            "name": "developer",
            "selector": ".product-header__identity a.link",
            "type": "text",
        },
        {
            "name": "rating",
            "selector": ".we-rating-count",
            "type": "text",
        },
        {
            "name": "price",
            "selector": ".app-header__list__item--price",
            "type": "text",
        },
        {
            "name": "category",
            "selector": ".information-list__item__link[href*='genre']",
            "type": "text",
        },
        {
            "name": "age_rating",
            "selector": ".information-list__item__link[href*='age']",
            "type": "text",
        },
        {
            "name": "description",
            "selector": ".section__description .we-truncate__child",
            "type": "text",
        },
        {
            "name": "whats_new",
            "selector": ".whats-new__content .we-truncate__child",
            "type": "text",
        },
        {
            "name": "current_version",
            "selector": ".whats-new__latest__version",
            "type": "text",
        },
    ],
}
