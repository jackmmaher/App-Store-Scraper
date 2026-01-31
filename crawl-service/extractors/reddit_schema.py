"""CSS extraction schemas for Reddit pages."""

# Schema for extracting Reddit posts from search results (old.reddit.com)
REDDIT_POST_SCHEMA = {
    "name": "Reddit Search Results",
    "baseSelector": ".search-result, .thing.link",
    "fields": [
        {
            "name": "id",
            "attribute": "data-fullname",
            "transform": "remove_prefix_t3_",
        },
        {
            "name": "title",
            "selector": "a.search-title, a.title",
            "type": "text",
        },
        {
            "name": "url",
            "selector": "a.search-title, a.title",
            "attribute": "href",
        },
        {
            "name": "subreddit",
            "selector": "a.search-subreddit-link, a.subreddit",
            "type": "text",
        },
        {
            "name": "author",
            "selector": "a.author",
            "type": "text",
        },
        {
            "name": "score",
            "selector": ".search-score, .score.unvoted",
            "type": "text",
        },
        {
            "name": "num_comments",
            "selector": "a.search-comments, a.comments",
            "type": "text",
        },
        {
            "name": "content",
            "selector": ".search-result-body, .md",
            "type": "text",
        },
        {
            "name": "flair",
            "selector": ".linkflairlabel, .flair",
            "type": "text",
        },
        {
            "name": "created_at",
            "selector": "time",
            "attribute": "datetime",
        },
    ],
}

# Schema for extracting comments from a Reddit post page
REDDIT_COMMENT_SCHEMA = {
    "name": "Reddit Comments",
    "baseSelector": ".comment",
    "fields": [
        {
            "name": "id",
            "attribute": "data-fullname",
            "transform": "remove_prefix_t1_",
        },
        {
            "name": "author",
            "selector": "a.author",
            "type": "text",
        },
        {
            "name": "content",
            "selector": ".md",
            "type": "text",
        },
        {
            "name": "score",
            "selector": ".score.unvoted",
            "type": "text",
        },
        {
            "name": "created_at",
            "selector": "time",
            "attribute": "datetime",
        },
        {
            "name": "depth",
            "attribute": "data-depth",
        },
    ],
}

# Schema for Reddit post page (full post content)
REDDIT_POST_PAGE_SCHEMA = {
    "name": "Reddit Post Page",
    "fields": [
        {
            "name": "title",
            "selector": ".thing.link .title a",
            "type": "text",
        },
        {
            "name": "content",
            "selector": ".thing.link .usertext-body .md",
            "type": "text",
        },
        {
            "name": "author",
            "selector": ".thing.link .author",
            "type": "text",
        },
        {
            "name": "score",
            "selector": ".thing.link .score",
            "type": "text",
        },
        {
            "name": "upvote_ratio",
            "selector": ".upvote-ratio",
            "type": "text",
        },
        {
            "name": "created_at",
            "selector": ".thing.link time",
            "attribute": "datetime",
        },
        {
            "name": "subreddit",
            "selector": ".thing.link .subreddit",
            "type": "text",
        },
        {
            "name": "flair",
            "selector": ".thing.link .linkflairlabel",
            "type": "text",
        },
    ],
}

# Common subreddits for app-related discussions
RELEVANT_SUBREDDITS = [
    # iOS/Apple
    "iphone",
    "ios",
    "apple",
    "iosgaming",
    "shortcuts",

    # Android
    "androidapps",
    "android",

    # General apps
    "apps",
    "AppHookup",
    "apphub",

    # Productivity
    "productivity",
    "gtd",
    "Notion",
    "Obsidian",
    "todoist",

    # Business/Startups
    "startups",
    "Entrepreneur",
    "SideProject",
    "IndieHackers",
    "SaaS",

    # Development
    "iOSProgramming",
    "SwiftUI",
    "androiddev",
    "webdev",
    "AppIdeas",

    # Specific niches
    "photography",
    "videography",
    "fitness",
    "loseit",
    "budgetfood",
    "personalfinance",
    "meditation",
    "language_learning",
]
