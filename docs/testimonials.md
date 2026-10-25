# Testimonials

Apply `20261025000200_testimonials` and `20261026000100_testimonial_ratings` to the production database using `prisma migrate deploy` before deploying the updated backend. Back up and test on a Neon branch first. Do not use migrate reset.

The landing page shows the six most recently created testimonials. The public `/?view=testimonials` page loads 12 at a time, with cursor-based Load more. Long reviews expand individually with Read more. There are no fabricated reviews. Authenticated users can publish one testimonial (10-600 characters), update it, and delete it. The form requires a 1-5 star rating and explicit consent. Display names, review text, ratings, and the author's account creation month/year are public; emails, usernames, user IDs, exact membership timestamps, avatars, and financial data are not returned by this endpoint.

Existing reviews keep a null rating until their authors choose one. For backwards compatibility, older API clients may omit rating; an update without rating preserves the existing value. Provided ratings must be integers between 1 and 5. A database check constraint also enforces this range. Public pagination validates limits/cursors and uses creation time plus ID to avoid duplicate ordering on tied timestamps.

Reviews publish immediately; an administrator moderation interface is not included. Users should not submit sensitive information. Backend rate limits constrain submissions, and all writes use the current session's user ID, not a client-supplied owner. The server's existing origin check applies to these routes. Text is rendered with React's normal escaping, not HTML.

Deleting a testimonial removes it from subsequent API responses. Copies already viewed or captured by others cannot be recalled. Editing a profile display name also changes the public author name.
